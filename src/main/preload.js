import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jwSerial", {
  version: "0.1.0",
  listPorts: () => ipcRenderer.invoke("serial:list"),
  openPort: (options) => ipcRenderer.invoke("serial:open", options),
  closePort: () => ipcRenderer.invoke("serial:close"),
  sendMessage: (message) => ipcRenderer.invoke("serial:send", message)
});
