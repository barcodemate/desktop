import {Feedback} from "../feedback/FeedbackPanel";
import {feedbackText} from "../feedback/feedback";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Barcode,
  Layers3,
  LayoutGrid,
  FolderHeart,
  ScanLine,
  Plus,
  FolderOpen,
  Save,
  Download,
  Printer,
  Search,
  Undo2,
  Redo2,
  ChevronRight,
  ArrowUpFromLine,
  Hash,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  X,
  Sun,
  Moon,
  Globe,
  SlidersHorizontal,
  WandSparkles,
  FileText,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  Command,
  ArrowRight,
  Settings2,
  ImagePlus,
  RotateCw,
} from "lucide-react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";
import {
  languages,
  negotiateLanguage,
  translate,
  diagnostic,
  direction,
} from "../i18n";
import {
  catalog,
  newProject,
  defaultLayout,
  rowFrom,
  safeName,
  validateProject,
  type Project,
  type Design,
  type Row,
  type LabelLayout,
  type ExportFormat,
} from "../core/model";
import { encode } from "../core/barcode";
import {
  parseTable,
  mapRows,
  sequence,
  rowsToCSV,
  labelPages,
  labelDocument,
} from "../core/batch";
import { wifi, vcard, gs1 } from "../core/assistants";
import { batchZip, imageBytes } from "./export";
import type {} from "../bridge";

import {
  readShortcuts,
  writeShortcuts,
  SHORTCUT_EVENT,
  SHORTCUT_STORE,
  shortcutKeys,
  type ShortcutId,
} from "../home/shortcuts";
import { UseCases } from "../home/UseCases";
import { Warehouse } from "../warehouse/Warehouse";
import { HomeLabels } from "../home/HomeLabels";
import { text as homeText } from "../home/i18n";

type Tab =
  "feedback" | "scenarios" | "home" | "warehouse" | "design" | "batch" | "labels" | "library" | "scan";
