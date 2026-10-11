import { rollPreview } from "./rollPreview";
import Papa from "papaparse";
import { xml } from "../core/model";
import { bad, dotsPerMm, WarehouseError } from "./errors";
export { dotsPerMm, WarehouseError } from "./errors";
import { fitCode } from "./symbols";
import {
  blankRetail,
  cleanRetail,
  printableItems,
  retailItem,
  validateRetailOptions,
  type RetailFields,
  type RetailOptions,
} from "../retail/model";
import { retailLabel } from "../retail/label";
export const STORE = "barcodemate.warehouse.v1";
export type Item = {
  id: string;
  code: string;
  name: string;
  location: string;
  copies: number;
  retail?: RetailFields;
};
export type Paper = {
  medium: "sheet" | "roll";
  pageWidth: number;
  pageHeight: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  left: number;
  top: number;
  gapX: number;
  gapY: number;
};
export type WarehouseProject = {
  schema: "barcodemate-warehouse-1" | "barcodemate-retail-1";
  retail?: RetailOptions;
  printer: "office" | "thermal" | "zebra";
  mode: "shelf" | "sku";
  lists: { shelf: Item[]; sku: Item[] };
  paper: Paper;
  format: "auto" | "code128" | "qrcode" | "ean13" | "ean8" | "upca" | "none";
  // width is accepted only for older local projects/backups; new edits use dots.
  symbolSize: { moduleDots?: number; width?: number; height: number } | null;
  dpi: number;
  offsetX: number;
  offsetY: number;
  start: number;
};
const number = (v: unknown, min: number, max: number, integer = false) =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  v >= min &&
  v <= max &&
  (!integer || Number.isInteger(v));
