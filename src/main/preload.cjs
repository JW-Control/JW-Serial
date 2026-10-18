const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jwSerial", {
  version: "0.1.0",
  listPorts: () => ipcRenderer.invoke("serial:list"),
  openPort: (options) => ipcRenderer.invoke("serial:open", options),
  closePort: () => ipcRenderer.invoke("serial:close"),
  sendMessage: (message) => ipcRenderer.invoke("serial:send", message),
  saveConfigFile: (payload) => ipcRenderer.invoke("config:save-file", payload),
  loadConfigFile: () => ipcRenderer.invoke("config:load-file"),
  chooseCaptureDirectory: () => ipcRenderer.invoke("capture:choose-directory"),
  openCaptureDirectory: (directory) => ipcRenderer.invoke("capture:open-directory", directory),
  appendSessionEvent: (options) => ipcRenderer.invoke("session:append-event", options),
  capturePlot: (options) => ipcRenderer.invoke("capture:plot", options),
  savePlotImage: (options) => ipcRenderer.invoke("capture:save-plot-image", options),
  onFrames: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("serial:frames", wrapped);
    return () => ipcRenderer.removeListener("serial:frames", wrapped);
  },
  onRawLines: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("serial:raw-lines", wrapped);
    return () => ipcRenderer.removeListener("serial:raw-lines", wrapped);
  },
  onStatus: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("serial:status", wrapped);
    return () => ipcRenderer.removeListener("serial:status", wrapped);
  }
});
