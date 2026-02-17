import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { SerialPort } from "serialport";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

let mainWindow = null;
let activePort = null;
let readBuffer = "";
let validFrameStreak = 0;
let portConfig = {
  expectedChannels: 0,
  minValidFrames: 1,
  includeTimestamp: false
};

const emitToRenderer = (channel, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
};

const parseLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const delimiter = trimmed.includes("\t") ? "\t" : ",";
  const chunks = trimmed
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (chunks.length === 0) {
    return null;
  }

  const values = chunks.map((part) => Number(part));
  if (values.some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    delimiter,
    values,
    raw: trimmed
  };
};

const parseWindowsPortNames = (text) => {
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^COM\d+$/i.test(line))
    .map((pathName) => pathName.toUpperCase());
};

const listWindowsPortsFallback = async () => {
  if (process.platform !== "win32") {
    return [];
  }

  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      "[System.IO.Ports.SerialPort]::GetPortNames()"
    ]);

    return parseWindowsPortNames(stdout).map((portPath) => ({
      path: portPath,
      manufacturer: "",
      serialNumber: ""
    }));
  } catch (_error) {
    return [];
  }
};

const normalizePort = (port) => ({
  path: port.path,
  manufacturer: port.manufacturer || "",
  serialNumber: port.serialNumber || ""
});

const listAllPorts = async () => {
  const serialPorts = await SerialPort.list();
  const fallbackPorts = await listWindowsPortsFallback();
  const merged = new Map();

  serialPorts.map(normalizePort).forEach((port) => {
    merged.set(port.path.toUpperCase(), port);
  });

  fallbackPorts.forEach((port) => {
    if (!merged.has(port.path.toUpperCase())) {
      merged.set(port.path.toUpperCase(), port);
    }
  });

  return Array.from(merged.values()).sort((left, right) =>
    left.path.localeCompare(right.path, undefined, { numeric: true })
  );
};

const handleIncomingChunk = (chunk) => {
  readBuffer += chunk.toString("utf8");

  const lines = readBuffer.split(/\r?\n/);
  readBuffer = lines.pop() || "";

  lines.forEach((line) => {
    emitToRenderer("serial:raw-line", line);

    const parsed = parseLine(line);
    if (!parsed) {
      validFrameStreak = 0;
      return;
    }

    if (
      portConfig.expectedChannels > 0 &&
      parsed.values.length !== portConfig.expectedChannels
    ) {
      validFrameStreak = 0;
      return;
    }

    validFrameStreak += 1;
    if (validFrameStreak < portConfig.minValidFrames) {
      return;
    }

    emitToRenderer("serial:frame", {
      ...parsed,
      timestamp: Date.now(),
      includeTimestamp: portConfig.includeTimestamp
    });
  });
};

const cleanupPort = async () => {
  if (!activePort) {
    return;
  }

  activePort.removeAllListeners("data");
  activePort.removeAllListeners("error");
  activePort.removeAllListeners("close");

  if (activePort.isOpen) {
    await new Promise((resolve) => activePort.close(() => resolve()));
  }

  activePort = null;
  readBuffer = "";
  validFrameStreak = 0;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
};

ipcMain.handle("serial:list", async () => {
  return listAllPorts();
});

ipcMain.handle("serial:open", async (_event, options) => {
  await cleanupPort();

  portConfig = {
    expectedChannels: Number(options.expectedChannels || 0),
    minValidFrames: Math.max(1, Number(options.minValidFrames || 1)),
    includeTimestamp: Boolean(options.includeTimestamp)
  };

  activePort = new SerialPort({
    path: options.path,
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    parity: options.parity,
    stopBits: options.stopBits,
    autoOpen: false
  });

  activePort.on("data", handleIncomingChunk);
  activePort.on("error", (error) => {
    emitToRenderer("serial:status", {
      type: "error",
      message: error.message
    });
  });
  activePort.on("close", () => {
    emitToRenderer("serial:status", {
      type: "closed",
      message: "Puerto cerrado"
    });
  });

  await new Promise((resolve, reject) => {
    activePort.open((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  emitToRenderer("serial:status", {
    type: "open",
    message: `Conectado a ${options.path}`
  });

  return { ok: true };
});

ipcMain.handle("serial:close", async () => {
  await cleanupPort();
  emitToRenderer("serial:status", {
    type: "closed",
    message: "Puerto desconectado"
  });
  return { ok: true };
});

ipcMain.handle("serial:send", async (_event, message) => {
  if (!activePort || !activePort.isOpen) {
    return { ok: false, error: "Port not open" };
  }

  await new Promise((resolve, reject) => {
    activePort.write(message, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async () => {
  await cleanupPort();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