type Modal = "import" | "sequence" | "assistant" | "about" | null;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const presets = [
  { name: "A4 · 21 labels", ...defaultLayout() },
  {
    name: "A4 · 24 labels",
    paperWidth: 210,
    paperHeight: 297,
    width: 64,
    height: 33.9,
    columns: 3,
    rows: 8,
    marginX: 7,
    marginY: 12.9,
    gapX: 2,
    gapY: 0,
    start: 0,
    order: "rows" as const,
    guides: true,
  },
  {
    name: "US Letter · 30 labels",
    paperWidth: 215.9,
    paperHeight: 279.4,
    width: 66.675,
    height: 25.4,
    columns: 3,
    rows: 10,
    marginX: 4.7625,
    marginY: 12.7,
    gapX: 3.175,
    gapY: 0,
    start: 0,
    order: "rows" as const,
    guides: true,
  },
  {
    name: "Thermal · 100 × 150 mm",
    paperWidth: 100,
    paperHeight: 150,
    width: 100,
    height: 150,
    columns: 1,
    rows: 1,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    start: 0,
    order: "rows" as const,
    guides: false,
  },
  {
    name: "Thermal · 50 × 30 mm",
    paperWidth: 50,
    paperHeight: 30,
    width: 50,
    height: 30,
    columns: 1,
    rows: 1,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    start: 0,
    order: "rows" as const,
    guides: false,
  },
];
function initialLanguage() {
  const saved = localStorage.getItem("language");
  return saved && languages.some((l) => l.code === saved)
    ? saved
    : negotiateLanguage(navigator.languages);
}
function freshProject(language: string) {
  const project = newProject();
  project.name = translate(language, "Untitled project");
  project.design.name = translate(language, "Inventory label");
  return project;
}
const homeVoiceAPI = {
  capabilities: () => window.desktop.homeCapabilities(),
  recognize: (body: unknown) => window.desktop.homeVoice(body),
};
function App() {
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  const [focusCase, setFocusCase] = useState<ShortcutId | null>(null);
  useEffect(() => {
    const changed = (event: Event) =>
      setShortcuts((event as CustomEvent<ShortcutId[]>).detail);
    const stored = (event: StorageEvent) => {
      if (event.key === SHORTCUT_STORE || event.key === null)
        setShortcuts(readShortcuts());
    };
    window.addEventListener(SHORTCUT_EVENT, changed);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener(SHORTCUT_EVENT, changed);
      window.removeEventListener("storage", stored);
    };
  }, []);
  const [project, setProject] = useState(() => freshProject(initialLanguage())),
    [tab, setTab] = useState<Tab>("design"),
    [modal, setModal] = useState<Modal>(null),
    [language, setLanguage] = useState(initialLanguage),
    [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [toast, setToast] = useState(""),
    [failure, setFailure] = useState(""),
    [search, setSearch] = useState(""),
    [library, setLibrary] = useState<Project[]>([]),
    [saveState, setSaveState] = useState(""),
    [info, setInfo] = useState({
      version: "0.2.0",
      platform: "",
      dataPath: "",
    }),
    [format, setFormat] = useState<ExportFormat>("svg"),
    [zoom, setZoom] = useState(1),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [page, setPage] = useState(0),
    [batchPage, setBatchPage] = useState(0),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const [importText, setImportText] = useState(""),
    [hasHeader, setHasHeader] = useState(true),
    [mapping, setMapping] = useState({
      data: 0,
      name: -1,
      quantity: -1,
      type: -1,
      captionAbove: -1,
      captionBelow: -1,
    }),
    [importName, setImportName] = useState(""),
    [append, setAppend] = useState(true);
  const [seq, setSeq] = useState({
    start: "1",
    step: "1",
    count: 100,
    pad: 5,
    prefix: "MATE-",
    suffix: "",
    random: false,
  });
  const [assistant, setAssistant] = useState("wifi"),
    [assistantData, setAssistantData] = useState<Record<string, string>>({
      security: "WPA",
      gtin: "0950600013435",
    });
  const [scanImage, setScanImage] = useState(""),
    [scanResults, setScanResults] = useState<
      { format: string; text: string }[]
    >([]),
    [scanBusy, setScanBusy] = useState(false);
  const savedLanguageAtLaunch = useRef(localStorage.getItem("language"));
  const undo = useRef<Project[]>([]),
    redo = useRef<Project[]>([]),
    current = useRef(project),
    abort = useRef(new AbortController()),
    initialized = useRef(false),
    fileInput = useRef<HTMLInputElement>(null),
    logoInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const L = (
    en: string,
    _zh?: string,
    values?: Record<string, string | number>,
  ) => translate(language, en, values);
  const D = (text: string) => diagnostic(language, text);
  const notify = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  };
  const run = async (fn: () => Promise<unknown> | unknown) => {
    try {
      setFailure("");
      await fn();
    } catch (e) {
      setFailure(errorText(e));
    }
  };
  const change = (next: Project | ((p: Project) => Project)) => {
    const value = typeof next === "function" ? next(current.current) : next;
    undo.current.push(current.current);
    if (undo.current.length > 80) undo.current.shift();
    redo.current = [];
    const updated = { ...value, updatedAt: new Date().toISOString() };
    current.current = updated;
    setProject(updated);
    setSaveState("");
  };
  const design = (patch: Partial<Design>) =>
    change((p) => ({ ...p, design: { ...p.design, ...patch } }));
  const layout = (patch: Partial<LabelLayout>) =>
    change((p) => ({ ...p, layout: { ...p.layout, ...patch } }));
  const undoAction = () => {
    const p = undo.current.pop();
    if (p) {
      redo.current.push(current.current);
      current.current = p;
      setProject(p);
    }
  };
  const redoAction = () => {
    const p = redo.current.pop();
    if (p) {
      undo.current.push(current.current);
      current.current = p;
      setProject(p);
    }
  };
  const save = () =>
    run(async () => {
      const name = await window.desktop.saveProject(current.current);
      if (name) notify(L("Project saved: ", "项目已保存：") + name);
    });
  const open = () =>
    run(async () => {
      const r = await window.desktop.openProject();
      if (r) {
        change(r.project);
        setTab("design");
        notify(L("Project opened", "项目已打开"));
      }
    });
  const importFile = () =>
    run(async () => {
      const r = await window.desktop.importTable();
      if (r) {
        setImportName(r.name);
        setImportText(r.text);
        setModal("import");
      }
    });
  const addLibrary = () =>
    run(async () => {
      validateProject(project);
      const next = [structuredClone(project), ...library];
      await window.desktop.saveLibrary(next);
      setLibrary(next);
      notify(L("Saved to your library", "已保存到项目库"));
    });
  const printLabels = (pdf: boolean) =>
    run(async () => {
      setBusy("Preparing pages…");
      try {
        const html = labelDocument(project);
        const result = await window.desktop.print({
          html,
          width: project.layout.paperWidth,
          height: project.layout.paperHeight,
          pdf,
          name: safeName(project.name),
        });
        if (result)
          notify(
            pdf
              ? L("PDF saved", "PDF 已保存")
              : L("Sent to printer", "已发送到打印机"),
          );
      } finally {
        setBusy("");
      }
    });
  useEffect(() => {
    run(async () => {
      const i = await window.desktop.info();
      setInfo(i);
      if (!savedLanguageAtLaunch.current)
        setLanguage(i.language || negotiateLanguage([i.locale]));
      const [p, projects] = await Promise.all([
        window.desktop.recover(),
        window.desktop.loadLibrary(),
      ]);
      if (p) {
        current.current = p;
        setProject(p);
      } else if (!savedLanguageAtLaunch.current) {
        const fresh = freshProject(i.language || negotiateLanguage([i.locale]));
        current.current = fresh;
        setProject(fresh);
      }
      setLibrary(projects);
      initialized.current = true;
    });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    document.documentElement.lang = language;
    document.documentElement.dir = direction(language);
    void window.desktop
      .setLanguage(language)
      .catch((e) => setFailure(errorText(e)));
    localStorage.setItem("language", language);
  }, [theme, language]);
  useEffect(() => {
    if (!initialized.current) return;
    const t = setTimeout(() => {
      try {
        validateProject(project);
        window.desktop
          .autosave(project)
          .then(() => setSaveState(L("Saved on this device", "已保存在本机")))
          .catch((e) => setFailure(errorText(e)));
      } catch {
        setSaveState(L("Finish valid settings to save", "设置有效后自动保存"));
      }
    }, 900);
    return () => clearTimeout(t);
  }, [project]);
  useEffect(
    () =>
      window.desktop.menu((action) => {
        if (tab === "scenarios") return;
        if (tab === "warehouse") {
          window.dispatchEvent(new CustomEvent("warehouse-menu", {detail: action}));
          return;
        }
        if (tab === "home") {
          window.dispatchEvent(
            new CustomEvent("home-menu", { detail: action }),
          );
          return;
        }
        if (action === "new") {
          change(freshProject(language));
          setTab("design");
        }
        if (action === "open") open();
        if (action === "save") save();
        if (action === "import") importFile();
        if (action === "print") printLabels(false);
        if (action === "undo") undoAction();
        if (action === "redo") redoAction();
      }),
    [project, language, tab],
  );
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setFailure("");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("format-search")?.focus();
        setTab("design");
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  const result = useMemo(() => {
    try {
      return { value: encode(project.design), error: "" };
    } catch (e) {
      return { value: null, error: errorText(e) };
    }
  }, [project.design]);
  const [rowStatuses, setRowStatuses] = useState<string[]>([]),
    [validating, setValidating] = useState(false);
  useEffect(() => {
    if (tab !== "batch") return;
    setRowStatuses([]);
    setValidating(true);
    const worker = new Worker(new URL("/validation-worker.js", location.href), {
      type: "module",
    });
    worker.onmessage = (e) => {
      setRowStatuses(e.data.statuses);
      setValidating(!e.data.done);
    };
    worker.onerror = () => {
      setValidating(false);
      setFailure(
        L(
          "Batch validation failed. Reopen this tab to retry.",
          "批量校验失败，请重新打开此页重试。",
        ),
      );
    };
    worker.postMessage({ design: project.design, rows: project.rows });
    return () => worker.terminate();
  }, [project.design, project.rows, tab]);
  useEffect(() => {
    setBatchPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(project.rows.length / 100) - 1)),
    );
  }, [project.rows.length]);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement;
    const box = document.querySelector(".modal") as HTMLElement;
    const first = box?.querySelector(
      "button,input,select,textarea",
    ) as HTMLElement;
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const controls = Array.from(
        box.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
        ),
      ).filter((e) => e.offsetParent !== null);
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    box.addEventListener("keydown", trap);
    return () => {
      box.removeEventListener("keydown", trap);
      before?.focus();
    };
  }, [modal]);
  const labelResult = useMemo(() => {
    if (tab !== "labels") return { pages: [], error: "" };
    try {
      return { pages: labelPages(project), error: "" };
    } catch (e) {
      return { pages: [], error: errorText(e) };
    }
  }, [tab, project]);
  const table = useMemo(() => {
    try {
      return { rows: parseTable(importText), error: "" };
    } catch (e) {
      return { rows: [], error: errorText(e) };
    }
  }, [importText]);
  const seqPreview = useMemo(() => {
    try {
      return {
        rows: sequence(
          seq.start,
          Math.min(seq.count, 5),
          seq.step,
          seq.prefix,
          seq.suffix,
          seq.pad,
        ),
        error: "",
      };
    } catch (e) {
      return { rows: [], error: errorText(e) };
    }
  }, [seq]);
  const type = catalog.find((t) => t.id === project.design.type)!;
  const filtered = catalog.filter((t) =>
    `${t.name} ${t.usage} ${t.category} ${L(t.usage)} ${L(t.category)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const visibleRows = project.rows.slice(
    batchPage * 100,
    batchPage * 100 + 100,
  );
  const batchRows = selected.size
    ? project.rows.filter((r) => selected.has(r.id))
    : project.rows;
  const updateRow = (id: string, patch: Partial<Row>) =>
    change((p) => ({
      ...p,
      rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const exportSingle = () =>
    run(async () => {
      if (format === "pdf") {
        const v = encode(project.design);
        const html = `<!doctype html><meta charset="utf-8"><style>@page{size:${v.widthMm}mm ${v.heightMm}mm;margin:0}body{margin:0}</style>${v.svg}`;
        const name = await window.desktop.print({
          html,
          width: v.widthMm,
          height: v.heightMm,
          pdf: true,
          name: safeName(project.design.name || "barcode"),
        });
        if (name) notify(L("PDF saved", "PDF 已保存"));
      } else {
        const bytes = await imageBytes(project.design, format);
        const name = await window.desktop.saveFile({
          name:
            safeName(project.design.name || project.design.data) + "." + format,
          bytes,
          extension: format,
        });
        if (name) notify(L("Exported ", "已导出 ") + name);
      }
    });
  const exportBatch = () =>
    run(async () => {
      if (format === "pdf") {
        setTab("labels");
        return;
      }
      setBusy("Exporting batch");
      setProgress(0);
      abort.current = new AbortController();
      try {
        const bytes = await batchZip(
          project.design,
          batchRows,
          format,
          setProgress,
          abort.current.signal,
        );
        const name = await window.desktop.saveFile({
          name: safeName(project.name) + ".zip",
          bytes,
          extension: "zip",
        });
        if (name) notify(L("Batch exported", "批量导出完成"));
      } finally {
        setBusy("");
      }
    });
  const importRows = () =>
    run(() => {
      if (table.error) throw Error(table.error);
      if (!table.rows.length)
        throw Error(
          L("Add a CSV file or paste some rows.", "请导入 CSV 或粘贴数据。"),
        );
      const rows = mapRows(table.rows, mapping, hasHeader);
      if (rows.length + (append ? project.rows.length : 0) > 10000)
        throw Error("Maximum 10,000 rows per project.");
      change((p) => ({ ...p, rows: append ? [...p.rows, ...rows] : rows }));
      setSelected(new Set());
      setBatchPage(0);
      setModal(null);
      setTab("batch");
      notify(`${rows.length} ` + L("rows imported", "行数据已导入"));
    });
  const applyAssistant = () =>
    run(() => {
      const a = assistantData;
      let data = "",
        barcode = "qrcode";
      if (assistant === "wifi")
        data = wifi(
          a.ssid || "",
          a.password || "",
          a.security || "WPA",
          a.hidden === "true",
        );
      if (assistant === "vcard")
        data = vcard(
          a.name || "",
          a.organization || "",
          a.phone || "",
          a.email || "",
          a.url || "",
        );
      if (assistant === "gs1") {
        data = gs1(a.gtin || "", a.lot || "", a.expiry || "", a.serial || "");
        barcode = a.format || "gs1-128";
      }
      if (assistant === "url") {
        data = a.url || "";
        if (!/^https?:\/\//i.test(data))
          throw Error("Enter a complete http:// or https:// URL.");
      }
      design({ type: barcode, data });
      setModal(null);
      setTab("design");
    });
  const scan = async (file: File) => {
    if (file.size > 20_000_000) throw Error("Choose an image under 20 MB.");
    setScanBusy(true);
    try {
      const image = new Image();
      const url = URL.createObjectURL(file);
      try {
        await new Promise<void>((res, rej) => {
          image.onload = () => res();
          image.onerror = () => rej(Error("Unable to read this image."));
          image.src = url;
        });
        if (image.width * image.height > 24_000_000)
          throw Error("Image exceeds 24 megapixels.");
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        setScanImage(canvas.toDataURL("image/png"));
        const worker = new Worker(new URL("/scan-worker.js", location.href), {
          type: "module",
        });
        const results = await new Promise<{ format: string; text: string }[]>(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              worker.terminate();
              reject(Error("Recognition timed out. Try a smaller image."));
            }, 25000);
            worker.onmessage = (e) => {
              clearTimeout(timer);
              worker.terminate();
              e.data.error
                ? reject(Error(e.data.error))
                : resolve(e.data.results);
            };
            worker.onerror = () => {
              clearTimeout(timer);
              worker.terminate();
              reject(Error("Image recognition failed."));
            };
            worker.postMessage(
              canvas
                .getContext("2d")!
                .getImageData(0, 0, canvas.width, canvas.height),
            );
          },
        );
        setScanResults(results);
        if (!results.length)
          notify(
            L(
              "No readable barcode found. Try a clearer image.",
              "未找到可识别的条码，请使用更清晰的图片。",
            ),
          );
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      setScanBusy(false);
    }
  };
  const readLogo = (file: File) =>
    run(async () => {
      if (
        file.size > 3_000_000 ||
        !["image/png", "image/jpeg"].includes(file.type)
      )
        throw Error("Choose a PNG or JPEG under 3 MB.");
      const value = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(Error("Unable to read logo."));
        r.readAsDataURL(file);
      });
      design({ logo: value });
    });
  const field = (
    label: string,
    key: keyof Design,
    min: number,
    max: number,
    step = 0.1,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={project.design[key] as number}
        min={min}
        max={max}
        step={step}
        onChange={(e) => design({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  const layoutField = (
    label: string,
    key: keyof LabelLayout,
    min = 0,
    max = 1500,
    step = 0.1,
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={project.layout[key] as number}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          layout({ [key]: Number(e.target.value) });
          setPage(0);
        }}
      />
    </label>
  );
  const isScenario = tab === "scenarios" || tab === "home" || tab === "warehouse";
  const isAuxiliary = isScenario || tab === "feedback";
  const navs: [Tab, typeof Barcode, string, string][] = [
    [
      "scenarios",
      LayoutGrid,
      homeText(language, "useCases"),
      homeText(language, "useCases"),
    ],
    ["design", Barcode, "Design", "设计条码"],
    ["batch", Layers3, "Batch data", "批量数据"],
    ["labels", LayoutGrid, "Labels & print", "标签与打印"],
    ["library", FolderHeart, "Project library", "项目库"],
    ["scan", ScanLine, "Read a barcode", "识别条码"],
  ];
  return (
    <div className={navigator.maxTouchPoints > 0 ? "app-shell bm-touch" : "app-shell"}>
      <aside className="rail" inert={!!modal || !!busy}>
        <div className="brand">
          <div className="brand-mark">
            <Barcode size={27} />
          </div>
          <div>
            BarcodeMate
            <small>
              {L("YOUR EVERYDAY BARCODE STUDIO", "你的日常条码工作室")}
            </small>
          </div>
        </div>
        <div className="workspace-caption">{L("WORKSPACE", "工作空间")}</div>
        <nav>
          {navs.map(([id, Icon, en, zh]) => (
            <div key={id}>
              <button
                data-workspace={id}
                className={
                  tab === id
                    ? "nav-item active"
                    : id === "scenarios" && isScenario
                      ? "nav-item ancestor"
                      : "nav-item"
                }
                aria-current={tab === id ? "page" : undefined}
                aria-expanded={id === "scenarios" ? isScenario : undefined}
                onClick={() => setTab(id)}
              >
                <Icon size={19} />
                <span>{L(en, zh)}</span>
                {id === "batch" && project.rows.length > 0 && (
                  <b>{project.rows.length}</b>
                )}
              </button>
              {id === "scenarios" && isScenario && (
                <div className="scenario-subnav">
                  <button
                    data-workspace="home"
                    className={tab === "home" ? "nav-item active" : "nav-item"}
                    onClick={() => setTab("home")}
                    aria-current={tab === "home" ? "page" : undefined}
                  >
                    {homeText(language, "homeCategory")}
                  </button>
                  <button data-workspace="warehouse" className={tab === "warehouse" ? "nav-item active" : "nav-item"} onClick={() => setTab("warehouse")} aria-current={tab === "warehouse" ? "page" : undefined}>{homeText(language,"warehouse")}</button>
                </div>
              )}
            </div>
          ))}
          {shortcuts.map((id) => (
            <div className="bm-shortcut" data-shortcut={id} key={id}>
              <button
                className={
                  (id === "home" || id === "warehouse") && tab === id
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() => {
                  setTab(id === "home" || id === "warehouse" ? id : "scenarios");
                  setFocusCase(id);
                  requestAnimationFrame(() =>
                    document.getElementById("case-" + id)?.focus(),
                  );
                }}
              >
                {homeText(language, shortcutKeys[id])}
              </button>
              <button
                type="button"
                className="bm-shortcut-remove"
                aria-label={
                  homeText(language, "removeShortcut") +
                  ": " +
                  homeText(language, shortcutKeys[id])
                }
                title={
                  homeText(language, "removeShortcut") +
                  ": " +
                  homeText(language, shortcutKeys[id])
                }
                onClick={() => {
                  writeShortcuts(shortcuts.filter((value) => value !== id));
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        '[data-workspace="scenarios"]',
                      )
                      ?.focus(),
                  );
                }}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
        {!isAuxiliary && (
          <div className="rail-project">
            <div className="project-icon">
              <FolderOpen size={20} />
            </div>
            <small>{L("CURRENT PROJECT", "当前项目")}</small>
            <strong>{project.name}</strong>
            <span>
              {project.rows.length || 1}{" "}
              {L("records · stored locally", "条记录 · 本地保存")}
            </span>
            <button className="text-button" onClick={save}>
              {L("Save project file", "保存项目文件")} <ArrowRight size={14} />
            </button>
          </div>
        )}
        <div className="rail-bottom"><button className={tab === "feedback" ? "nav-item active" : "nav-item"} data-workspace="feedback" aria-current={tab === "feedback" ? "page" : undefined} onClick={() => setTab("feedback")}>{feedbackText(language,"nav")}</button>
          {!isAuxiliary && (
            <div className="offline">
              <span />
              {L("Offline & private", "离线使用 · 数据私有")}
            </div>
          )}
          <label
            className="app-language-picker"
            title={L("Language follows your system on first launch.")}
          >
            <Globe size={18} />
            <select
              id="language-select"
              aria-label={L("Language")}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {languages.map((choice) => (
                <option
                  key={choice.code}
                  value={choice.code}
                  lang={choice.code}
                >
                  {choice.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rail-controls">
            <button
              title={L("Switch appearance", "切换外观")}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <button
              onClick={() => setModal("about")}
              title={L("About BarcodeMate", "关于 BarcodeMate")}
            >
              v{info.version}
            </button>
          </div>
        </div>
      </aside>
      <main inert={!!modal || !!busy}>
        <header className="topbar">
          <div className="breadcrumb">
            {L("Workspace", "工作空间")}
            <ChevronRight size={15} />
            {tab === "feedback" ? <strong>{feedbackText(language,"nav")}</strong> : tab === "home" || tab === "warehouse" ? (
              <>
                <button
                  className="breadcrumb-link"
                  onClick={() => setTab("scenarios")}
                >
                  {homeText(language, "useCases")}
                </button>
                <ChevronRight size={15} />
                <strong>{homeText(language, tab === "warehouse" ? "warehouse" : "homeCategory")}</strong>
              </>
            ) : (
              <strong>
                {L(
                  navs.find((n) => n[0] === tab)![2],
                  navs.find((n) => n[0] === tab)![3],
                )}
              </strong>
            )}
          </div>
          {!isAuxiliary && (
            <div className="top-actions">
              <span className="save-state">
                <CheckCircle2 size={14} />
                {saveState || L("Local workspace", "本地工作空间")}
              </span>
              <button
                title={L("Undo", "撤销")}
                disabled={!undo.current.length}
                onClick={undoAction}
              >
                <Undo2 size={17} />
              </button>
              <button
                title={L("Redo", "重做")}
                disabled={!redo.current.length}
                onClick={redoAction}
              >
                <Redo2 size={17} />
              </button>
              <i />
              <button onClick={open}>
                <FolderOpen size={17} />
                {L("Open", "打开")}
              </button>
              <button onClick={save}>
                <Save size={17} />
                {L("Save", "保存")}
              </button>
            </div>
          )}
        </header>
        <div className="workspace">
          {!isAuxiliary && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {L(
                    "A LITTLE MORE ORDER. A LOT LESS WORK.",
                    "更有条理，更省力。",
                  )}
                </div>
                <h1>
                  {tab === "design"
                    ? L("Make your next barcode.", "设计你的下一个条码。")
                    : tab === "batch"
                      ? L(
                          "One workflow. Every barcode.",
                          "一个流程，处理所有条码。",
                        )
                      : tab === "labels"
                        ? L(
                            "From data to ready-to-print.",
                            "从数据到可打印的标签。",
                          )
                        : tab === "library"
                          ? L(
                              "Good work, ready to reuse.",
                              "保存好设计，下次直接用。",
                            )
                          : L(
                              "Find the data in any image.",
                              "读出图片里的条码。",
                            )}
                </h1>
                <p>
                  {tab === "design"
                    ? L(
                        "Precise controls. Instant preview. Everything stays on your device.",
                        "精细设置，即时预览。所有数据留在你的设备。",
                      )
                    : tab === "batch"
                      ? L(
                          "Import a list, create a sequence, and catch errors before you export.",
                          "导入列表、生成流水号，在导出之前定位错误。",
                        )
                      : tab === "labels"
                        ? L(
                            "Actual dimensions, reusable layouts, and a preview of every sheet.",
                            "真实物理尺寸、可复用排版，每一页都看得见。",
                          )
                        : tab === "library"
                          ? L(
                              "Keep complete designs, data, and print layouts together.",
                              "将设计、数据和打印布局一起保存。",
                            )
                          : L(
                              "Read barcodes locally. Images are never uploaded.",
                              "在本机识别条码，图片不会上传。",
                            )}
                </p>
              </div>
              {tab === "design" ? (
                <button
                  className="secondary"
                  onClick={() => {
                    change(freshProject(language));
                    setTab("design");
                  }}
                >
                  <Plus size={17} />
                  {L("New project", "新建项目")}
                </button>
              ) : tab === "batch" ? (
                <button className="primary" onClick={importFile}>
                  <ArrowUpFromLine size={17} />
                  {L("Import data", "导入数据")}
                </button>
              ) : tab === "labels" ? (
                <button
                  className="primary"
                  disabled={!!labelResult.error || !!busy}
                  onClick={() => printLabels(false)}
                >
                  <Printer size={17} />
                  {L("Print labels", "打印标签")}
                </button>
              ) : tab === "library" ? (
                <button className="primary" onClick={addLibrary}>
                  <Plus size={17} />
                  {L("Save current project", "保存当前项目")}
                </button>
              ) : null}
            </div>
          )}
          {failure && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={18} />
              <span>{D(failure)}</span>
              <button onClick={() => setFailure("")} aria-label={L("Close")}>
                <X size={17} />
              </button>
            </div>
          )}
          {tab === "scenarios" && (
            <UseCases
              language={language}
              onHome={() => setTab("home")}
              onWarehouse={() => setTab("warehouse")}
              shortcuts={shortcuts}
              onAdd={(id) => {
                if (!shortcuts.includes(id)) writeShortcuts([...shortcuts, id]);
              }}
              focusCase={focusCase}
            />
          )}
          {tab === "feedback" && <Feedback language={language} version={info.version} />}
          {tab === "warehouse" && <Warehouse language={language} desktop={window.desktop} />}
          {tab === "home" && (
            <HomeLabels
              language={language}
              onPrint={(html, paper, pdf) =>
                window.desktop.print({
                  html,
                  width: paper.pageWidth,
                  height: paper.pageHeight,
                  pdf,
                  name: "BarcodeMate-home",
                })
              }
              onSave={(content) =>
                window.desktop.saveFile({
                  name: "BarcodeMate-home.json",
                  bytes: new TextEncoder().encode(content),
                  extension: "json",
                })
              }
              pairingAPI={window.desktop.homePair}
              voiceAPI={homeVoiceAPI}
            />
          )}
          {tab === "design" && (
            <div className="design-grid">
              <section className="panel design-controls">
                <div className="panel-heading">
                  <span className="step">01</span>
                  <h2>{L("Your barcode", "条码内容")}</h2>
                  <button
                    className="icon-button"
                    onClick={() => setModal("assistant")}
                    title={L("Data assistant", "数据助手")}
                  >
                    <WandSparkles size={18} />
                  </button>
                </div>
                <label className="field">
                  <span>{L("Project name", "项目名称")}</span>
                  <input
                    value={project.name}
                    maxLength={200}
                    onChange={(e) =>
                      change((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    {L("Find a format", "查找格式")}
                    <kbd>{info.platform === "darwin" ? "⌘" : "Ctrl"} K</kbd>
                  </span>
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      id="format-search"
                      placeholder={L("Search 108 formats…", "搜索 108 种格式…")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>{L("Barcode format", "条码格式")}</span>
                  <select
                    value={project.design.type}
                    onChange={(e) => {
                      const t = catalog.find((t) => t.id === e.target.value)!;
                      design({
                        type: t.id,
                        data: t.sample,
                        options: "{}",
                        logo: "",
                      });
                    }}
                  >
                    {!filtered.some((t) => t.id === type.id) && (
                      <option value={type.id}>{type.name}</option>
                    )}
                    {filtered.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <small>{L(type.usage)}</small>
                </label>
                <label className="field">
                  <span>
                    {L("Barcode data", "条码数据")}
                    <button
                      className="link"
                      onClick={() => setModal("assistant")}
                    >
                      <WandSparkles size={13} />
                      {L("Assistant", "助手")}
                    </button>
                  </span>
                  <textarea
                    className="barcode-data"
                    value={project.design.data}
                    onChange={(e) => design({ data: e.target.value })}
                    rows={3}
                    spellCheck={false}
                  />
                  <small>{L(type.hint)}</small>
                </label>
                <label className="field">
                  <span>{L("File / label name", "文件 / 标签名称")}</span>
                  <input
                    value={project.design.name}
                    maxLength={200}
                    onChange={(e) => design({ name: e.target.value })}
                  />
                </label>
                <div className="panel-divider" />
                <div className="subheading">
                  <Settings2 size={16} />
                  {L("Size & output", "尺寸与输出")}
                  <span>mm</span>
                </div>
                <div className="two-fields">
                  {field(
                    L("Module width", "模块宽度"),
                    "module",
                    0.08,
                    5,
                    0.01,
                  )}
                  {field(L("Bar height", "条高"), "height", 1, 300, 1)}
                  <label className="field">
                    <span>{L("Resolution", "分辨率")}</span>
                    <select
                      value={project.design.dpi}
                      onChange={(e) => design({ dpi: Number(e.target.value) })}
                    >
                      {[96, 150, 203, 300, 600, 1200].map((n) => (
                        <option key={n} value={n}>
                          {n} DPI
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{L("Rotation", "旋转")}</span>
                    <select
                      value={project.design.rotation}
                      onChange={(e) =>
                        design({
                          rotation: Number(
                            e.target.value,
                          ) as Design["rotation"],
                        })
                      }
                    >
                      {[0, 90, 180, 270].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <details className="design-options">
                  <summary>
                    <SlidersHorizontal size={16} />
                    {L(
                      "Text, color & advanced settings",
                      "文字、颜色与高级设置",
                    )}
                  </summary>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={project.design.showText}
                      onChange={(e) => design({ showText: e.target.checked })}
                    />
                    {L("Show human-readable text", "显示条码文字")}
                  </label>
                  <div className="two-fields">
                    {field(
                      L("Font size (pt)", "字号 (pt)"),
                      "textSize",
                      5,
                      48,
                      1,
                    )}
                    <label className="field">
                      <span>{L("Alignment", "对齐")}</span>
                      <select
                        value={project.design.textAlign}
                        onChange={(e) =>
                          design({
                            textAlign: e.target.value as Design["textAlign"],
                          })
                        }
                      >
                        <option value="left">{L("Left", "左")}</option>
                        <option value="center">{L("Center", "中")}</option>
                        <option value="right">{L("Right", "右")}</option>
                      </select>
                    </label>
                  </div>
                  {(["captionAbove", "captionBelow"] as const).map((key, i) => (
                    <label key={key} className="field">
                      <span>
                        {i
                          ? L("Caption below", "下方说明")
                          : L("Caption above", "上方说明")}
                      </span>
                      <input
                        value={project.design[key]}
                        maxLength={200}
                        onChange={(e) => design({ [key]: e.target.value })}
                      />
                    </label>
                  ))}
                  <div className="two-fields">
                    {(["foreground", "background"] as const).map((key, i) => (
                      <label key={key} className="field">
                        <span>
                          {i
                            ? L("Background", "背景")
                            : L("Barcode color", "条码颜色")}
                        </span>
                        <input
                          type="color"
                          value={project.design[key]}
                          onChange={(e) => design({ [key]: e.target.value })}
                        />
                      </label>
                    ))}
                    {field(
                      L("Quiet zone · sides", "左右留白"),
                      "quietX",
                      0,
                      40,
                    )}
                    {field(
                      L("Quiet zone · top/bottom", "上下留白"),
                      "quietY",
                      0,
                      40,
                    )}
                    {field(
                      L("Bar reduction (mm)", "条宽缩减 (mm)"),
                      "reduction",
                      0,
                      0.5,
                      0.01,
                    )}
                  </div>
                  {(
                    [
                      "dotty",
                      "includeCheck",
                      "parseEscapes",
                      "hexInput",
                    ] as const
                  ).map((key, i) => (
                    <label className="check-field" key={key}>
                      <input
                        type="checkbox"
                        checked={project.design[key]}
                        onChange={(e) => design({ [key]: e.target.checked })}
                      />
                      {
                        [
                          L(
                            "Dot styling (supported formats)",
                            "圆点样式（部分格式）",
                          ),
                          L(
                            "Optional check digit (supported formats)",
                            "可选校验位（部分格式）",
                          ),
                          L(
                            "Parse encoder escape sequences",
                            "解析编码器转义序列",
                          ),
                          L("Hexadecimal byte input", "十六进制字节输入"),
                        ][i]
                      }
                    </label>
                  ))}
                  <label className="field">
                    <span>
                      {L("Encoder options (JSON)", "编码器选项 (JSON)")}
                    </span>
                    <textarea
                      value={project.design.options}
                      rows={3}
                      spellCheck={false}
                      onChange={(e) => design({ options: e.target.value })}
                    />
                    <small>
                      {L(
                        'Example: {"eclevel":"H"} for QR error correction. Unsupported options may be ignored by the encoder.',
                        '例如 {"eclevel":"H"} 设置 QR 纠错级别。编码器可能忽略不支持的选项。',
                      )}
                    </small>
                  </label>
                  <div className="button-row">
                    <button
                      className="secondary small"
                      onClick={() => logoInput.current?.click()}
                    >
                      <ImagePlus size={16} />
                      {L("Add logo", "添加标志")}
                    </button>
                    {project.design.logo && (
                      <button
                        className="secondary small"
                        onClick={() => design({ logo: "" })}
                      >
                        {L("Remove", "移除")}
                      </button>
                    )}
                  </div>
                  <input
                    hidden
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                      if (e.target.files?.[0]) readLogo(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </details>
              </section>
              <div className="preview-column">
                <section className="panel preview-panel">
                  <div className="panel-heading">
                    <span className="step">02</span>
                    <h2>{L("Live preview", "即时预览")}</h2>
                    <span className="pill">{type.name}</span>
                  </div>
                  <div className="preview-stage">
                    <div className="ruler top-ruler" />
                    <div className="ruler side-ruler" />
                    {result.value ? (
                      <div
                        className="barcode-paper"
                        style={{ transform: `scale(${zoom})` }}
                        dangerouslySetInnerHTML={{ __html: result.value.svg }}
                      />
                    ) : (
                      <div className="preview-empty">
                        <AlertTriangle size={32} />
                        <h3>
                          {L("Let’s check that data", "检查一下输入数据")}
                        </h3>
                        <p>{D(result.error)}</p>
                      </div>
                    )}
                    <div className="zoom-controls">
                      <button
                        onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                        aria-label={L("Zoom out")}
                      >
                        <ZoomOut size={16} />
                      </button>
                      <button onClick={() => setZoom(1)}>
                        {Math.round(zoom * 100)}%
                      </button>
                      <button
                        onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                        aria-label={L("Zoom in")}
                      >
                        <ZoomIn size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="preview-stats">
                    <div>
                      <span>{L("Actual size", "实际尺寸")}</span>
                      <strong>
                        {result.value
                          ? `${result.value.widthMm.toFixed(2)} × ${result.value.heightMm.toFixed(2)} mm`
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>{L("Resolution", "分辨率")}</span>
                      <strong>{project.design.dpi} DPI</strong>
                    </div>
                    <div>
                      <span>
                        {L("Printer dots / module", "每模块打印点数")}
                      </span>
                      <strong>{result.value?.pixelsPerModule ?? "—"}</strong>
                    </div>
                  </div>
                </section>
                <section className="panel readiness">
                  <div
                    className={
                      result.error ? "readiness-icon warning" : "readiness-icon"
                    }
                  >
                    {result.error ? (
                      <AlertTriangle size={22} />
                    ) : (
                      <ShieldCheck size={23} />
                    )}
                  </div>
                  <div>
                    <h3>
                      {result.error
                        ? L("Needs attention", "需要检查")
                        : L("Encoded successfully", "编码成功")}
                    </h3>
                    <p>
                      {result.value?.warnings.length
                        ? result.value.warnings.map(D).join(" ")
                        : L(
                            "Your preview is ready. Validate a real printed sample before production.",
                            "预览已生成。批量生产前，请验证真实打印样张。",
                          )}
                    </p>
                    <small>
                      {L(
                        "Design checks are not an ISO barcode quality grade.",
                        "设计检查不等于 ISO 条码质量等级。",
                      )}
                    </small>
                  </div>
                </section>
                <section className="panel export-panel">
                  <div className="panel-heading">
                    <span className="step">03</span>
                    <h2>{L("Put it to work", "开始使用")}</h2>
                  </div>
                  <div className="export-controls">
                    <label className="field">
                      <span>{L("Export format", "导出格式")}</span>
                      <select
                        value={format}
                        onChange={(e) =>
                          setFormat(e.target.value as ExportFormat)
                        }
                      >
                        {[
                          "svg",
                          "png",
                          "pdf",
                          "tiff",
                          "bmp",
                          "gif",
                          "jpeg",
                        ].map((f) => (
                          <option key={f} value={f}>
                            {f.toUpperCase()}
                            {f === "svg"
                              ? L(" · scalable vector", " · 可缩放矢量")
                              : f === "png"
                                ? L(" · lossless image", " · 无损图片")
                                : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={!result.value}
                      onClick={exportSingle}
                    >
                      <Download size={18} />
                      {L("Export barcode", "导出条码")}
                    </button>
                  </div>
                  <div className="export-links">
                    <button
                      disabled={!result.value}
                      onClick={() =>
                        run(async () => {
                          await window.desktop.clipboardImage(
                            await imageBytes(project.design, "png"),
                          );
                          notify(L("Image copied", "图片已复制"));
                        })
                      }
                    >
                      <Copy size={15} />
                      {L("Copy image", "复制图片")}
                    </button>
                    <button onClick={addLibrary}>
                      <FolderHeart size={15} />
                      {L("Save to library", "保存到项目库")}
                    </button>
                    <button
                      onClick={() => {
                        change((p) => ({
                          ...p,
                          rows: [
                            ...p.rows,
                            rowFrom(
                              p.design.data,
                              p.design.name,
                              1,
                              p.design.type,
                            ),
                          ],
                        }));
                        setTab("batch");
                      }}
                    >
                      <Layers3 size={15} />
                      {L("Add to batch", "加入批量列表")}
                    </button>
                  </div>
                </section>
                <button
                  className="workflow-card"
                  onClick={() => setTab("batch")}
                >
                  <div className="workflow-icon">
                    <Layers3 size={23} />
                  </div>
                  <div>
                    <strong>
                      {L("Have more than one?", "不止一个条码？")}
                    </strong>
                    <span>
                      {L(
                        "Import a CSV or build a sequence. Design once, export them all.",
                        "导入 CSV 或生成流水号。设计一次，批量导出。",
                      )}
                    </span>
                  </div>
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}
          {tab === "batch" && (
            <>
              <div className="metric-row">
                <div className="metric">
                  <Layers3 size={21} />
                  <div>
                    <strong>{project.rows.length}</strong>
                    <span>{L("Data rows", "数据行")}</span>
                  </div>
                </div>
                <div className="metric">
                  <CheckCircle2 size={21} />
                  <div>
                    <strong>{rowStatuses.filter((s) => !s).length}</strong>
                    <span>
                      {validating
                        ? L("Checking…", "正在检查…")
                        : L("Ready to export", "可导出")}
                    </span>
                  </div>
                </div>
                <div className="metric">
                  <AlertTriangle size={21} />
                  <div>
                    <strong>{rowStatuses.filter(Boolean).length}</strong>
                    <span>{L("Need attention", "需要检查")}</span>
                  </div>
                </div>
                <div className="metric">
                  <Printer size={21} />
                  <div>
                    <strong>
                      {project.rows.reduce((n, r) => n + r.quantity, 0)}
                    </strong>
                    <span>
                      {L("Labels including copies", "标签数量（含副本）")}
                    </span>
                  </div>
                </div>
              </div>
              <section className="panel batch-panel">
                <div className="batch-toolbar">
                  <button
                    className="secondary"
                    onClick={() => {
                      setImportName("");
                      setImportText("");
                      setModal("import");
                    }}
                  >
                    <ArrowUpFromLine size={16} />
                    {L("Paste / import", "粘贴 / 导入")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setModal("sequence")}
                  >
                    <Hash size={17} />
                    {L("Generate sequence", "生成流水号")}
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      change((p) => ({
                        ...p,
                        rows: [
                          ...p.rows,
                          rowFrom(p.design.data, "", 1, p.design.type),
                        ],
                      }))
                    }
                  >
                    <Plus size={16} />
                    {L("Add row", "添加一行")}
                  </button>
                  <div className="grow" />
                  {selected.size > 0 && (
                    <button
                      className="danger"
                      onClick={() => {
                        change((p) => ({
                          ...p,
                          rows: p.rows.filter((r) => !selected.has(r.id)),
                        }));
                        setSelected(new Set());
                      }}
                    >
                      <Trash2 size={16} />
                      {L("Delete", "删除")} {selected.size}
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() =>
                      run(async () => {
                        await window.desktop.saveFile({
                          name: safeName(project.name) + ".csv",
                          bytes: new TextEncoder().encode(
                            rowsToCSV(project.rows),
                          ),
                          extension: "csv",
                        });
                      })
                    }
                  >
                    <FileText size={16} />
                    CSV
                  </button>
                </div>
                {project.rows.length ? (
                  <>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>
                              <input
                                type="checkbox"
                                aria-label={L("Select visible rows")}
                                checked={
                                  visibleRows.length > 0 &&
                                  visibleRows.every((r) => selected.has(r.id))
                                }
                                onChange={(e) =>
                                  setSelected(
                                    e.target.checked
                                      ? new Set([
                                          ...selected,
                                          ...visibleRows.map((r) => r.id),
                                        ])
                                      : new Set(
                                          [...selected].filter(
                                            (id) =>
                                              !visibleRows.some(
                                                (r) => r.id === id,
                                              ),
                                          ),
                                        ),
                                  )
                                }
                              />
                            </th>
                            <th>#</th>
                            <th>{L("Barcode data", "条码数据")}</th>
                            <th>{L("Name / filename", "名称 / 文件名")}</th>
                            <th>{L("Copies", "份数")}</th>
                            <th>{L("Format", "格式")}</th>
                            <th>{L("Status", "状态")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((row, i) => (
                            <tr
                              key={row.id}
                              className={
                                rowStatuses[batchPage * 100 + i]
                                  ? "invalid-row"
                                  : ""
                              }
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={L(
                                    "Select row {number}",
                                    undefined,
                                    { number: batchPage * 100 + i + 1 },
                                  )}
                                  checked={selected.has(row.id)}
                                  onChange={(e) =>
                                    setSelected((s) => {
                                      const n = new Set(s);
                                      e.target.checked
                                        ? n.add(row.id)
                                        : n.delete(row.id);
                                      return n;
                                    })
                                  }
                                />
                              </td>
                              <td className="row-number">
                                {batchPage * 100 + i + 1}
                              </td>
                              <td>
                                <input
                                  aria-label={L(
                                    "Data row {number}",
                                    undefined,
                                    { number: batchPage * 100 + i + 1 },
                                  )}
                                  value={row.data}
                                  onChange={(e) =>
                                    updateRow(row.id, { data: e.target.value })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={L(
                                    "Name row {number}",
                                    undefined,
                                    { number: batchPage * 100 + i + 1 },
                                  )}
                                  value={row.name}
                                  placeholder="—"
                                  onChange={(e) =>
                                    updateRow(row.id, { name: e.target.value })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  className="quantity-input"
                                  type="number"
                                  min="1"
                                  max="10000"
                                  value={row.quantity}
                                  aria-label={L(
                                    "Copies row {number}",
                                    undefined,
                                    { number: batchPage * 100 + i + 1 },
                                  )}
                                  onChange={(e) =>
                                    updateRow(row.id, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={row.type}
                                  aria-label={L(
                                    "Format row {number}",
                                    undefined,
                                    { number: batchPage * 100 + i + 1 },
                                  )}
                                  onChange={(e) =>
                                    updateRow(row.id, { type: e.target.value })
                                  }
                                >
                                  <option value="">{type.name}</option>
                                  {catalog.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {rowStatuses[batchPage * 100 + i] ? (
                                  <span
                                    className="row-error"
                                    title={D(rowStatuses[batchPage * 100 + i])}
                                  >
                                    <AlertTriangle size={14} />
                                    {D(rowStatuses[batchPage * 100 + i])}
                                  </span>
                                ) : (
                                  <span className="row-ok">
                                    <Check size={15} />
                                    {rowStatuses[batchPage * 100 + i] ===
                                    undefined
                                      ? L("Checking…", "检查中…")
                                      : L("Ready", "就绪")}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="table-footer">
                      <span>
                        {L("Showing", "显示")} {batchPage * 100 + 1}–
                        {Math.min((batchPage + 1) * 100, project.rows.length)} /{" "}
                        {project.rows.length}
                      </span>
                      <div>
                        <button
                          disabled={batchPage === 0}
                          onClick={() => setBatchPage((p) => p - 1)}
                        >
                          ← {L("Previous", "上一页")}
                        </button>
                        <button
                          disabled={
                            (batchPage + 1) * 100 >= project.rows.length
                          }
                          onClick={() => setBatchPage((p) => p + 1)}
                        >
                          {L("Next", "下一页")} →
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Layers3 size={34} />
                    </div>
                    <h2>
                      {L(
                        "Your next batch starts here.",
                        "从这里开始批量制作。",
                      )}
                    </h2>
                    <p>
                      {L(
                        "Bring your CSV, paste a spreadsheet, or generate a numbered series.",
                        "导入 CSV、粘贴表格，或生成连续编号。",
                      )}
                    </p>
                    <div className="button-row">
                      <button className="primary" onClick={importFile}>
                        <ArrowUpFromLine size={16} />
                        {L("Import data", "导入数据")}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setModal("sequence")}
                      >
                        <Hash size={16} />
                        {L("Create a sequence", "生成流水号")}
                      </button>
                    </div>
                    <small>
                      {L(
                        "CSV / TSV / UTF-8 text · Leading zeros are preserved",
                        "CSV / TSV / UTF-8 文本 · 保留前导零",
                      )}
                    </small>
                  </div>
                )}
              </section>
              <div className="batch-bottom">
                <p>
                  <ShieldCheck size={17} />
                  {L(
                    "Every row is checked before export. Errors are never silently skipped.",
                    "导出前逐行检查，不会默默跳过错误。",
                  )}
                </p>
                <div className="button-row">
                  <select
                    aria-label={L("Batch export format")}
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ExportFormat)}
                  >
                    {["svg", "png", "tiff", "bmp", "gif", "jpeg"].map((f) => (
                      <option key={f} value={f}>
                        {f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    disabled={!project.rows.length || !!busy}
                    onClick={exportBatch}
                  >
                    <Download size={16} />
                    {L("Export ZIP", "导出 ZIP")}
                  </button>
                  <button
                    className="primary"
                    disabled={!project.rows.length}
                    onClick={() => setTab("labels")}
                  >
                    {L("Arrange labels", "排版标签")}
                    <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            </>
          )}
          {tab === "labels" && (
            <div className="label-grid">
              <section className="panel label-controls">
                <div className="panel-heading">
                  <Settings2 size={18} />
                  <h2>{L("Page setup", "页面设置")}</h2>
                </div>
                <label className="field">
                  <span>{L("Start with a layout", "使用预设布局")}</span>
                  <select
                    aria-label={L("Label preset")}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const { name, ...l } = presets[Number(e.target.value)];
                        layout(l);
                        setPage(0);
                      }
                    }}
                  >
                    <option value="">{L("Custom layout", "自定义布局")}</option>
                    {presets.map((p, i) => (
                      <option value={i} key={p.name}>
                        {L(p.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="subheading">{L("Paper · mm", "纸张 · mm")}</div>
                <div className="two-fields">
                  {layoutField(L("Paper width", "纸张宽度"), "paperWidth", 5)}
                  {layoutField(L("Paper height", "纸张高度"), "paperHeight", 5)}
                </div>
                <div className="subheading">{L("Label · mm", "标签 · mm")}</div>
                <div className="two-fields">
                  {layoutField(L("Label width", "标签宽度"), "width", 5)}
                  {layoutField(L("Label height", "标签高度"), "height", 5)}
                  {layoutField(L("Columns", "列数"), "columns", 1, 50, 1)}
                  {layoutField(L("Rows", "行数"), "rows", 1, 50, 1)}
                </div>
                <div className="subheading">
                  {L("Margins & spacing · mm", "页边距与间距 · mm")}
                </div>
                <div className="two-fields">
                  {layoutField(
                    L("Left / right margin", "左右页边距"),
                    "marginX",
                  )}
                  {layoutField(
                    L("Top / bottom margin", "上下页边距"),
                    "marginY",
                  )}
                  {layoutField(L("Horizontal gap", "水平间距"), "gapX")}
                  {layoutField(L("Vertical gap", "垂直间距"), "gapY")}
                </div>
                <label className="field">
                  <span>{L("Skip used labels", "跳过已使用的标签")}</span>
                  <input
                    type="number"
                    min={0}
                    max={project.layout.rows * project.layout.columns - 1}
                    value={project.layout.start}
                    onChange={(e) => layout({ start: Number(e.target.value) })}
                  />
                  <small>
                    {L(
                      "Reuse a partially printed sheet.",
                      "继续使用已经打印过部分标签的纸张。",
                    )}
                  </small>
                </label>
                <label className="field">
                  <span>{L("Fill order", "填充顺序")}</span>
                  <select
                    value={project.layout.order}
                    onChange={(e) =>
                      layout({ order: e.target.value as LabelLayout["order"] })
                    }
                  >
                    <option value="rows">
                      {L("Across, then down", "先横向，再纵向")}
                    </option>
                    <option value="columns">
                      {L("Down, then across", "先纵向，再横向")}
                    </option>
                  </select>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={project.layout.guides}
                    onChange={(e) => layout({ guides: e.target.checked })}
                  />
                  {L("Show label guides in preview", "预览中显示标签边界")}
                </label>
                <p className="muted-note">
                  {L(
                    "Print at 100% / Actual size. Turn off “Fit to page” in the printer dialog.",
                    "请按 100% / 实际大小打印，在打印对话框中关闭“适合页面”。",
                  )}
                </p>
              </section>
              <div className="label-preview-column">
                <section className="panel">
                  <div className="panel-heading">
                    <LayoutGrid size={18} />
                    <h2>{L("Sheet preview", "整页预览")}</h2>
                    <span className="pill">
                      {labelResult.pages.length} {L("pages", "页")}
                    </span>
                  </div>
                  <div
                    className={
                      "sheet-stage " +
                      (project.layout.guides ? "show-guides" : "")
                    }
                  >
                    {labelResult.error ? (
                      <div className="preview-empty">
                        <AlertTriangle size={32} />
                        <h3>{L("Adjust the layout", "请调整布局")}</h3>
                        <p>{D(labelResult.error)}</p>
                        <button
                          className="secondary"
                          onClick={() => setTab("design")}
                        >
                          {L("Adjust barcode size", "调整条码尺寸")}
                        </button>
                      </div>
                    ) : (
                      <div
                        className="sheet-scale"
                        style={{
                          width: project.layout.paperWidth * 2,
                          height: project.layout.paperHeight * 2,
                        }}
                      >
                        <div
                          className="sheet-inner"
                          style={{ transform: "scale(0.5291666667)" }}
                          dangerouslySetInnerHTML={{
                            __html:
                              labelResult.pages[
                                Math.min(page, labelResult.pages.length - 1)
                              ] || "",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {project.layout.paperWidth} × {project.layout.paperHeight}{" "}
                      mm · {project.layout.columns} × {project.layout.rows}
                    </span>
                    <div>
                      <button
                        disabled={page <= 0}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        ←
                      </button>
                      <span>
                        {labelResult.pages.length
                          ? Math.min(page + 1, labelResult.pages.length)
                          : 0}{" "}
                        / {labelResult.pages.length}
                      </span>
                      <button
                        disabled={page + 1 >= labelResult.pages.length}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        →
                      </button>
                    </div>
                  </div>
                </section>
                <div className="label-actions">
                  <button
                    className="secondary"
                    disabled={!!labelResult.error || !!busy}
                    onClick={() => printLabels(true)}
                  >
                    <Download size={17} />
                    {L("Export print-ready PDF", "导出打印 PDF")}
                  </button>
                  <button
                    className="primary"
                    disabled={!!labelResult.error || !!busy}
                    onClick={() => printLabels(false)}
                  >
                    <Printer size={17} />
                    {L("Print labels", "打印标签")}
                  </button>
                </div>
                <p className="muted-note">
                  {L(
                    "Barcodes keep their physical size. A code that does not fit is flagged instead of silently shrunk.",
                    "条码保持物理尺寸。放不下时会提示，不会偷偷缩小。",
                  )}
                </p>
              </div>
            </div>
          )}
          {tab === "library" && (
            <>
              {library.length ? (
                <div className="library-grid">
                  {library.map((p, i) => (
                    <section className="panel library-card" key={i}>
                      <div className="library-preview">
                        {(() => {
                          try {
                            return (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: encode(p.design).svg,
                                }}
                              />
                            );
                          } catch {
                            return <Barcode size={45} />;
                          }
                        })()}
                      </div>
                      <h3>{p.name}</h3>
                      <p>
                        {catalog.find((t) => t.id === p.design.type)?.name} ·{" "}
                        {p.rows.length || 1} {L("records", "条记录")}
                      </p>
                      <small>
                        {new Date(p.updatedAt).toLocaleDateString(language)}
                      </small>
                      <div className="button-row">
                        <button
                          className="primary small"
                          onClick={() => {
                            change(structuredClone(p));
                            setTab(p.rows.length ? "batch" : "design");
                            notify(L("Project restored", "项目已恢复"));
                          }}
                        >
                          {L("Open project", "打开项目")}
                          <ArrowRight size={14} />
                        </button>
                        <button
                          title={L("Delete from library", "从项目库删除")}
                          className="icon-button"
                          onClick={() =>
                            run(async () => {
                              const next = library.filter((_, j) => i !== j);
                              await window.desktop.saveLibrary(next);
                              setLibrary(next);
                              notify(
                                L("Removed from library", "已从项目库移除"),
                              );
                            })
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <section className="panel empty-state">
                  <div className="empty-icon">
                    <FolderHeart size={35} />
                  </div>
                  <h2>
                    {L("A home for your best designs.", "给好设计留一个位置。")}
                  </h2>
                  <p>
                    {L(
                      "Save a complete project and reuse its data, design, and label settings.",
                      "保存完整项目，复用数据、设计和标签设置。",
                    )}
                  </p>
                  <button className="primary" onClick={addLibrary}>
                    <Plus size={17} />
                    {L("Save current project", "保存当前项目")}
                  </button>
                </section>
              )}
            </>
          )}
          {tab === "scan" && (
            <div className="scan-grid">
              <section
                className="panel scan-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0])
                    run(() => scan(e.dataTransfer.files[0]));
                }}
                onPaste={(e) => {
                  const file = Array.from(e.clipboardData.files)[0];
                  if (file) run(() => scan(file));
                }}
                tabIndex={0}
              >
                {scanImage ? (
                  <img
                    src={scanImage}
                    alt={L("Image being inspected", "正在识别的图片")}
                  />
                ) : (
                  <>
                    <div className="empty-icon">
                      <ScanLine size={40} />
                    </div>
                    <h2>{L("Drop an image here", "将图片拖到这里")}</h2>
                    <p>
                      {L(
                        "Or paste a screenshot directly into this area.",
                        "也可以直接在此区域粘贴截图。",
                      )}
                    </p>
                  </>
                )}
                <button
                  className="primary"
                  disabled={scanBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  {scanBusy
                    ? L("Reading…", "正在识别…")
                    : L("Choose an image", "选择图片")}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      run(() => scan(e.target.files![0]));
                    e.target.value = "";
                  }}
                />
                <small>
                  {L(
                    "Images stay on this device. Up to 20 MB / 24 MP.",
                    "图片留在本机。最大 20 MB / 2400 万像素。",
                  )}
                </small>
              </section>
              <section className="panel scan-output">
                <div className="panel-heading">
                  <ScanLine size={18} />
                  <h2>{L("Results", "识别结果")}</h2>
                  <span className="pill">{scanResults.length}</span>
                </div>
                {scanResults.length ? (
                  scanResults.map((r, i) => (
                    <div className="scan-result" key={i}>
                      <span className="pill">{r.format}</span>
                      <pre>{r.text}</pre>
                      <button
                        className="secondary small"
                        onClick={() =>
                          run(async () => {
                            await window.desktop.clipboardText(r.text);
                            notify(L("Text copied", "文字已复制"));
                          })
                        }
                      >
                        <Copy size={14} />
                        {L("Copy data", "复制数据")}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted-note">
                    {L(
                      "Results appear here after a successful decode. Readable formats are a subset of the 108 generation formats.",
                      "成功解码后在这里显示结果。可识别格式少于 108 种可生成格式。",
                    )}
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
        {!isAuxiliary && (
          <footer className="statusbar">
            <span>
              <ShieldCheck size={13} />
              {L(
                "No account. No upload. Your work stays yours.",
                "无需账号，无需上传。你的数据由你掌握。",
              )}
            </span>
            <span>
              BarcodeMate · {catalog.length} {L("formats", "种格式")}
            </span>
          </footer>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <div className="panel busy-card">
            <div className="spinner" />
            <h3>{L(busy)}</h3>
            {busy === "Exporting batch" ? (
              <>
                <progress max={batchRows.length} value={progress} />
                <p>
                  {progress} / {batchRows.length}
                </p>
                <button
                  className="secondary"
                  onClick={() => abort.current.abort()}
                >
                  {L("Cancel", "取消")}
                </button>
              </>
            ) : (
              <p>{L("Please wait…", "请稍候…")}</p>
            )}
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={"modal panel " + (modal === "import" ? "wide" : "")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <h2 id="modal-title">
                {modal === "import"
                  ? L("Bring your data", "导入你的数据")
                  : modal === "sequence"
                    ? L("Create a numbered series", "创建连续编号")
                    : modal === "assistant"
                      ? L("Data assistant", "数据助手")
                      : L("About BarcodeMate", "关于 BarcodeMate")}
              </h2>
              <button
                className="icon-button"
                aria-label={L("Close")}
                onClick={() => setModal(null)}
              >
                <X size={21} />
              </button>
            </div>
            {failure && (
              <div role="alert" className="error-banner">
                <AlertTriangle size={16} />
                <span>{D(failure)}</span>
                <button
                  aria-label={L("Dismiss error")}
                  onClick={() => setFailure("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {modal === "import" && (
              <>
                <p>
                  {L(
                    "CSV, TSV, or pasted spreadsheet data. Preview and map columns before importing.",
                    "支持 CSV、TSV 或粘贴的表格数据。先预览、映射字段，再导入。",
                  )}
                </p>
                <div className="button-row">
                  <button className="secondary" onClick={importFile}>
                    <FolderOpen size={16} />
                    {L("Choose file", "选择文件")}
                  </button>
                  <span className="muted-note">{importName}</span>
                </div>
                <label className="field">
                  <span>{L("Paste your data", "粘贴数据")}</span>
                  <textarea
                    rows={5}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={
                      "data,name,quantity\n00001234,Product A,2\n00001235,Product B,1"
                    }
                    spellCheck={false}
                  />
                </label>
                <div className="button-row">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.target.checked)}
                    />
                    {L("First row contains column names", "首行是列名")}
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={append}
                      onChange={(e) => setAppend(e.target.checked)}
                    />
                    {L("Append to current data", "追加到现有数据")}
                  </label>
                </div>
                {table.error && <p className="error-text">{D(table.error)}</p>}
                <div className="mapping-grid">
                  {(Object.keys(mapping) as (keyof typeof mapping)[]).map(
                    (key, i) => (
                      <label key={key} className="field">
                        <span>
                          {
                            [
                              L("Barcode data *", "条码数据 *"),
                              L("Name", "名称"),
                              L("Copies", "份数"),
                              L("Format ID", "格式 ID"),
                              L("Caption above", "上方说明"),
                              L("Caption below", "下方说明"),
                            ][i]
                          }
                        </span>
                        <select
                          value={mapping[key]}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [key]: Number(e.target.value),
                            }))
                          }
                        >
                          {key !== "data" && (
                            <option value={-1}>
                              {L("Not mapped", "不映射")}
                            </option>
                          )}
                          {(table.rows[0] || ["#1"]).map((h, j) => (
                            <option key={j} value={j}>
                              {hasHeader ? h : `#${j + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ),
                  )}
                </div>
                {table.rows.length > 0 && (
                  <div className="import-preview">
                    <table>
                      <tbody>
                        {table.rows.slice(0, 6).map((r, i) => (
                          <tr key={i}>
                            {r.slice(0, 8).map((c, j) => (
                              <td key={j}>{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="modal-footer">
                  <span>
                    {Math.max(0, table.rows.length - (hasHeader ? 1 : 0))}{" "}
                    {L("data rows", "行数据")}
                  </span>
                  <button
                    className="primary"
                    onClick={importRows}
                    disabled={!importText || !!table.error}
                  >
                    {L("Import rows", "导入数据")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {modal === "sequence" && (
              <>
                <p>
                  {L(
                    "Numbering that preserves leading zeros, even for very long IDs.",
                    "保留前导零，即使是很长的编号也不会丢失精度。",
                  )}
                </p>
                <div className="two-fields">
                  {(["start", "step", "prefix", "suffix"] as const).map(
                    (key, i) => (
                      <label key={key} className="field">
                        <span>
                          {
                            [
                              L("Start value", "起始值"),
                              L("Step", "步长"),
                              L("Prefix", "前缀"),
                              L("Suffix", "后缀"),
                            ][i]
                          }
                        </span>
                        <input
                          value={seq[key]}
                          onChange={(e) =>
                            setSeq((s) => ({ ...s, [key]: e.target.value }))
                          }
                        />
                      </label>
                    ),
                  )}
                  {(["count", "pad"] as const).map((key, i) => (
                    <label key={key} className="field">
                      <span>
                        {i
                          ? L("Minimum digits", "最少位数")
                          : L("How many?", "生成数量")}
                      </span>
                      <input
                        type="number"
                        min={i ? 0 : 1}
                        max={i ? 40 : 10000}
                        value={seq[key]}
                        onChange={(e) =>
                          setSeq((s) => ({
                            ...s,
                            [key]: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={seq.random}
                    onChange={(e) =>
                      setSeq((s) => ({ ...s, random: e.target.checked }))
                    }
                  />
                  {L(
                    "Shuffle the generated unique numbers",
                    "打乱生成的唯一编号顺序",
                  )}
                </label>
                <div className="sequence-preview">
                  <strong>{L("Preview", "预览")}</strong>
                  {seqPreview.error ? (
                    <p className="error-text">{D(seqPreview.error)}</p>
                  ) : (
                    seqPreview.rows.map((r) => <code key={r.id}>{r.data}</code>)
                  )}
                </div>
                <div className="modal-footer">
                  <span>
                    {L("Added to your current batch", "追加到当前批量数据")}
                  </span>
                  <button
                    className="primary"
                    disabled={!!seqPreview.error}
                    onClick={() =>
                      run(() => {
                        const rows = sequence(
                          seq.start,
                          seq.count,
                          seq.step,
                          seq.prefix,
                          seq.suffix,
                          seq.pad,
                          seq.random,
                        );
                        if (project.rows.length + rows.length > 10000)
                          throw Error("Maximum 10,000 rows per project.");
                        change((p) => ({ ...p, rows: [...p.rows, ...rows] }));
                        setModal(null);
                        setTab("batch");
                        notify(
                          `${rows.length} ` +
                            L("numbers created", "个编号已创建"),
                        );
                      })
                    }
                  >
                    {L("Create sequence", "生成流水号")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {modal === "assistant" && (
              <>
                <div className="assistant-tabs">
                  {["wifi", "vcard", "gs1", "url"].map((s) => (
                    <button
                      key={s}
                      className={s === assistant ? "active" : ""}
                      onClick={() => setAssistant(s)}
                    >
                      {s === "wifi"
                        ? "Wi-Fi"
                        : s === "vcard"
                          ? "vCard"
                          : s === "gs1"
                            ? "GS1"
                            : "URL"}
                    </button>
                  ))}
                </div>
                {(assistant === "wifi"
                  ? [
                      ["ssid", L("Network name", "网络名称")],
                      ["password", L("Password", "密码")],
                    ]
                  : assistant === "vcard"
                    ? [
                        ["name", L("Full name", "姓名")],
                        ["organization", L("Organization", "组织")],
                        ["phone", L("Phone", "电话")],
                        ["email", L("Email", "邮箱")],
                        ["url", L("Website", "网站")],
                      ]
                    : assistant === "gs1"
                      ? [
                          ["gtin", "GTIN"],
                          ["lot", L("Lot / batch (AI 10)", "批次 (AI 10)")],
                          [
                            "expiry",
                            L(
                              "Expiration YYMMDD (AI 17)",
                              "有效期 YYMMDD (AI 17)",
                            ),
                          ],
                          ["serial", L("Serial (AI 21)", "序列号 (AI 21)")],
                        ]
                      : [["url", L("Website URL", "网站地址")]]
                ).map(([key, label]) => (
                  <label className="field" key={key}>
                    <span>{label}</span>
                    <input
                      value={assistantData[key] || ""}
                      onChange={(e) =>
                        setAssistantData((s) => ({
                          ...s,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                {assistant === "wifi" && (
                  <label className="field">
                    <span>{L("Security", "安全类型")}</span>
                    <select
                      value={assistantData.security || "WPA"}
                      onChange={(e) =>
                        setAssistantData((s) => ({
                          ...s,
                          security: e.target.value,
                        }))
                      }
                    >
                      <option>WPA</option>
                      <option>WEP</option>
                      <option value="nopass">
                        {L("Open network", "开放网络")}
                      </option>
                    </select>
                  </label>
                )}
                {assistant === "gs1" && (
                  <label className="field">
                    <span>{L("Barcode format", "条码格式")}</span>
                    <select
                      value={assistantData.format || "gs1-128"}
                      onChange={(e) =>
                        setAssistantData((s) => ({
                          ...s,
                          format: e.target.value,
                        }))
                      }
                    >
                      <option value="gs1-128">GS1-128</option>
                      <option value="gs1datamatrix">GS1 DataMatrix</option>
                      <option value="gs1qrcode">GS1 QR Code</option>
                    </select>
                    <small>
                      {L(
                        "Uses your existing GTIN. This tool does not register product numbers.",
                        "使用你已有的 GTIN，本工具不注册商品号码。",
                      )}
                    </small>
                  </label>
                )}
                <div className="modal-footer">
                  <span />
                  <button className="primary" onClick={applyAssistant}>
                    {L("Use this data", "使用这些数据")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
            {modal === "about" && (
              <>
                <div className="about-brand">
                  <div className="brand-mark">
                    <Barcode size={34} />
                  </div>
                  <h2>BarcodeMate</h2>
                  <span>v{info.version}</span>
                </div>
                <p>
                  {L(
                    "Barcode design, batch generation, and label printing. Built for a consistent workspace on macOS and Windows.",
                    "条码设计、批量生成与标签打印。在 macOS 和 Windows 上提供一致的工作空间。",
                  )}
                </p>
                <p>
                  {L(
                    "All barcode data, images, and projects are processed locally. No telemetry or cloud account.",
                    "所有条码数据、图片和项目都在本机处理。无需云端账号，不收集遥测数据。",
                  )}
                </p>
                <p className="muted-note">
                  {L(
                    "BarcodeMate is open-source software under the MIT License. Third-party licenses are bundled in THIRD_PARTY_NOTICES.txt.",
                    "BarcodeMate 采用 MIT 开源许可证。第三方组件的许可声明已随软件附带。",
                  )}
                </p>
                <small>
                  {L("Project storage", "项目存储")}：{info.dataPath}
                </small>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
