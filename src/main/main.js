import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SerialPort } from "serialport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (isDev) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
};

let activePort = null;

ipcMain.handle("serial:list", async () => {
  const ports = await SerialPort.list();
  return ports.map((port) => ({
    path: port.path,
    manufacturer: port.manufacturer || "",
    serialNumber: port.serialNumber || ""
  }));
});

ipcMain.handle("serial:open", async (_event, options) => {
  if (activePort) {
    await new Promise((resolve) => activePort.close(resolve));
    activePort = null;
  }

  activePort = new SerialPort({
    path: options.path,
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    parity: options.parity,
    stopBits: options.stopBits,
    autoOpen: false
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

  return { ok: true };
});

ipcMain.handle("serial:close", async () => {
  if (!activePort) {
    return { ok: true };
  }
  await new Promise((resolve) => activePort.close(resolve));
  activePort = null;
  return { ok: true };
});

ipcMain.handle("serial:send", async (_event, message) => {
  if (!activePort) {
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
