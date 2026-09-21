import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  newWarehouse,
  validateProject,
  renderWarehouse,
  sampleProject,
  labelSymbol,
  parseImport,
  importItems,
  shelfItems,
  presets,
  normalizePaper,
  paperMargins,
  setOppositeMargin,
  STORE,
  WarehouseError,
  type WarehouseProject,
  type Paper,
  type Item,
} from "./core";
import { RackDiagram } from "./RackDiagram";
import { PrinterIcon } from "./PrinterIcon";
import { ZebraPrinter } from "./ZebraPrinter";
import { checkedDocument, createZpl } from "./output";
import { text, type WarehouseKey } from "./i18n";
import { isRTL, type HomeKey } from "../home/i18n";
import { AdjustmentInput } from "../home/AdjustmentInput";
import type { DesktopAPI } from "../bridge";
import "../home/home.css";
import "./warehouse.css";
const LAYOUT_VERSION = `${STORE}.layout-version`;
const SCREEN_SCALE = `${STORE}.screen-scale.v1`;
const EDITOR_WIDTH = `${STORE}.editor-width.v1`;
const MIN_EDITOR_WIDTH = 360;
const sample =
  "code,name,location,copies\n000123,Widget,A-01-01,2\nSKU-002,Box,A-01-02,1\n";
