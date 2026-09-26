import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  feedback: (method:unknown,path:unknown,body?:unknown,files?:unknown) => ipcRenderer.invoke("feedback:request",method,path,body,files),
  warehouseCheck: (address: unknown) => ipcRenderer.invoke("warehouse:check", address),
  warehouseSend: (address: unknown, zpl: string, dpi: number) => ipcRenderer.invoke("warehouse:send", address, zpl, dpi),
  homePair: (method: string, path: string, token?: string, body?: unknown) => ipcRenderer.invoke("home:pair", method, path, token, body),
  homeCapabilities: () => ipcRenderer.invoke("home:capabilities"),
  homeVoice: (body: unknown) => ipcRenderer.invoke("home:voice", body),
  security: () => ({
    contextIsolation: process.contextIsolated,
    sandbox: process.sandboxed,
    nodeIntegration: false,
  }),
  setLanguage: (language: string) =>
    ipcRenderer.invoke("language:set", language),
  info: () => ipcRenderer.invoke("info"),
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (p: unknown) => ipcRenderer.invoke("project:save", p),
  loadLibrary: () => ipcRenderer.invoke("library:load"),
  saveLibrary: (p: unknown) => ipcRenderer.invoke("library:save", p),
  recover: () => ipcRenderer.invoke("recover"),
  autosave: (p: unknown) => ipcRenderer.invoke("autosave", p),
  importTable: () => ipcRenderer.invoke("table:import"),
  saveFile: (p: unknown) => ipcRenderer.invoke("file:save", p),
  print: (p: unknown) => ipcRenderer.invoke("print", p),
  clipboardText: (p: unknown) => ipcRenderer.invoke("clipboard:text", p),
  clipboardImage: (p: unknown) => ipcRenderer.invoke("clipboard:image", p),
  menu: (callback: (action: string) => void) => {
    const listener = (_: unknown, action: string) => callback(action);
    ipcRenderer.on("menu", listener);
    return () => ipcRenderer.removeListener("menu", listener);
  },
});
