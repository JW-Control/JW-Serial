import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs/promises";
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
const appIconPath = path.join(__dirname, "../../build/icon.ico");

let mainWindow = null;
let activePort = null;
let readBuffer = "";
let validFrameStreak = 0;
let portConfig = {
  expectedChannels: 0,
  minValidFrames: 1,
  includeTimestamp: false,
  serialFilterMode: "none",
  serialFilterPatterns: ""
};
const captureCounters = new Map();

const emitToRenderer = (channel, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
};

const normalizeSerialFilterPatterns = (patterns) =>
  String(patterns || "")
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesSerialFilterPattern = (line, pattern) => {
  if (!pattern) {
    return false;
  }

  if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
    try {
      return new RegExp(pattern.slice(1, -1)).test(line);
    } catch (_error) {
      return false;
    }
  }

  if (pattern.includes("*")) {
    const expression = pattern
      .split("*")
      .map(escapeRegExp)
      .join(".*");
    return new RegExp(expression).test(line);
  }

  return line.startsWith(pattern);
};

const shouldAcceptSerialLine = (line) => {
  const mode = portConfig.serialFilterMode || "none";
  const patterns = normalizeSerialFilterPatterns(portConfig.serialFilterPatterns);

  if (mode === "none" || patterns.length === 0) {
    return true;
  }

  const matches = patterns.some((pattern) => matchesSerialFilterPattern(line, pattern));
  return mode === "accept" ? matches : !matches;
};

const parseLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const keyValueChunks = trimmed
    .split(/[,\t;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const keyValuePairs = keyValueChunks
    .map((part) => part.match(/^([^:=,\t]+)\s*[:=]\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i))
    .filter(Boolean);

  if (keyValuePairs.length > 0 && keyValuePairs.length === keyValueChunks.length) {
    return {
      delimiter: ",",
      names: keyValuePairs.map((match) => match[1].trim()),
      values: keyValuePairs.map((match) => Number(match[2])),
      raw: trimmed
    };
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

const sanitizePathPart = (value) =>
  String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^-+|-+$/g, "");

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const pad2 = (value) => String(value).padStart(2, "0");

const buildCapturePath = (options) => {
  const now = new Date();
  const timestamp = [
    pad2(now.getFullYear() % 100),
    pad2(now.getMonth() + 1),
    pad2(now.getDate())
  ].join("") + "-" + [
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds())
  ].join("");
  const label = sanitizePathPart(options?.label);
  const useSubfolder = Boolean(options?.useSubfolder && label);
  const usePrefix = Boolean(options?.usePrefix && label && !useSubfolder);
  const targetDirectory = useSubfolder ? path.join(options.directory, label) : options.directory;
  const plotNumber = Math.max(1, Number(options?.plotNumber || String(options?.title || "").match(/\d+/)?.[0] || 1));
  const counterKey = `${targetDirectory}|${timestamp}`;
  const counter = captureCounters.get(counterKey) || 0;
  captureCounters.set(counterKey, counter + 1);
  const counterText = pad2(counter);
  const plotName = `Plot${pad2(plotNumber)}`;
  const fileBase = `${usePrefix ? `${label}_` : ""}${plotName}_${timestamp}-${counterText}`;

  return {
    directory: targetDirectory,
    filePath: path.join(targetDirectory, `${fileBase}.png`)
  };
};

const handleIncomingChunk = (chunk) => {
  readBuffer += chunk.toString("utf8");

  const lines = readBuffer.split(/\r?\n/);
  readBuffer = lines.pop() || "";

  lines.forEach((line) => {
    emitToRenderer("serial:raw-line", line);

    if (!shouldAcceptSerialLine(line.trim())) {
      return;
    }

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
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false
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
    includeTimestamp: Boolean(options.includeTimestamp),
    serialFilterMode: options.serialFilterMode || "none",
    serialFilterPatterns: options.serialFilterPatterns || ""
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

ipcMain.handle("config:save-file", async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Guardar configuración",
    defaultPath: `jw-serial-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  await fs.writeFile(result.filePath, payload, "utf8");
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("config:load-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Cargar configuración",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  const content = await fs.readFile(result.filePaths[0], "utf8");
  return { ok: true, filePath: result.filePaths[0], content };
});

ipcMain.handle("capture:choose-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Seleccionar carpeta de capturas",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  return { ok: true, directory: result.filePaths[0] };
});

ipcMain.handle("capture:open-directory", async (_event, directory) => {
  if (!directory) {
    return { ok: false, error: "No hay carpeta configurada." };
  }

  await fs.mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true };
});

ipcMain.handle("session:append-event", async (_event, options) => {
  const baseDirectory = options?.directory;
  const label = sanitizePathPart(options?.label);
  if (!baseDirectory || !label || !options?.useSubfolder) {
    return { ok: false, skipped: true };
  }

  const sessionDirectory = path.join(baseDirectory, label);
  await fs.mkdir(sessionDirectory, { recursive: true });
  const filePath = path.join(sessionDirectory, "session_log.csv");
  const header = "timestamp,type,detail,port,baudrate,frames,sps,lastFrameMs,captures\n";
  try {
    await fs.access(filePath);
  } catch (_error) {
    await fs.writeFile(filePath, header, "utf8");
  }

  const row = [
    new Date().toISOString(),
    options.type,
    options.detail,
    options.port,
    options.baudRate,
    options.frames,
    options.sps,
    options.lastFrameMs,
    options.captures
  ].map(csvCell).join(",");
  await fs.appendFile(filePath, `${row}\n`, "utf8");
  return { ok: true, filePath };
});

ipcMain.handle("capture:plot", async (_event, options) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "No hay ventana activa." };
  }

  const directory = options?.directory;
  const rect = options?.rect;
  if (!directory || !rect) {
    return { ok: false, error: "Faltan carpeta o área de captura." };
  }

  const image = await mainWindow.webContents.capturePage({
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  });
  const capturePath = buildCapturePath(options);
  await fs.mkdir(capturePath.directory, { recursive: true });
  const filePath = capturePath.filePath;
  await fs.writeFile(filePath, image.toPNG());
  return { ok: true, filePath };
});

ipcMain.handle("capture:save-plot-image", async (_event, options) => {
  const directory = options?.directory;
  const dataUrl = options?.dataUrl;
  if (!directory || !dataUrl) {
    return { ok: false, error: "Faltan carpeta o imagen." };
  }

  const match = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
  if (!match) {
    return { ok: false, error: "Formato de imagen inválido." };
  }

  const capturePath = buildCapturePath(options);
  await fs.mkdir(capturePath.directory, { recursive: true });
  const filePath = capturePath.filePath;
  await fs.writeFile(filePath, Buffer.from(match[1], "base64"));
  return { ok: true, filePath };
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
