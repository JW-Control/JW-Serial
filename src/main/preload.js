import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jwSerial", {
  version: "0.1.0",
  listPorts: () => ipcRenderer.invoke("serial:list"),
  openPort: (options) => ipcRenderer.invoke("serial:open", options),
  closePort: () => ipcRenderer.invoke("serial:close"),
  sendMessage: (message) => ipcRenderer.invoke("serial:send", message),
  onFrame: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("serial:frame", wrapped);
    return () => ipcRenderer.removeListener("serial:frame", wrapped);
  },
  onRawLine: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("serial:raw-line", wrapped);
    return () => ipcRenderer.removeListener("serial:raw-line", wrapped);
  },
  onStatus: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("serial:status", wrapped);
    return () => ipcRenderer.removeListener("serial:status", wrapped);
  }
});