export function shelfItems(
  zone: string,
  start: number,
  racks: number,
  levels: number,
  bins: number,
): Item[] {
  if (
    !zone.trim() ||
    zone.length > 20 ||
    ![start, racks, levels, bins].every((n) => number(n, 1, 999, true)) ||
    racks * levels * bins > 1000 ||
    start + racks > 1000
  )
    bad("sequenceError");
  const items: Item[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  for (let r = start; r < start + racks; r++)
    for (let l = 1; l <= levels; l++)
      for (let b = 1; b <= bins; b++)
        items.push({
          id: crypto.randomUUID(),
          code: `${zone.trim()}-${pad(r)}-${pad(l)}-${pad(b)}`,
          name: "",
          location: "",
          copies: 1,
        });
  return items;
}
export const presets: Record<string, Paper> = {
  "roll-102x152": {
    medium: "roll",
    pageWidth: 102,
    pageHeight: 152,
    width: 100,
    height: 75,
    columns: 1,
    rows: 2,
    left: 1,
    top: 1,
    gapX: 0,
    gapY: 0,
  },
  "roll-1": {
    medium: "roll",
    pageWidth: 104,
    pageHeight: 50,
    width: 100,
    height: 50,
    columns: 1,
    rows: 1,
    left: 2,
    top: 0,
    gapX: 0,
    gapY: 3,
  },
  "roll-2": {
    medium: "roll",
    pageWidth: 106,
    pageHeight: 30,
    width: 50,
    height: 30,
    columns: 2,
    rows: 1,
    left: 2,
    top: 0,
    gapX: 2,
    gapY: 3,
  },
  "roll-3": {
    medium: "roll",
    pageWidth: 98,
    pageHeight: 20,
    width: 30,
    height: 20,
    columns: 3,
    rows: 1,
    left: 2,
    top: 0,
    gapX: 2,
    gapY: 3,
  },
  a4: {
    medium: "sheet",
    pageWidth: 210,
    pageHeight: 297,
    width: 63.5,
    height: 38.1,
    columns: 3,
    rows: 7,
    left: 7.25,
    top: 15.15,
    gapX: 2.5,
    gapY: 0,
  },
  letter: {
    medium: "sheet",
    pageWidth: 215.9,
    pageHeight: 279.4,
    width: 66.675,
    height: 25.4,
    columns: 3,
    rows: 10,
    left: 4.7625,
    top: 12.7,
    gapX: 3.175,
    gapY: 0,
  },
};
export function normalizePaper(p: Paper): Paper {
  return { ...p };
}
// Opposite margins are the actual remaining space, not another independent
// dimension that could disagree with the stock and die-cut label geometry.
const marginPrecision = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
export function paperMargins(p: Paper) {
  return {
    right: marginPrecision(
      p.pageWidth - p.left - p.columns * p.width - (p.columns - 1) * p.gapX,
    ),
    bottom: marginPrecision(
      p.pageHeight - p.top - p.rows * p.height - (p.rows - 1) * p.gapY,
    ),
  };
}
export function setOppositeMargin(
  p: Paper,
  edge: "right" | "bottom",
  value: number,
): Paper {
  const margins = paperMargins(p);
  return edge === "right"
    ? { ...p, left: marginPrecision(p.left + margins.right - value) }
    : { ...p, top: marginPrecision(p.top + margins.bottom - value) };
}
export function validPaper(input: Paper): Paper {
  if (!input || !["sheet", "roll"].includes(input.medium)) bad("paperError");
  const p = normalizePaper(input);
  if (
    !["pageWidth", "pageHeight", "width", "height"].every((k) =>
      number(p[k as keyof Paper], 8, 600),
    ) ||
    !["columns", "rows"].every((k) =>
      number(p[k as keyof Paper], 1, 50, true),
    ) ||
    !["left", "top", "gapX", "gapY"].every((k) =>
      number(p[k as keyof Paper], 0, 100),
    ) ||
    p.columns * p.rows > 1000
  )
    bad("paperError");
  const margins = paperMargins(p);
  if (margins.right < -0.001 || margins.bottom < -0.001) bad("paperError");
  return {
    medium: p.medium,
    pageWidth: p.pageWidth,
    pageHeight: p.pageHeight,
    width: p.width,
    height: p.height,
    columns: p.columns,
    rows: p.rows,
    left: p.left,
    top: p.top,
    gapX: p.gapX,
    gapY: p.gapY,
  };
}
export function newWarehouse(): WarehouseProject {
  return {
    schema: "barcodemate-warehouse-1",
    printer: "office",
    mode: "shelf",
    lists: {
      shelf: shelfItems("A", 1, 1, 3, 4),
      sku: [
        {
          id: crypto.randomUUID(),
          code: "SKU-001",
          name: "",
          location: "A-01-01",
          copies: 1,
        },
      ],
    },
    paper: { ...presets.a4 },
    format: "auto",
    symbolSize: null,
    dpi: 300,
    offsetX: 0,
    offsetY: 0,
    start: 0,
  };
}
export function newRetail(
  locale = "en",
  name = "Organic green tea",
): WarehouseProject {
  return {
    ...newWarehouse(),
    schema: "barcodemate-retail-1",
    mode: "sku",
    retail: { template: "shelf", currency: "USD", locale },
    lists: {
      shelf: [],
      sku: [
        retailItem({
          code: "5901234123457",
          name,
          retail: {
            ...blankRetail(),
            price: "8.50",
            originalPrice: "10.00",
            unit: "250 g",
          },
        }),
      ],
    },
  };
}
export function validateProject(p: WarehouseProject): WarehouseProject {
  const retail = p?.schema === "barcodemate-retail-1";
  if (
    !p ||
    (!retail && p.schema !== "barcodemate-warehouse-1") ||
    (retail && (p.mode !== "sku" || !p.retail)) ||
    (!retail && p.retail !== undefined) ||
    !["office", "thermal", "zebra"].includes(p.printer) ||
    !["shelf", "sku"].includes(p.mode) ||
    !(
      retail
        ? ["auto", "code128", "qrcode", "ean13", "ean8", "upca", "none"]
        : ["auto", "code128", "qrcode"]
    ).includes(p.format) ||
    ![203, 300, 600].includes(p.dpi) ||
    (p.printer === "zebra" && ![203, 300].includes(p.dpi))
  )
    bad();
  const paper = validPaper(p.paper);
  // Projects saved before manual symbol sizing retain the existing automatic fit.
  const symbolSize = p.symbolSize == null ? null : p.symbolSize;
  if (
    symbolSize !== null &&
    (!(symbolSize.moduleDots !== undefined
      ? number(symbolSize.moduleDots, 1, 256, true)
      : number(symbolSize.width, 1, 600)) ||
      !number(symbolSize.height, 1, 600))
  )
    bad("symbolSizeError");
  if (
    !number(p.offsetX, -600, 600) ||
    !number(p.offsetY, -600, 600) ||
    !number(p.start, 0, paper.columns * paper.rows - 1, true)
  )
    bad("paperError");
  for (const mode of ["shelf", "sku"] as const) {
    const rows = p.lists?.[mode];
    if (!Array.isArray(rows) || rows.length > 1000) bad("limit");
    const ids = new Set<string>();
    let total = 0;
    for (const r of rows) {
      if (
        !r ||
        typeof r.id !== "string" ||
        r.id.length > 100 ||
        ids.has(r.id) ||
        !["code", "name", "location"].every(
          (k) => typeof r[k as keyof Item] === "string",
        ) ||
        r.code.length > 160 ||
        r.name.length > 120 ||
        r.location.length > 80 ||
        !number(r.copies, 0, 1000, true)
      )
        bad();
      ids.add(r.id);
      total += r.copies;
    }
    if (total > 1000) bad("limit");
  }
  const clean = (items: Item[]) =>
    items.map(({ id, code, name, location, copies, retail: fields }) => ({
      id,
      code,
      name,
      location,
      copies,
      ...(retail ? { retail: cleanRetail(fields!) } : {}),
    }));
  const normalized: WarehouseProject = {
    schema: p.schema,
    ...(retail ? { retail: validateRetailOptions(p.retail!) } : {}),
    printer: p.printer,
    mode: p.mode,
    lists: { shelf: clean(p.lists.shelf), sku: clean(p.lists.sku) },
    paper,
    format: p.format,
    symbolSize: symbolSize && {
      ...(symbolSize.moduleDots !== undefined
        ? { moduleDots: symbolSize.moduleDots }
        : { width: symbolSize.width }),
      height: symbolSize.height,
    },
    dpi: p.dpi,
    offsetX: p.offsetX,
    offsetY: p.offsetY,
    start: p.start,
  };
  // Preserve the first label's module size when opening the earlier local
  // width-limit setting. Subsequent edits and backups use explicit dots.
  if (normalized.symbolSize?.width !== undefined) {
    const first = normalized.lists[normalized.mode].find(
      (item) => item.copies > 0,
    );
    if (first) {
      try {
        normalized.symbolSize = {
          moduleDots: labelSymbol(first, normalized).moduleDots,
          height: normalized.symbolSize.height,
        };
      } catch {
        // Keep an invalid legacy setting visible until the user corrects it.
      }
    }
  }
  return normalized;
}
export function parseImport(input: string): string[][] {
  if (input.length > 2_000_000) bad("importError");
  const parsed = Papa.parse<string[]>(input.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (
    parsed.errors.some((e) => e.code !== "UndetectableDelimiter") ||
    parsed.data.length > 1001 ||
    parsed.data.some((row) => row.length > 1000)
  )
    bad("importError");
  return parsed.data;
}
export function importItems(
  table: string[][],
  map: { code: number; name: number; location: number; copies: number },
  header: boolean,
): Item[] {
  if (
    !Object.values(map).every((n) => number(n, -1, 1000, true)) ||
    map.code < 0
  )
    bad("importError");
  const rows = table.slice(header ? 1 : 0);
  if (!rows.length || rows.length > 1000) bad("importError");
  return rows.map((cells, index) => {
    const code = cells[map.code] ?? "",
      count = map.copies < 0 ? "1" : cells[map.copies];
    if (
      !code.trim() ||
      count === undefined ||
      !/^\d+$/.test(count.trim()) ||
      !number(Number(count), 0, 1000, true)
    )
      bad("importError", String(index + 1));
    return {
      id: crypto.randomUUID(),
      code,
      name: cells[map.name] ?? "",
      location: cells[map.location] ?? "",
      copies: Number(count),
    };
  });
}
type LabelSymbol = {
  html: string;
  svg: string;
  codeSvg: string;
  format: string;
  widthMm: number;
  heightMm: number;
  moduleDots: number;
  availableWidth: number;
  availableHeight: number;
};
const cache = new Map<string, LabelSymbol>();
export function labelSymbol(item: Item, p: WarehouseProject) {
  const key = JSON.stringify([
    item.code,
    item.name,
    item.location,
    p.paper.width,
    p.paper.height,
    p.format,
    p.dpi,
    p.printer,
    p.symbolSize,
    p.retail,
    item.retail,
  ]);
  const hit = cache.get(key);
  if (hit) return hit;
  if (p.retail) {
    const result = retailLabel(item, p);
    if (cache.size > 2000) cache.clear();
    cache.set(key, result);
    return result;
  }
  if (!item.code.trim()) bad("codeError", item.name);
  const density = p.printer === "zebra" ? dotsPerMm(p.dpi) : p.dpi / 25.4;
  const labelWidth =
    p.printer === "zebra"
      ? Math.round(p.paper.width * density) / density
      : p.paper.width;
  const labelHeight =
    p.printer === "zebra"
      ? Math.round(p.paper.height * density) / density
      : p.paper.height;
  const pad = 1.5,
    w = labelWidth - 2 * pad,
    h = labelHeight - 2 * pad;
  const title = item.name || item.code;
  const font = Math.min(
    Math.max(3.5, Math.min(12, labelHeight * 0.16)),
    Math.max(2.2, (w / Math.max([...title].length, 1)) * 1.3),
  );
  const footerFont = Math.max(2.5, Math.min(6, labelHeight * 0.07)),
    footerLine = footerFont * 1.36,
    titleHeight = Math.max(4, font * 1.3),
    footerHeight =
      (item.name ? footerLine : 0) + (item.location ? footerLine : 0);
  const available = h - titleHeight - footerHeight - 0.8;
  if (available < 4) bad("barcodeError", item.code);
  const s = fitCode(item.code, p, w, available);
  const { format, dpi } = s;
  const dpmm = dpi / 25.4,
    align = (mm: number) => Math.round(mm * dpmm) / dpmm;
  const x = align((labelWidth - s.widthMm) / 2),
    y = align(pad + titleHeight + (available - s.heightMm) / 2);
  const text = (value: string, baseline: number, size: number, cls: string) =>
    `<text class="ink ${cls}" x="${labelWidth / 2}" y="${baseline}" font-size="${size}" font-weight="${cls === "title" ? 700 : 400}" text-anchor="middle" direction="${/[\u0590-\u08ff]/.test(value) ? "rtl" : "ltr"}" unicode-bidi="plaintext">${xml(value)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}mm" height="${labelHeight}mm" viewBox="0 0 ${labelWidth} ${labelHeight}" style="overflow:visible" font-family="Arial, sans-serif" fill="#000">${text(title, pad + font, font, "title")}<svg class="ink barcode" x="${x}" y="${y}" width="${s.widthMm}" height="${s.heightMm}" viewBox="0 0 ${s.width} ${s.height}">${s.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>${item.name ? text(item.code, labelHeight - pad - (item.location ? footerLine : 0) - footerFont * 0.28, footerFont, "code") : ""}${item.location ? text(item.location, labelHeight - pad - footerFont * 0.28, footerFont, "location") : ""}</svg>`;
  const result = {
    html: svg,
    svg,
    codeSvg: s.svg,
    format,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    moduleDots: s.moduleDots,
    availableWidth: w,
    availableHeight: available,
  };
  if (cache.size > 2000) cache.clear();
  cache.set(key, result);
  return result;
}
// Build the first physical page without changing quantities or the saved project.
export function sampleProject(input: WarehouseProject): WarehouseProject {
  const project = validateProject(input);
  let remaining = project.paper.columns * project.paper.rows - project.start;
  const items: Item[] = [];
  for (const item of printableItems(project)) {
    const copies = Math.min(item.copies, remaining);
    if (copies > 0) items.push({ ...item, copies });
    remaining -= copies;
    if (!remaining) break;
  }
  if (!items.length) throw new WarehouseError("empty");
  project.lists[project.mode] = items;
  return project;
}
export function renderWarehouse(
  input: WarehouseProject,
  pageIndex = 0,
  preview = true,
) {
  const p = validateProject(input),
    paper = p.paper,
    rows = printableItems(p),
    per = paper.columns * paper.rows;
  const total = rows.reduce((n, r) => n + r.copies, 0),
    pageCount = Math.max(1, Math.ceil((total + p.start) / per));
  const sheets: string[][] = Array.from({ length: pageCount }, () => []);
  let slot = p.start;
  const formats = new Set<string>();
  const errors: WarehouseError[] = [];
  for (const row of rows) {
    let s;
    try {
      s = labelSymbol(row, p);
    } catch (e) {
      if (!preview) throw e;
      errors.push(e as WarehouseError);
      s = {
        format: "",
        html: `<div style="padding:2mm;color:#923c24;font:3mm sans-serif">${xml(row.code)} · !</div>`,
      };
    }
    if (s.format) formats.add(s.format);
    for (let n = 0; n < row.copies; n++, slot++) {
      const i = slot % per,
        col = i % paper.columns,
        r = Math.floor(i / paper.columns),
        x = paper.left + col * (paper.width + paper.gapX),
        y = paper.top + r * (paper.height + paper.gapY);
      if (
        x + p.offsetX < -0.001 ||
        y + p.offsetY < -0.001 ||
        x + p.offsetX + paper.width > paper.pageWidth + 0.001 ||
        y + p.offsetY + paper.height > paper.pageHeight + 0.001
      ) {
        if (!preview) bad("offsetError");
        if (!errors.some((e) => e.key === "offsetError"))
          errors.push(new WarehouseError("offsetError"));
      }
      sheets[Math.floor(slot / per)].push(
        `<div class="label" data-code="${xml(row.code)}" style="left:${x}mm;top:${y}mm;width:${paper.width}mm;height:${paper.height}mm"><div class="shift" style="transform:translate(${p.offsetX}mm,${p.offsetY}mm)">${s.html}</div></div>`,
      );
    }
  }
  const index = Math.max(0, Math.min(pageCount - 1, pageIndex));
  const guides = preview
    ? Array.from(
        { length: per },
        (_, i) =>
          `<div class="guide" style="left:${paper.left + (i % paper.columns) * (paper.width + paper.gapX)}mm;top:${paper.top + Math.floor(i / paper.columns) * (paper.height + paper.gapY)}mm;width:${paper.width}mm;height:${paper.height}mm"></div>`,
      ).join("")
    : "";
  const roll =
    preview && paper.medium === "roll"
      ? rollPreview(paper, sheets, guides, index)
      : null;
  const sections =
    roll?.html ??
    (preview ? [sheets[index]] : sheets)
      .map(
        (page) => `<section class="sheet">${guides}${page.join("")}</section>`,
      )
      .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>BarcodeMate ${p.retail ? "Retail Stores" : "Warehouse"}</title><style>@page{size:${paper.pageWidth}mm ${paper.pageHeight}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}${preview ? "html,body{overflow:hidden}" : ""}.sheet{position:relative;width:${paper.pageWidth}mm;height:${paper.pageHeight}mm;break-after:page;overflow:hidden;background:${preview ? "#d7dfdb" : "#fff"}}.sheet:last-child{break-after:auto}.guide{position:absolute;background:#fff;border:.2mm solid #b5c3ba;border-radius:1mm}.label{position:absolute}.shift{width:100%;height:100%}${roll?.css ?? ""}@media print{.sheet{background:#fff}.guide{display:none}}</style></head><body>${sections}</body></html>`;
  return {
    html,
    paper,
    total,
    pageCount,
    pageIndex: index,
    displayWidth: roll?.displayWidth ?? paper.pageWidth,
    displayHeight: roll?.displayHeight ?? paper.pageHeight,
    previewStep: roll?.previewStep ?? 1,
    rowsShown: roll?.rowsShown ?? 1,
    formats: [...formats],
    errors,
  };
}
