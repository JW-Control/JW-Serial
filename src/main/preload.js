import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("jwSerial", {
  version: "0.1.0"
});
