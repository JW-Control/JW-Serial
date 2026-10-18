import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import os from "node:os";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { SerialPort } from "serialport";
import { countDataValues, createLineFilter, parseLine } from "../shared/serialProtocol.js";
import { parseRecordingFile } from "./recordingParser.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const appIconPath = path.join(__dirname, "../../build/icon.ico");

const MAX_LINE_BUFFER_CHARS = 64 * 1024;
const MAX_RAW_LINES_PER_BATCH = 400;
const SERIAL_BATCH_MS = 16;

let mainWindow = null;
let activePort = null;
let readBuffer = "";
let validFrameStreak = 0;
let pendingFrames = [];
let pendingRawLines = [];
let droppedRawLines = 0;
let serialBatchTimer = null;
let isQuitting = false;
let portConfig = {
  expectedChannels: 0,
  minValidFrames: 1,
  includeTimestamp: false,
  includeSequenceCounter: false
};
let acceptLine = () => true;
const captureCounters = new Map();
let recording = null;

// Monotonic, sub-millisecond clock expressed as epoch milliseconds. Unlike
// Date.now() it never jumps when the OS adjusts the wall clock.
const monotonicNow = () => performance.timeOrigin + performance.now();

const applyPortConfig = (options = {}) => {
  portConfig = {
    expectedChannels: Math.max(0, Number(options.expectedChannels ?? portConfig.expectedChannels) || 0),
    minValidFrames: Math.max(1, Number(options.minValidFrames ?? portConfig.minValidFrames) || 1),
    includeTimestamp: Boolean(options.includeTimestamp ?? portConfig.includeTimestamp),
    includeSequenceCounter: Boolean(options.includeSequenceCounter ?? portConfig.includeSequenceCounter)
  };
  if ("serialFilterMode" in options || "serialFilterPatterns" in options) {
    acceptLine = createLineFilter(options.serialFilterMode, options.serialFilterPatterns);
  }
};

const emitToRenderer = (channel, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
};

const flushSerialBatch = () => {
  serialBatchTimer = null;
  if (pendingRawLines.length || droppedRawLines) {
    emitToRenderer("serial:raw-lines", { lines: pendingRawLines, dropped: droppedRawLines });
    pendingRawLines = [];
    droppedRawLines = 0;
  }
  if (pendingFrames.length) {
    emitToRenderer("serial:frames", pendingFrames);
    pendingFrames = [];
  }
};

