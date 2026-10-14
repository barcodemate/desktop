import Papa from "papaparse";
import {
  rowFrom,
  numberIn,
  type Row,
  type Project,
  validateLayout,
  xml,
} from "./model";
import { encode } from "./barcode";
export function parseTable(text: string, delimiter?: string) {
  if (text.length > 20_000_000) throw Error("Import limit is 20 MB.");
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    delimiter: delimiter || undefined,
  });
  const errors = result.errors.filter(
    (e) => e.code !== "UndetectableDelimiter",
  );
  if (errors.length)
    throw Error(`CSV: ${errors[0].message} (row ${(errors[0].row ?? 0) + 1})`);
  if (result.data.length > 10001)
    throw Error("Import at most 10,000 rows at a time.");
  return result.data;
}
export function mapRows(
  table: string[][],
  mapping: {
    data: number;
    name: number;
    quantity: number;
    type: number;
    captionAbove: number;
    captionBelow: number;
  },
  header = true,
): Row[] {
  return table.slice(header ? 1 : 0).map((cells, i) => {
    const data = cells[mapping.data] ?? "";
    const q = mapping.quantity >= 0 ? Number(cells[mapping.quantity]) : 1;
    if (!Number.isInteger(q) || q < 1 || q > 10000)
      throw Error(
        `Row ${i + 1}: quantity must be an integer from 1 to 10,000.`,
      );
    return {
      ...rowFrom(data, cells[mapping.name] ?? "", q, cells[mapping.type] ?? ""),
      captionAbove: cells[mapping.captionAbove] ?? "",
      captionBelow: cells[mapping.captionBelow] ?? "",
    };
  });
}
/**
 * A column of same-length digits is almost always a retail code, and the
 * importer has no way to know what the project is set to: it will happily
 * render thirteen EAN digits as Code 128, which scans as the right number
 * under the wrong symbology. Offer the match rather than silently accepting
 * it — never refuse the import, since printing digits as Code 128 is a real
 * thing to want.
 *
 * Only formats that declare a digit count are considered, so declaring one in
 * the catalog is enough to widen this. A length two formats could both claim
 * is left alone instead of guessed at, except that a complete code carrying
 * its own check digit outranks one that is missing it.
 */
export function suggestType(
  values: readonly string[],
  current: string,
  types: readonly { id: string; digits?: number }[],
): { id: string; length: number } | null {
  const present = values.map((v) => (v ?? "").trim()).filter(Boolean);
  if (!present.length || present.some((v) => !/^[0-9]+$/.test(v))) return null;
  const length = present[0].length;
  if (present.some((v) => v.length !== length)) return null;
  const fixed = types.filter((t) => t.digits);
  const complete = fixed.filter((t) => t.digits === length);
  const candidates = complete.length
    ? complete
    : fixed.filter((t) => t.digits === length + 1);
  if (candidates.length !== 1 || candidates[0].id === current) return null;
  return { id: candidates[0].id, length };
}
export function sequence(
  start: string,
  count: number,
  step: string,
  prefix: string,
  suffix: string,
  pad: number,
  random = false,
) {
  if (!/^-?\d+$/.test(start) || !/^-?\d+$/.test(step))
    throw Error("Start and step must be whole numbers.");
  numberIn(count, 1, 10000, "Count");
  numberIn(pad, 0, 40, "Padding");
  if (!Number.isInteger(count) || !Number.isInteger(pad))
    throw Error("Count and padding must be whole numbers.");
  const first = BigInt(start),
    delta = BigInt(step);
  if (delta === 0n) throw Error("Step cannot be zero.");
  let values = Array.from(
    { length: count },
    (_, i) => first + BigInt(i) * delta,
  );
  if (random)
    for (let i = values.length - 1; i > 0; i--) {
      const n = crypto.getRandomValues(new Uint32Array(1))[0];
      const j = n % (i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
  return values.map((v) =>
    rowFrom(
      prefix +
        (v < 0 ? "-" : "") +
        (v < 0 ? -v : v).toString().padStart(pad, "0") +
        suffix,
    ),
  );
}
export const rowsToCSV = (rows: Row[]) =>
  Papa.unparse(
    rows.map((r) => ({
      data: r.data,
      name: r.name,
      quantity: r.quantity,
      type: r.type,
      captionAbove: r.captionAbove,
      captionBelow: r.captionBelow,
    })),
    { escapeFormulae: true },
  );
export function labelPages(p: Project) {
  const l = validateLayout(p.layout);
  const rows = p.rows.length ? p.rows : [rowFrom(p.design.data, p.design.name)];
  const total = rows.reduce((n, r) => n + r.quantity, 0);
  if (total > 10000)
    throw Error("Print or export at most 10,000 labels at a time.");
  const per = l.columns * l.rows;
  const pages: string[][] = [];
  let slot = l.start;
  for (const row of rows) {
    if (
      !Number.isInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > 10000
    )
      throw Error("Copies must be an integer from 1 to 10,000.");
    const symbol = encode({
      ...p.design,
      data: row.data,
      name: row.name,
      type: row.type || p.design.type,
      captionAbove: row.captionAbove || p.design.captionAbove,
      captionBelow: row.captionBelow || p.design.captionBelow,
    });
    if (symbol.widthMm > l.width - 2 || symbol.heightMm > l.height - 2)
      throw Error(
        `“${row.name || row.data.slice(0, 30)}” is larger than the label at its actual size. Reduce module width or height, or choose a larger label.`,
      );
    for (let q = 0; q < row.quantity; q++, slot++) {
      const page = Math.floor(slot / per),
        index = slot % per;
      const x =
          l.order === "rows" ? index % l.columns : Math.floor(index / l.rows),
        y = l.order === "rows" ? Math.floor(index / l.columns) : index % l.rows;
      pages[page] ??= [];
      pages[page].push(
        `<div class="label" style="left:${l.marginX + x * (l.width + l.gapX)}mm;top:${l.marginY + y * (l.height + l.gapY)}mm;width:${l.width}mm;height:${l.height}mm">${symbol.svg}</div>`,
      );
    }
  }
  return pages.map(
    (items) =>
      `<section class="sheet" style="width:${l.paperWidth}mm;height:${l.paperHeight}mm">${items.join("")}</section>`,
  );
}
export function labelDocument(p: Project) {
  const pages = labelPages(p);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${xml(p.name)}</title><style>@page{size:${p.layout.paperWidth}mm ${p.layout.paperHeight}mm;margin:0}*{box-sizing:border-box}html,body{margin:0}.sheet{position:relative;break-after:page;background:white;overflow:hidden}.sheet:last-child{break-after:auto}.label{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden}.label svg{flex:none}svg text{font-family:Arial,sans-serif}</style></head><body>${pages.join("")}</body></html>`;
}
