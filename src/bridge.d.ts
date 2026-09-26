import type { Project } from "./core/model";
export interface DesktopAPI {
  feedback: (method:"GET"|"POST",path:string,body?:unknown,files?:{bytes:Uint8Array;type:string}[]) => Promise<{status:number;data:any}>;
  warehouseCheck(address: {host:string;port:number}): Promise<import("../electron/warehouse-printer").PrinterInfo>;
  warehouseSend(address: {host:string;port:number}, zpl:string, dpi:number): Promise<{sent:true;pages:number}>;
  homePair: import("./home/pairing").PairRequest;
  homeCapabilities(): Promise<{ voice: boolean; country?: string }>;
  homeVoice(
    body: unknown,
  ): Promise<{
    items: import("./home/core").HomeItem[];
    language: string;
    bilingual: boolean;
  }>;
  setLanguage(language: string): Promise<void>;
  security(): {
    contextIsolation: boolean;
    sandbox: boolean;
    nodeIntegration: boolean;
  };
  info(): Promise<{
    platform: string;
    version: string;
    locale: string;
    language: string;
    dataPath: string;
  }>;
  openProject(): Promise<{ project: Project; name: string } | null>;
  saveProject(project: Project): Promise<string | null>;
  loadLibrary(): Promise<Project[]>;
  saveLibrary(projects: Project[]): Promise<void>;
  recover(): Promise<Project | null>;
  autosave(project: Project): Promise<void>;
  importTable(): Promise<{ name: string; text: string } | null>;
  saveFile(payload: {
    name: string;
    bytes: Uint8Array;
    extension: string;
  }): Promise<string | null>;
  print(payload: {
    html: string;
    width: number;
    height: number;
    pdf: boolean;
    name: string;
  }): Promise<string | null>;
  clipboardText(text: string): Promise<void>;
  clipboardImage(bytes: Uint8Array): Promise<void>;
  menu(callback: (action: string) => void): () => void;
}
declare global {
  interface Window {
    desktop: DesktopAPI;
  }
}