export function Warehouse({
  language,
  desktop,
}: {
  language: string;
  desktop?: DesktopAPI;
}) {
  const t = (key: WarehouseKey | HomeKey) => text(language, key);
  const [project, setProject] = useState<WarehouseProject>(() => {
    try {
      const v = localStorage.getItem(STORE);
      if (v) {
        const saved = validateProject(JSON.parse(v));
        // Upgrade the old built-in 102×152 two-row layout once. Subsequent
        // deliberate custom dimensions remain untouched, including after reload.
        const oldPreset = { ...presets["roll-102x152"], height: 50, top: 0 };
        if (
          localStorage.getItem(LAYOUT_VERSION) !== "2" &&
          saved.printer !== "office" &&
          Object.entries(oldPreset).every(
            ([key, value]) => saved.paper[key as keyof Paper] === value,
          )
        )
          saved.paper = { ...presets["roll-102x152"] };
        return saved;
      }
    } catch {}
    return newWarehouse();
  });
  const [page, setPage] = useState(0),
    [listPage, setListPage] = useState(0),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [stored, setStored] = useState(false);
  const [sequence, setSequence] = useState({
    zone: "A",
    start: 1,
    racks: 1,
    levels: 3,
    bins: 4,
  });
  const [csv, setCsv] = useState(""),
    [table, setTable] = useState<string[][]>([]),
    [header, setHeader] = useState(true),
    [map, setMap] = useState({ code: 0, name: 1, location: 2, copies: 3 });
  const [customPaper, setCustomPaper] = useState(false);
  const [settingsHidden, setSettingsHidden] = useState(false);
  const [wide, setWide] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(
    null,
  );
  const [gridWidth, setGridWidth] = useState(0);
  const [editorWidth, setEditorWidth] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(EDITOR_WIDTH));
      return Number.isFinite(saved) && saved >= MIN_EDITOR_WIDTH ? saved : null;
    } catch {
      return null;
    }
  });
  // Keep room for the preview while retaining the preferred width on smaller screens.
  const maxEditorWidth = Math.max(MIN_EDITOR_WIDTH, gridWidth - 380);
  const clampEditorWidth = (width: number) =>
    Math.round(Math.min(maxEditorWidth, Math.max(MIN_EDITOR_WIDTH, width)));
  const displayedEditorWidth = clampEditorWidth(
    editorWidth ?? (gridWidth - 20) / 2,
  );
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const resize = () => setGridWidth(el.clientWidth);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      if (editorWidth === null) localStorage.removeItem(EDITOR_WIDTH);
      else localStorage.setItem(EDITOR_WIDTH, String(editorWidth));
    } catch {}
  }, [editorWidth]);
  const paperSettings = useRef<HTMLDetailsElement>(null);
  useEffect(() => setCustomPaper(false), [project.paper]);
  const frame = useRef<HTMLIFrameElement>(null),
    surface = useRef<HTMLDivElement>(null),
    backup = useRef<HTMLInputElement>(null),
    csvFile = useRef<HTMLInputElement>(null),
    last = useRef<ReturnType<typeof renderWarehouse> | null>(null);
  const undo = useRef<WarehouseProject[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [scale, setScale] = useState(0.8),
    [metricsError, setMetricsError] = useState("");
  const [screenScale, setScreenScale] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(SCREEN_SCALE));
      return saved >= 0.05 && saved <= 4 ? saved : null;
    } catch {
      return null;
    }
  });
  const displayScale = screenScale ?? scale;
  useEffect(() => {
    try {
      if (screenScale === null) localStorage.removeItem(SCREEN_SCALE);
      else localStorage.setItem(SCREEN_SCALE, String(screenScale));
    } catch {}
  }, [screenScale]);
  const fail = (e: unknown) => {
    const key =
      e instanceof WarehouseError
        ? e.key
        : e instanceof Error
          ? Object.keys({
              connectionError: 1,
              sendError: 1,
              deviceMismatch: 1,
              sizeError: 1,
              invalid: 1,
            }).find((k) => e.message.includes(k))
          : "invalid";
    return (
      t((key || "invalid") as WarehouseKey) +
      (e instanceof WarehouseError && e.detail ? ` · ${e.detail}` : "")
    );
  };
  const change = (next: WarehouseProject) => {
    undo.current = [...undo.current.slice(-19), project];
    setUndoCount(undo.current.length);
    setProject(next);
    setNotice("");
  };
  const patch = (part: Partial<WarehouseProject>) =>
    change({ ...project, ...part });
  const updatePaper = (part: Partial<Paper>) =>
    patch({ paper: { ...project.paper, ...part }, start: 0 });
  const margins = paperMargins(project.paper);
  const updateItems = (items: Item[]) =>
    patch({ lists: { ...project.lists, [project.mode]: items } });
  const rows = project.lists[project.mode];
  useEffect(() => {
    setListPage((p) =>
      Math.min(p, Math.max(0, Math.ceil(rows.length / 20) - 1)),
    );
  }, [rows.length]);
  const result = useMemo(() => {
    try {
      const view = renderWarehouse(project, page);
      last.current = view;
      return { view, error: view.errors[0] ? fail(view.errors[0]) : "" };
    } catch (e) {
      return { view: last.current, error: fail(e) };
    }
  }, [project, page, language]);
  const view = result.view;
  const firstSymbol = useMemo(() => {
    try {
      const p = validateProject(project);
      const item = p.lists[p.mode].find((item) => item.copies > 0);
      return item ? labelSymbol(item, p) : null;
    } catch {
      return null;
    }
  }, [project]);
  const singleRowRoll = view?.paper.medium === "roll" && view.paper.rows === 1;
  // An iframe's viewport uses whole CSS pixels. Round up so fractional mm sizes
  // cannot trigger a scrollbar that then steals space from the other axis.
  const previewWidth = Math.ceil(((view?.displayWidth ?? 0) * 96) / 25.4);
  const previewHeight = Math.ceil(((view?.displayHeight ?? 0) * 96) / 25.4);
  const adjustScreenWidth = (pixels: number) => {
    if (!previewWidth) return;
    setScreenScale((current) =>
      Math.min(4, Math.max(0.05, (current ?? scale) + pixels / previewWidth)),
    );
  };
  useEffect(() => {
    setStored(false);
    try {
      const value = validateProject(project);
      localStorage.setItem(STORE, JSON.stringify(value));
      localStorage.setItem(LAYOUT_VERSION, "2");
      setStored(true);
    } catch (e) {
      if (!(e instanceof WarehouseError)) setNotice(t("storageError"));
    }
  }, [project]);
  useEffect(() => {
    setPage(0);
    setListPage(0);
  }, [project.mode]);
  useEffect(() => {
    setPage(0);
  }, [project.paper]);
  useEffect(() => {
    setMetricsError("");
  }, [view?.html]);
  useEffect(() => {
    const el = surface.current;
    if (!el || !view) return;
    const resize = () => {
      const heightLimit = parseFloat(getComputedStyle(el).maxHeight) - 32;
      setScale(
        Math.min(
          1.15,
          Math.max(0.01, (el.clientWidth - 32) / previewWidth),
          view.paper.medium === "roll"
            ? Math.max(0.01, heightLimit / previewHeight)
            : Infinity,
        ),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [previewWidth, previewHeight, view?.paper.medium]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(fail(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (name: string, content: string, extension: string) => {
    if (desktop) {
      await desktop.saveFile({
        name,
        bytes: new TextEncoder().encode(content),
        extension,
      });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([content], {
        type:
          extension === "json"
            ? "application/json"
            : "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const print = (scope: "one" | "all" = "all") =>
    run(async () => {
      const { frame: check, view: output } = await checkedDocument(
        scope === "one" ? sampleProject(project) : project,
      );
      try {
        if (desktop)
          await desktop.print({
            html: output.html,
            width: output.paper.pageWidth,
            height: output.paper.pageHeight,
            pdf: false,
            name: "BarcodeMate-warehouse",
          });
        else {
          check.contentWindow!.focus();
          check.contentWindow!.print();
        }
      } finally {
        setTimeout(() => check.remove(), desktop ? 0 : 60000);
      }
    });
  const pdf = () => {
    if (!desktop) return print();
    return run(async () => {
      const { frame: check, view: output } = await checkedDocument(project);
      try {
        await desktop.print({
          html: output.html,
          width: output.paper.pageWidth,
          height: output.paper.pageHeight,
          pdf: true,
          name: "BarcodeMate-warehouse",
        });
      } finally {
        check.remove();
      }
    });
  };
  useEffect(() => {
    const listener = (event: Event) => {
      if (busy) return;
      const action = (event as CustomEvent<string>).detail;
      if (action === "print") void print();
      if (action === "save")
        void run(() =>
          save(
            "BarcodeMate-warehouse.json",
            JSON.stringify(validateProject(project), null, 2),
            "json",
          ),
        );
      if (action === "open") backup.current?.click();
      if (action === "import") csvFile.current?.click();
      if (action === "new") change(newWarehouse());
      if (action === "undo") {
        const previous = undo.current.pop();
        if (previous) {
          setProject(previous);
          setUndoCount(undo.current.length);
        }
      }
    };
    window.addEventListener("warehouse-menu", listener);
    return () => window.removeEventListener("warehouse-menu", listener);
  });
  const stage = (input: string) => {
    try {
      const parsed = parseImport(input);
      if (!parsed.length) throw new WarehouseError("importError");
      setCsv(input);
      setTable(parsed);
      setMap({
        code: 0,
        name: parsed[0].length > 1 ? 1 : -1,
        location: parsed[0].length > 2 ? 2 : -1,
        copies: parsed[0].length > 3 ? 3 : -1,
      });
      setNotice("");
    } catch (e) {
      setTable([]);
      setNotice(fail(e));
    }
  };
  const selectPrinter = (printer: "office" | "thermal") => {
    if ((printer === "office") === (project.printer === "office")) return;
    patch({
      printer,
      paper: { ...(printer === "office" ? presets.a4 : presets["roll-1"]) },
      dpi: 300,
      start: 0,
      offsetX: 0,
      offsetY: 0,
    });
  };
  const num = (
    key: string,
    label: string,
    value: number,
    onChange: (n: number) => void,
    unit = "",
  ) => (
    <label key={key}>
      {label}
      {unit && ` (${unit})`}
      <span data-field={key}>
        <AdjustmentInput
          value={value}
          onChange={onChange}
          integer={[
            "start",
            "racks",
            "levels",
            "bins",
            "columns",
            "rows",
            "skip",
            "port",
            "moduleDots",
          ].includes(key)}
        />
      </span>
    </label>
  );
  const disabled = busy || !view?.total || !!result.error || !!metricsError;
  const inspectPreview = async () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    await doc.fonts.ready;
    if (doc !== frame.current?.contentDocument) return;
    const overflow = [...doc.querySelectorAll<SVGGraphicsElement>(".ink")].some(
      (el) => {
        const r = el.getBoundingClientRect(),
          b = el.closest(".label")!.getBoundingClientRect();
        return (
          r.left < b.left - 0.5 ||
          r.right > b.right + 0.5 ||
          r.top < b.top - 0.5 ||
          r.bottom > b.bottom + 0.5
        );
      },
    );
    setMetricsError(overflow ? t("barcodeError") : "");
  };
  return (
    <section className="hm-root wh-root" data-wide={!desktop && wide} dir={isRTL(language) ? "rtl" : "ltr"}>
      <div className="hm-heading">
        <div>
          <p className="hm-eyebrow">BARCODEMATE</p>
          <div className="wh-heading-title">
            {!desktop && (
              <button
                type="button"
                className="wh-width-toggle"
                onClick={() => setWide((value) => !value)}
                aria-pressed={wide}
                aria-label={t(wide ? "standardWidth" : "fullWidth")}
                title={t(wide ? "standardWidth" : "fullWidth")}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 4v16M21 4v16" />
                  <path d={wide ? "M5 12h5m-3-3 3 3-3 3m12-3h-5m3-3-3 3 3 3" : "M10 12H5m3-3-3 3 3 3m6-3h5m-3-3 3 3-3 3"} />
                </svg>
              </button>
            )}
            <h1>{t("warehouse")}</h1>
          </div>
          <p>{t("warehouseDescription")}</p>
        </div>
        <div className="hm-actions">
          <span className="hm-autosave">{stored ? t("local") : ""}</span>
          <button
            disabled={busy || !undoCount}
            onClick={() => {
              const prev = undo.current.pop();
              if (prev) {
                setProject(prev);
                setUndoCount(undo.current.length);
                setNotice("");
              }
            }}
          >
            {t("undo")}
          </button>
          <details className="hm-backup">
            <summary>{t("backup")}</summary>
            <div className="hm-backup-options">
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await save(
                      "BarcodeMate-warehouse.json",
                      JSON.stringify(validateProject(project), null, 2),
                      "json",
                    );
                  })
                }
              >
                {t("save")}
              </button>
              <button disabled={busy} onClick={() => backup.current?.click()}>
                {t("open")}
              </button>
            </div>
          </details>
        </div>
      </div>
      <input
        hidden
        type="file"
        ref={backup}
        accept=".json,application/json"
        data-testid="warehouse-backup"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run(async () => {
              if (f.size > 2_000_000) throw new WarehouseError("sizeError");
              change(validateProject(JSON.parse(await f.text())));
            });
        }}
      />
      <input
        hidden
        type="file"
        ref={csvFile}
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        data-testid="warehouse-csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void run(async () => {
              if (f.size > 2_000_000) throw new WarehouseError("importError");
              stage(await f.text());
            });
        }}
      />
      {notice && (
        <p className="wh-notice" role="status">
          {notice}
        </p>
      )}
      <fieldset disabled={busy} className="wh-printers">
        <legend>01 · {t("printer")}</legend>
        <div className="wh-printer-options">
          {(["office", "thermal"] as const).map((kind) => {
            const selected =
              kind === "office"
                ? project.printer === "office"
                : project.printer !== "office";
            return (
              <div
                key={kind}
                className={`wh-printer-card wh-printer-${kind}`}
                data-selected={selected}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  data-printer={kind}
                  onClick={() => selectPrinter(kind)}
                >
                  <PrinterIcon thermal={kind === "thermal"} />
                  <span className="wh-printer-copy">
                    <strong>{t(kind)}</strong>
                    <span>
                      {t(kind === "office" ? "officeHelp" : "thermalHelp")
                        .split(" · ")
                        .map((line, index) => (
                          <span key={index}>{line}</span>
                        ))}
                    </span>
                  </span>
                </button>
                {kind === "thermal" && (
                  <label className="wh-protocol">
                    {t("protocol")}
                    <select
                      data-testid="warehouse-protocol"
                      disabled={busy || !selected}
                      value={project.printer === "zebra" ? "zebra" : "thermal"}
                      onChange={(e) =>
                        patch({
                          printer: e.target.value as "thermal" | "zebra",
                          dpi:
                            e.target.value === "zebra" && project.dpi === 600
                              ? 300
                              : project.dpi,
                        })
                      }
                    >
                      <option value="thermal">{t("genericPdf")}</option>
                      <option value="zebra">{t("zebra")}</option>
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </div>
        {project.printer === "zebra" && (
          <ZebraPrinter
            language={language}
            desktop={desktop}
            project={project}
            disabled={!view?.total || !!result.error || !!metricsError}
            run={run}
            onSent={() => setNotice(t("sent"))}
          />
        )}
      </fieldset>
      <div
        className="wh-grid"
        ref={grid}
        data-settings-hidden={settingsHidden}
        style={
          {
            "--wh-editor-width": `${displayedEditorWidth}px`,
          } as React.CSSProperties
        }
      >
        <aside className="wh-preview-panel">
          <div className="wh-panel">
            <div className="wh-preview-heading">
              <h2>{t("preview")}</h2>
              <span>
                {view?.total ?? 0} {t("label")} ·{" "}
                {view?.paper.medium === "roll"
                  ? `${view.paper.columns} ${t("across")} · ${view.paper.width} × ${view.paper.height}`
                  : `${view?.paper.pageWidth} × ${view?.paper.pageHeight}`}{" "}
                mm
              </span>
            </div>
            <div className="wh-screen-controls">
              <div className="wh-screen-width">
                <button
                  type="button"
                  className="wh-layout-toggle"
                  aria-label={t(settingsHidden ? "twoColumns" : "oneColumn")}
                  title={t(settingsHidden ? "twoColumns" : "oneColumn")}
                  aria-expanded={!settingsHidden}
                  aria-controls="warehouse-settings"
                  onClick={() => setSettingsHidden((hidden) => !hidden)}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    {settingsHidden ? (
                      <>
                        <path d="M10 4v16" />
                        <path
                          d="M5 5h4v14H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
                          fill="currentColor"
                          fillOpacity="0.14"
                          stroke="none"
                        />
                      </>
                    ) : (
                      <rect
                        x="6"
                        y="7"
                        width="12"
                        height="10"
                        rx="0.5"
                        fill="currentColor"
                        fillOpacity="0.14"
                        stroke="none"
                      />
                    )}
                  </svg>
                </button>
                <span>
                  {t("screenWidth")} · {Math.round(previewWidth * displayScale)}{" "}
                  px
                </span>
              </div>
              <button
                type="button"
                aria-label={t("screenNarrower")}
                disabled={!view}
                onClick={() => adjustScreenWidth(-1)}
              >
                −
              </button>
              <button
                type="button"
                aria-label={t("screenWider")}
                disabled={!view}
                onClick={() => adjustScreenWidth(1)}
              >
                +
              </button>
              <button type="button" onClick={() => setScreenScale(null)}>
                {t("screenFit")}
              </button>
            </div>
            <p className="hm-hint" id="warehouse-screen-help">
              {t("screenHelp")}
            </p>
            <div
              className={`wh-preview${view?.paper.medium === "roll" ? " wh-preview-roll" : ""}`}
              ref={surface}
              role="group"
              tabIndex={0}
              aria-label={t("screenPreview")}
              aria-describedby="warehouse-screen-help"
              onClick={(e) => e.currentTarget.focus({ preventScroll: true })}
              onKeyDown={(e) => {
                if (
                  e.target !== e.currentTarget ||
                  e.altKey ||
                  e.ctrlKey ||
                  e.metaKey
                )
                  return;
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  adjustScreenWidth(
                    (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1),
                  );
                }
              }}
            >
              <div
                style={{
                  width: previewWidth * displayScale,
                  height: previewHeight * displayScale,
                }}
              >
                {view && (
                  <iframe
                    ref={frame}
                    title={t("preview")}
                    tabIndex={-1}
                    sandbox="allow-same-origin"
                    srcDoc={view.html}
                    onLoad={() => void inspectPreview()}
                    style={{
                      width: previewWidth,
                      height: previewHeight,
                      transform: `scale(${displayScale})`,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </div>
            <div className="wh-pagination">
              <button
                disabled={!view || view.pageIndex === 0 || busy}
                aria-label={t(singleRowRoll ? "rollRows" : "page") + " −"}
                onClick={() =>
                  setPage(
                    Math.max(
                      0,
                      (view?.pageIndex ?? 0) - (view?.previewStep ?? 1),
                    ),
                  )
                }
              >
                ←
              </button>
              <span>
                {t(singleRowRoll ? "rollRows" : "page")}{" "}
                {(view?.pageIndex ?? 0) + 1}
                {view && view.rowsShown > 1
                  ? `–${view.pageIndex + view.rowsShown}`
                  : ""}{" "}
                / {view?.pageCount ?? 1}
              </span>
              <button
                disabled={
                  !view ||
                  view.pageIndex + view.previewStep >= view.pageCount ||
                  busy
                }
                aria-label={t(singleRowRoll ? "rollRows" : "page") + " +"}
                onClick={() =>
                  setPage((view?.pageIndex ?? 0) + (view?.previewStep ?? 1))
                }
              >
                →
              </button>
            </div>
            {(result.error || metricsError) && (
              <p role="alert" className="wh-error">
                {result.error || metricsError}
              </p>
            )}
            <p className="hm-hint">{t("printNote")}</p>
            <div className="hm-actions wh-output">
              <button
                disabled={disabled}
                onClick={() => print("one")}
                title={t("printOneHelp")}
              >
                {t("printOne")}
              </button>
              <button
                className="hm-primary"
                disabled={disabled}
                onClick={() => print("all")}
                title={t("printAllHelp")}
              >
                {t("printAll")}
              </button>
              <button disabled={disabled} onClick={pdf}>
                {t("pdf")}
              </button>
              {project.printer === "zebra" && (
                <button
                  disabled={disabled}
                  onClick={() =>
                    run(async () => {
                      await save(
                        "BarcodeMate-warehouse.zpl",
                        await createZpl(project),
                        "zpl",
                      );
                    })
                  }
                >
                  {t("zpl")}
                </button>
              )}
            </div>
          </div>
        </aside>
        <div
          className="wh-splitter"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={t("settingsWidth")}
          aria-controls="warehouse-settings"
          aria-valuemin={MIN_EDITOR_WIDTH}
          aria-valuemax={maxEditorWidth}
          aria-valuenow={displayedEditorWidth}
          aria-valuetext={`${displayedEditorWidth} px`}
          title={t("resizeSettings")}
          hidden={settingsHidden}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.focus({ preventScroll: true });
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              pointer: e.pointerId,
              x: e.clientX,
              width: displayedEditorWidth,
            };
          }}
          onPointerMove={(e) => {
            const start = drag.current;
            if (!start || start.pointer !== e.pointerId) return;
            setEditorWidth(
              clampEditorWidth(
                start.width +
                  (e.clientX - start.x) * (isRTL(language) ? -1 : 1),
              ),
            );
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onDoubleClick={() => setEditorWidth(null)}
          onKeyDown={(e) => {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const direction =
                (e.key === "ArrowRight" ? 1 : -1) * (isRTL(language) ? -1 : 1);
              setEditorWidth(
                clampEditorWidth(
                  displayedEditorWidth + direction * (e.shiftKey ? 10 : 1),
                ),
              );
            } else if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              setEditorWidth(
                e.key === "Home" ? MIN_EDITOR_WIDTH : maxEditorWidth,
              );
            }
          }}
        >
          <span aria-hidden="true">
            <svg
              width="22"
              height="16"
              viewBox="0 0 22 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 4 3 8l4 4M3 8h16m-4-4 4 4-4 4" />
            </svg>
          </span>
        </div>
        <fieldset
          id="warehouse-settings"
          disabled={busy}
          className="wh-editor"
          hidden={settingsHidden}
        >
          <section className="wh-panel wh-paper-panel">
            <h2>02 · {t("paperType")}</h2>
            <label>
              {t("preset")}
              <select
                data-testid="warehouse-paper"
                value={
                  customPaper
                    ? "custom"
                    : Object.entries(presets).find(
                        ([_, p]) =>
                          JSON.stringify(normalizePaper(p)) ===
                          JSON.stringify(normalizePaper(project.paper)),
                      )?.[0] || "custom"
                }
                onChange={(e) => {
                  setCustomPaper(e.target.value === "custom");
                  if (e.target.value === "custom" && paperSettings.current)
                    paperSettings.current.open = true;
                  if (presets[e.target.value])
                    patch({
                      paper: { ...presets[e.target.value] },
                      start: 0,
                      offsetX: 0,
                      offsetY: 0,
                    });
                }}
              >
                <option value="custom">{t("custom")}</option>
                {(project.printer === "office"
                  ? ["a4", "letter"]
                  : ["roll-1", "roll-2", "roll-3", "roll-102x152"]
                ).map((key) => (
                  <option key={key} value={key}>
                    {key === "a4"
                      ? "A4"
                      : key === "letter"
                        ? "Letter"
                        : key === "roll-102x152"
                          ? `102 × 152 mm · ${t("twoRows")}`
                          : `${t("roll")} · ${key.slice(-1)} ${t("across")}`}{" "}
                    · {presets[key].width} × {presets[key].height} mm
                  </option>
                ))}
              </select>
            </label>
            <details className="wh-paper-settings" ref={paperSettings}>
              <summary>{t("paperSettings")}</summary>
              <div className="wh-fields">
                {(
                  [
                    "pageWidth",
                    "pageHeight",
                    "width",
                    "height",
                    "columns",
                    "rows",
                    "left",
                    "right",
                    "top",
                    "bottom",
                    "gapX",
                    "gapY",
                  ] as (keyof Paper | "right" | "bottom")[]
                ).map((key) =>
                  num(
                    key,
                    t(key as WarehouseKey | HomeKey),
                    key === "right" || key === "bottom"
                      ? margins[key]
                      : (project.paper[key] as number),
                    (n) =>
                      key === "right" || key === "bottom"
                        ? updatePaper(setOppositeMargin(project.paper, key, n))
                        : updatePaper({ [key]: n }),
                    ["columns", "rows"].includes(key) ? "" : "mm",
                  ),
                )}
                {num(
                  "offsetX",
                  t("offsetX"),
                  project.offsetX,
                  (n) => patch({ offsetX: n }),
                  "mm",
                )}
                {num(
                  "offsetY",
                  t("offsetY"),
                  project.offsetY,
                  (n) => patch({ offsetY: n }),
                  "mm",
                )}
                {num("skip", t("start"), project.start, (n) =>
                  patch({ start: n }),
                )}
                <label>
                  {t("dpi")}
                  <select
                    aria-label={t("dpi")}
                    value={project.dpi}
                    onChange={(e) => patch({ dpi: Number(e.target.value) })}
                  >
                    {(project.printer === "zebra"
                      ? [203, 300]
                      : [203, 300, 600]
                    ).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hm-hint">{t("marginHelp")}</p>
            </details>
            <p className="hm-hint">
              {t(project.paper.medium === "roll" ? "rollNote" : "layoutNote")}
            </p>
            <section
              className="wh-symbol-size"
              data-testid="warehouse-symbol-size"
              aria-labelledby="wh-barcode-heading"
            >
              <h3 id="wh-barcode-heading">{t("barcodeSection")}</h3>
              <div className="wh-fields">
                <label>
                  {t("format")}
                  <select
                    aria-label={t("format")}
                    value={project.format}
                    onChange={(e) =>
                      patch({
                        format: e.target.value as WarehouseProject["format"],
                      })
                    }
                  >
                    <option value="auto">{t("auto")}</option>
                    <option value="code128">Code 128</option>
                    <option value="qrcode">QR</option>
                  </select>
                </label>
                <label>
                  {t("symbolSize")}
                  <select
                    aria-label={t("symbolSize")}
                    value={project.symbolSize ? "custom" : "auto"}
                    onChange={(e) =>
                      patch({
                        symbolSize:
                          e.target.value === "auto"
                            ? null
                            : {
                                moduleDots:
                                  firstSymbol?.moduleDots ??
                                  (project.format === "qrcode" ? 4 : 3),
                                height:
                                  Math.ceil(
                                    (firstSymbol?.heightMm ??
                                      Math.max(4, project.paper.height / 2)) *
                                      1000,
                                  ) / 1000,
                              },
                      })
                    }
                  >
                    <option value="auto">{t("symbolAuto")}</option>
                    <option value="custom">{t("symbolCustom")}</option>
                  </select>
                </label>
              </div>
              {project.symbolSize && (
                <>
                  <div className="wh-fields">
                    {num(
                      "moduleDots",
                      t("symbolModule"),
                      project.symbolSize.moduleDots ??
                        firstSymbol?.moduleDots ??
                        3,
                      (moduleDots) =>
                        patch({
                          symbolSize: {
                            height: project.symbolSize!.height,
                            moduleDots,
                          },
                        }),
                      "dots",
                    )}
                    {project.format !== "qrcode" &&
                      num(
                        "symbolHeight",
                        t("symbolHeight"),
                        project.symbolSize.height,
                        (height) =>
                          patch({
                            symbolSize: {
                              moduleDots:
                                project.symbolSize!.moduleDots ??
                                firstSymbol?.moduleDots ??
                                3,
                              height,
                            },
                          }),
                        "mm",
                      )}
                  </div>
                  <p className="hm-hint">{t("symbolSizeHelp")}</p>
                </>
              )}
              <div
                className="wh-code-preview"
                data-testid="warehouse-code-preview"
              >
                <h4>{t("symbolPreview")}</h4>
                {result.error || metricsError ? (
                  <p className="wh-error" role="alert">
                    {result.error || metricsError}
                  </p>
                ) : firstSymbol ? (
                  <>
                    <div className="wh-code-image">
                      <img
                        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(firstSymbol.codeSvg)}`}
                        alt={t("symbolPreview")}
                        style={{ width: `${firstSymbol.widthMm}mm` }}
                        data-width-mm={firstSymbol.widthMm}
                        data-height-mm={firstSymbol.heightMm}
                      />
                    </div>
                    <p
                      className="hm-hint"
                      data-testid="warehouse-symbol-actual"
                    >
                      {t("symbolActual")} ·{" "}
                      {firstSymbol.format === "qrcode" ? "QR" : "Code 128"} ·{" "}
                      {firstSymbol.widthMm.toFixed(2)} ×{" "}
                      {firstSymbol.heightMm.toFixed(2)} mm
                      {" · "}
                      {firstSymbol.moduleDots} {t("symbolDots")}
                    </p>
                  </>
                ) : (
                  <p className="hm-hint">{t("empty")}</p>
                )}
              </div>
            </section>
          </section>

          <section className="wh-panel wh-label-panel">
            {project.mode === "shelf" && <RackDiagram language={language} />}
            <h2>03 · {t("label")}</h2>
            <div className="hm-tabs">
              {(["shelf", "sku"] as const).map((mode) => (
                <button
                  key={mode}
                  data-mode={mode}
                  aria-pressed={project.mode === mode}
                  onClick={() => patch({ mode })}
                >
                  {t(mode)}
                </button>
              ))}
            </div>
            {project.mode === "shelf" && (
              <>
                <div className="wh-fields wh-sequence-fields">
                  <label>
                    {t("zone")}
                    <input
                      value={sequence.zone}
                      maxLength={20}
                      onChange={(e) =>
                        setSequence({ ...sequence, zone: e.target.value })
                      }
                    />
                  </label>
                  {(["start", "racks", "levels", "bins"] as const).map((key) =>
                    num(
                      key,
                      t(key === "start" ? "firstRack" : key),
                      sequence[key],
                      (n) => setSequence({ ...sequence, [key]: n }),
                    ),
                  )}
                </div>
                <button
                  onClick={() => {
                    try {
                      updateItems(
                        shelfItems(
                          sequence.zone,
                          sequence.start,
                          sequence.racks,
                          sequence.levels,
                          sequence.bins,
                        ),
                      );
                    } catch (e) {
                      setNotice(fail(e));
                    }
                  }}
                >
                  {t("generate")}
                </button>
              </>
            )}
            <details
              className="wh-import"
              open={table.length ? true : undefined}
            >
              <summary>{t("import")}</summary>
              <div className="hm-actions">
                <button onClick={() => csvFile.current?.click()}>
                  {t("import")}
                </button>
                <button
                  onClick={() =>
                    run(() =>
                      save("BarcodeMate-warehouse-sample.csv", sample, "csv"),
                    )
                  }
                >
                  {t("sample")}
                </button>
              </div>
              <label>
                {t("paste")}
                <textarea
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setTable([]);
                  }}
                  placeholder={sample}
                  rows={4}
                />
              </label>
              <button onClick={() => stage(csv)}>{t("preview")}</button>
              {table.length > 0 && (
                <>
                  <label className="hm-check">
                    <input
                      type="checkbox"
                      checked={header}
                      onChange={(e) => setHeader(e.target.checked)}
                    />
                    {t("header")}
                  </label>
                  <div className="wh-fields">
                    {(["code", "name", "location", "copies"] as const).map(
                      (key) => (
                        <label key={key}>
                          {t(key === "copies" ? "quantity" : key)}
                          <select
                            data-map={key}
                            value={map[key]}
                            onChange={(e) =>
                              setMap({ ...map, [key]: Number(e.target.value) })
                            }
                          >
                            {key !== "code" && (
                              <option value={-1}>{t("skip")}</option>
                            )}
                            {table[0].map((cell, i) => (
                              <option key={i} value={i}>
                                {t("column")} {i + 1}
                                {header ? ` · ${cell}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ),
                    )}
                  </div>
                  <div className="wh-table-scroll">
                    <table>
                      <tbody>
                        {table.slice(0, 4).map((cells, i) => (
                          <tr key={i}>
                            {cells.map((cell, j) => (
                              <td key={j}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    className="hm-primary"
                    onClick={() => {
                      try {
                        const items = importItems(table, map, header);
                        const next = validateProject({
                          ...project,
                          lists: { ...project.lists, [project.mode]: items },
                        });
                        change(next);
                        setTable([]);
                        setCsv("");
                        setListPage(0);
                      } catch (e) {
                        setNotice(fail(e));
                      }
                    }}
                  >
                    {t("apply")}
                  </button>
                </>
              )}
            </details>
            <div className="wh-table-scroll">
              <table className="wh-items">
                <thead>
                  <tr>
                    {(
                      [
                        "code",
                        "name",
                        "location",
                        "quantity",
                        "remove",
                      ] as const
                    ).map((k) => (
                      <th key={k}>{t(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice(listPage * 20, listPage * 20 + 20)
                    .map((item, index) => (
                      <tr key={item.id}>
                        {(["code", "name", "location"] as const).map((k) => (
                          <td key={k}>
                            <input
                              aria-label={`${t(k)} ${listPage * 20 + index + 1}`}
                              value={item[k]}
                              maxLength={
                                k === "code" ? 160 : k === "name" ? 120 : 80
                              }
                              onChange={(e) =>
                                updateItems(
                                  rows.map((r) =>
                                    r.id === item.id
                                      ? { ...r, [k]: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                        ))}
                        <td>
                          <label className="wh-quantity">
                            <span className="wh-sr">
                              {t("quantity") +
                                " " +
                                (listPage * 20 + index + 1)}
                            </span>
                            <AdjustmentInput
                              integer
                              value={item.copies}
                              onChange={(n) =>
                                updateItems(
                                  rows.map((r) =>
                                    r.id === item.id ? { ...r, copies: n } : r,
                                  ),
                                )
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <button
                            aria-label={t("remove") + " " + item.code}
                            onClick={() => {
                              updateItems(rows.filter((r) => r.id !== item.id));
                              setListPage(
                                Math.min(
                                  listPage,
                                  Math.max(
                                    0,
                                    Math.ceil((rows.length - 1) / 20) - 1,
                                  ),
                                ),
                              );
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="hm-actions">
              <button
                disabled={rows.length >= 1000}
                onClick={() => {
                  updateItems([
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      code: `SKU-${String(rows.length + 1).padStart(3, "0")}`,
                      name: "",
                      location: "",
                      copies: 1,
                    },
                  ]);
                  setListPage(Math.floor(rows.length / 20));
                }}
              >
                {t("addRow")}
              </button>
              {rows.length > 20 && (
                <>
                  <button
                    disabled={listPage === 0}
                    onClick={() => setListPage(listPage - 1)}
                  >
                    ←
                  </button>
                  <span>
                    {listPage + 1} / {Math.ceil(rows.length / 20)}
                  </span>
                  <button
                    disabled={(listPage + 1) * 20 >= rows.length}
                    onClick={() => setListPage(listPage + 1)}
                  >
                    →
                  </button>
                </>
              )}
            </div>
          </section>
        </fieldset>
      </div>
    </section>
  );
}
