import catalogData from "./catalog.json";
export const catalog = catalogData;
export type Barcode = (typeof catalog)[number];
export type ExportFormat =
  "svg" | "png" | "jpeg" | "gif" | "bmp" | "tiff" | "pdf";
export interface Design {
  type: string;
  data: string;
  name: string;
  height: number;
  module: number;
  dpi: number;
  rotation: 0 | 90 | 180 | 270;
  foreground: string;
  background: string;
  // Absent in projects saved before 0.5.5, which stay opaque.
  transparent?: boolean;
  showText: boolean;
  textSize: number;
  textAlign: "left" | "center" | "right";
  captionAbove: string;
  captionBelow: string;
  quietX: number;
  quietY: number;
  reduction: number;
  dotty: boolean;
  includeCheck: boolean;
  parseEscapes: boolean;
  hexInput: boolean;
  options: string;
  logo: string;
  logoPercent: number;
}
export interface Row {
  id: string;
  data: string;
  name: string;
  quantity: number;
  captionAbove: string;
  captionBelow: string;
  type: string;
}
export interface LabelLayout {
  paperWidth: number;
  paperHeight: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  marginX: number;
  marginY: number;
  gapX: number;
  gapY: number;
  start: number;
  order: "rows" | "columns";
  guides: boolean;
}
export interface Project {
  schema: 1;
  name: string;
  design: Design;
  rows: Row[];
  layout: LabelLayout;
  updatedAt: string;
}
export const defaultDesign = (): Design => ({
  type: "code128",
  data: "MATE-2026-001",
  name: "Inventory label",
  height: 18,
  module: 0.254,
  dpi: 300,
  rotation: 0,
  foreground: "#111827",
  background: "#ffffff",
  showText: true,
  textSize: 10,
  textAlign: "center",
  captionAbove: "",
  captionBelow: "",
  quietX: 4,
  quietY: 3,
  reduction: 0,
  dotty: false,
  includeCheck: false,
  parseEscapes: false,
  hexInput: false,
  options: "{}",
  logo: "",
  logoPercent: 15,
});
export const defaultLayout = (): LabelLayout => ({
  paperWidth: 210,
  paperHeight: 297,
  width: 63.5,
  height: 38.1,
  columns: 3,
  rows: 7,
  marginX: 7.25,
  marginY: 15.15,
  gapX: 2.5,
  gapY: 0,
  start: 0,
  order: "rows",
  guides: true,
});
export const newProject = (): Project => ({
  schema: 1,
  name: "Untitled project",
  design: defaultDesign(),
  rows: [],
  layout: defaultLayout(),
  updatedAt: new Date().toISOString(),
});
export const rowFrom = (
  data: string,
  name = "",
  quantity = 1,
  type = "",
): Row => ({
  id: crypto.randomUUID(),
  data,
  name,
  quantity,
  type,
  captionAbove: "",
  captionBelow: "",
});
export function numberIn(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw Error(`${label}: ${min}–${max}`);
  return value;
}
export function validateDesign(d: Design) {
  if (!d || !catalog.some((t) => t.id === d.type))
    throw Error("Unknown barcode format.");
  for (const k of [
    "data",
    "name",
    "captionAbove",
    "captionBelow",
    "options",
    "foreground",
    "background",
    "logo",
  ] as const)
    if (typeof d[k] !== "string") throw Error(`Invalid ${k}.`);
  if (
    d.data.length > 10000 ||
    d.name.length > 200 ||
    d.captionAbove.length > 200 ||
    d.captionBelow.length > 200 ||
    d.options.length > 10000
  )
    throw Error("Text is too long.");
  numberIn(d.height, 1, 300, "Height");
  numberIn(d.module, 0.08, 5, "Module width");
  numberIn(d.dpi, 72, 2400, "DPI");
  numberIn(d.textSize, 5, 48, "Font size");
  numberIn(d.quietX, 0, 40, "Quiet zone");
  numberIn(d.quietY, 0, 40, "Quiet zone");
  numberIn(d.reduction, 0, 0.5, "Bar reduction");
  numberIn(d.logoPercent, 5, 25, "Logo size");
  if (
    ![0, 90, 180, 270].includes(d.rotation) ||
    !["left", "center", "right"].includes(d.textAlign)
  )
    throw Error("Invalid alignment or rotation.");
  for (const k of ["foreground", "background"] as const)
    if (!/^#[0-9a-f]{6}$/i.test(d[k]))
      throw Error("Use a six-digit RGB color.");
  for (const k of [
    "showText",
    "dotty",
    "includeCheck",
    "parseEscapes",
    "hexInput",
  ] as const)
    if (typeof d[k] !== "boolean") throw Error(`Invalid ${k}.`);
  for (const k of ["transparent"] as const)
    if (d[k] !== undefined && typeof d[k] !== "boolean")
      throw Error(`Invalid ${k}.`);
  if (
    d.logo &&
    (!/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(d.logo) ||
      d.logo.length > 4_000_000)
  )
    throw Error("Logo must be a PNG or JPEG under 3 MB.");
  return d;
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== "object")
    throw Error("Not a BarcodeMate project.");
  const p = value as Project;
  if (
    p.schema !== 1 ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !Array.isArray(p.rows) ||
    p.rows.length > 10000
  )
    throw Error("Unsupported project or too many rows.");
  if (
    typeof p.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(p.updatedAt))
  )
    throw Error("Invalid project date.");
  if (new Set(p.rows.map((r) => r?.id)).size !== p.rows.length)
    throw Error("Duplicate row identifiers.");
  validateDesign(p.design);
  validateLayout(p.layout);
  for (const r of p.rows) {
    if (
      !r ||
      ["id", "data", "name", "type", "captionAbove", "captionBelow"].some(
        (k) => typeof (r as unknown as Record<string, unknown>)[k] !== "string",
      ) ||
      r.data.length > 10000 ||
      r.name.length > 200 ||
      r.captionAbove.length > 200 ||
      r.captionBelow.length > 200 ||
      !Number.isInteger(r.quantity) ||
      r.quantity < 1 ||
      r.quantity > 10000
    )
      throw Error("Invalid batch row.");
    if (r.type && !catalog.some((t) => t.id === r.type))
      throw Error("Unknown row format.");
  }
  return structuredClone(p);
}
export function validateLayout(l: LabelLayout) {
  if (!l) throw Error("Missing label layout.");
  for (const k of ["paperWidth", "paperHeight", "width", "height"] as const)
    numberIn(l[k], 5, 1500, k);
  for (const k of ["marginX", "marginY", "gapX", "gapY"] as const)
    numberIn(l[k], 0, 500, k);
  for (const k of ["columns", "rows"] as const)
    if (!Number.isInteger(l[k]) || l[k] < 1 || l[k] > 50)
      throw Error("Rows and columns: 1–50.");
  if (
    !Number.isInteger(l.start) ||
    l.start < 0 ||
    l.start >= l.columns * l.rows
  )
    throw Error("Start position is outside the sheet.");
  if (!["rows", "columns"].includes(l.order))
    throw Error("Unknown print order.");
  if (
    2 * l.marginX + l.columns * l.width + (l.columns - 1) * l.gapX >
      l.paperWidth + 0.01 ||
    2 * l.marginY + l.rows * l.height + (l.rows - 1) * l.gapY >
      l.paperHeight + 0.01
  )
    throw Error(
      "Labels extend beyond the paper. Adjust margins, spacing or label size.",
    );
  return l;
}
export const xml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function safeName(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, 100)
      .replace(/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i, "_$1") ||
    "barcode"
  );
}