const scheduleSerialBatch = () => {
  if (!serialBatchTimer) {
    serialBatchTimer = setTimeout(flushSerialBatch, SERIAL_BATCH_MS);
  }
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

const pushRawLine = (line) => {
  // The monitor only shows the most recent lines; cap the batch so a fast
  // device cannot flood the IPC channel with text nobody will see.
  if (pendingRawLines.length >= MAX_RAW_LINES_PER_BATCH) {
    pendingRawLines.shift();
    droppedRawLines += 1;
  }
  pendingRawLines.push(line);
};

const handleIncomingChunk = (chunk) => {
  const receivedAt = monotonicNow();
  readBuffer += chunk.toString("utf8");

  const lines = readBuffer.split(/\r?\n/);
  readBuffer = lines.pop() || "";
  if (readBuffer.length > MAX_LINE_BUFFER_CHARS) {
    // A device that never sends a newline must not grow memory unbounded.
    pushRawLine(`[JW-Serial] Línea descartada: más de ${MAX_LINE_BUFFER_CHARS} caracteres sin salto de línea.`);
    readBuffer = "";
  }

  for (const line of lines) {
    pushRawLine(line);

    if (!acceptLine(line)) {
      continue;
    }

    const parsed = parseLine(line);
    if (!parsed) {
      validFrameStreak = 0;
      continue;
    }

    if (portConfig.expectedChannels > 0 && countDataValues(parsed, portConfig) !== portConfig.expectedChannels) {
      validFrameStreak = 0;
      continue;
    }

    validFrameStreak += 1;
    if (validFrameStreak < portConfig.minValidFrames) {
      continue;
    }

    parsed.timestamp = receivedAt;
    pendingFrames.push(parsed);
  }

  if (lines.length) {
    scheduleSerialBatch();
  }
};

const cleanupPort = async () => {
  if (serialBatchTimer) {
    clearTimeout(serialBatchTimer);
  }
  flushSerialBatch();
  readBuffer = "";
  validFrameStreak = 0;
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
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  applyPortConfig(options);

  const port = new SerialPort({
    path: options.path,
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    parity: options.parity,
    stopBits: options.stopBits,
    autoOpen: false
  });

  try {
    await new Promise((resolve, reject) => {
      port.open((error) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    port.removeAllListeners();
    return { ok: false, error: error?.message || String(error) };
  }

  activePort = port;
  port.on("data", handleIncomingChunk);
  port.on("error", (error) => {
    emitToRenderer("serial:status", {
      type: "error",
      message: error.message
    });
  });
  port.on("close", () => {
    if (activePort === port) {
      emitToRenderer("serial:status", {
        type: "closed",
        message: "Puerto cerrado"
      });
    }
  });

  emitToRenderer("serial:status", {
    type: "open",
    message: `Conectado a ${options.path}`
  });

  return { ok: true };
});

ipcMain.handle("serial:update-config", async (_event, options) => {
  applyPortConfig(options || {});
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
    return { ok: false, error: "Puerto no conectado" };
  }

  // Text, or { bytes: number[] } for binary commands.
  const data = Array.isArray(message?.bytes) ? Buffer.from(message.bytes) : message;
  await new Promise((resolve, reject) => {
    activePort.write(data, (error) => {
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

const timestampForFile = () => {
  const now = new Date();
  return `${pad2(now.getFullYear() % 100)}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
};

const closeRecording = () =>
  new Promise((resolve) => {
    if (!recording) {
      resolve(null);
      return;
    }
    const { stream, filePath } = recording;
    recording = null;
    stream.end(() => resolve(filePath));
  });

ipcMain.handle("record:start", async (_event, options) => {
  await closeRecording();
  const baseDirectory = options?.directory;
  if (!baseDirectory) {
    return { ok: false, error: "Elige una carpeta de capturas para guardar las grabaciones." };
  }
  const label = sanitizePathPart(options?.label);
  const directory = options?.useSubfolder && label ? path.join(baseDirectory, label) : baseDirectory;
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${label ? `${label}_` : ""}Datos_${timestampForFile()}.csv`);
  const stream = createWriteStream(filePath, { flags: "a", encoding: "utf8" });
  await new Promise((resolve, reject) => {
    stream.once("open", resolve);
    stream.once("error", reject);
  });
  stream.on("error", (error) => {
    emitToRenderer("serial:status", { type: "record-error", message: `Error de grabación: ${error.message}` });
  });
  stream.write(`${options.header.map(csvCell).join(",")}\n`);
  recording = { stream, filePath };
  return { ok: true, filePath };
});

ipcMain.handle("record:write", async (_event, text) => {
  if (!recording) {
    return { ok: false };
  }
  recording.stream.write(text);
  return { ok: true };
});

ipcMain.handle("record:stop", async () => {
  const filePath = await closeRecording();
  return { ok: true, filePath };
});

ipcMain.handle("record:load", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Abrir grabación",
    properties: ["openFile"],
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }
  return parseRecordingFile(result.filePaths[0]);
});

const renderHtmlToPdf = async (htmlPath) => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await window.loadFile(htmlPath);
    return await window.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
  } finally {
    window.destroy();
  }
};

ipcMain.handle("report:save", async (_event, options) => {
  const label = sanitizePathPart(options?.label);
  const fileBase = `${label ? `${label}_` : ""}Reporte_${timestampForFile()}`;
  const extension = options?.format === "html" ? "html" : "pdf";
  let filePath;
  if (options?.directory) {
    const directory = options.useSubfolder && label ? path.join(options.directory, label) : options.directory;
    await fs.mkdir(directory, { recursive: true });
    filePath = path.join(directory, `${fileBase}.${extension}`);
  } else {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Guardar reporte",
      defaultPath: `${fileBase}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    filePath = result.filePath;
  }

  if (extension === "html") {
    await fs.writeFile(filePath, options.html, "utf8");
    return { ok: true, filePath };
  }
  const tempPath = path.join(os.tmpdir(), `jw-serial-report-${Date.now()}.html`);
  await fs.writeFile(tempPath, options.html, "utf8");
  try {
    await fs.writeFile(filePath, await renderHtmlToPdf(tempPath));
  } finally {
    fs.unlink(tempPath).catch(() => {});
  }
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

app.on("before-quit", (event) => {
  if (isQuitting || (!activePort && !recording)) {
    return;
  }
  // Electron does not await async listeners: hold the quit until the port is
  // closed so the OS handle is released cleanly.
  event.preventDefault();
  isQuitting = true;
  Promise.allSettled([cleanupPort(), closeRecording()]).finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
