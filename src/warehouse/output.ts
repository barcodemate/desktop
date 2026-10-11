import { nativeCode128 } from "./nativeCode128";
import {
  dotsPerMm,
  labelSymbol,
  renderWarehouse,
  validateProject,
  WarehouseError,
  type WarehouseProject,
} from "./core";
import { printableItems } from "../retail/model";
export const MAX_ZPL_BYTES = 2_000_000;
// Inspect real font metrics after layout, including glyph fallback for CJK/RTL.
export async function checkedDocument(project: WarehouseProject) {
  const view = renderWarehouse(project, 0, false);
  if (!view.total) throw new WarehouseError("empty");
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.title = "BarcodeMate";
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${view.paper.pageWidth}mm`,
    height: `${view.paper.pageHeight}mm`,
    border: "0",
  });
  document.body.append(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new WarehouseError("invalid")),
        10000,
      );
      frame.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      frame.srcdoc = view.html;
    });
    await frame.contentDocument!.fonts.ready;
    for (const el of frame.contentDocument!.querySelectorAll<SVGGraphicsElement>(
      ".ink",
    )) {
      const rect = el.getBoundingClientRect(),
        label = el.closest(".label")!.getBoundingClientRect(),
        sheet = el.closest(".sheet")!.getBoundingClientRect();
      if (
        rect.left < label.left - 0.5 ||
        rect.right > label.right + 0.5 ||
        rect.top < label.top - 0.5 ||
        rect.bottom > label.bottom + 0.5
      )
        throw new WarehouseError(
          "barcodeError",
          el.closest(".label")!.getAttribute("data-code") || "",
        );
      if (
        rect.left < sheet.left - 0.5 ||
        rect.right > sheet.right + 0.5 ||
        rect.top < sheet.top - 0.5 ||
        rect.bottom > sheet.bottom + 0.5
      )
        throw new WarehouseError("offsetError");
    }
    return { frame, view };
  } catch (e) {
    frame.remove();
    throw e;
  }
}
export function graphicFields(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x = 0,
  y = 0,
) {
  const stride = Math.ceil(width / 8),
    chunkRows = Math.floor(99999 / stride);
  let out = "";
  for (let top = 0; top < height; top += chunkRows) {
    const rows = Math.min(chunkRows, height - top),
      bytes = new Uint8Array(rows * stride);
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < width; col++) {
        const i = ((row + top) * width + col) * 4;
        if (
          data[i + 3] > 127 &&
          (data[i] + data[i + 1] + data[i + 2]) / 3 < 128
        )
          bytes[row * stride + (col >> 3)] |= 0x80 >> (col % 8);
      }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    out += `^FO${x},${y + top}^GFA,${bytes.length},${bytes.length},${stride},${hex}^FS\n`;
  }
  return out;
}
// Omit empty rows/columns around text. The barcode itself is now a native field;
// shipping its former white rectangle as a bitmap would waste most of the gain.
export function textGraphicFields(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  let out = "",
    top = -1,
    left = width,
    right = -1;
  const flush = (bottom: number) => {
    if (top < 0) return;
    const w = right - left + 1,
      h = bottom - top;
    const crop = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++)
      crop.set(
        data.subarray(
          ((top + row) * width + left) * 4,
          ((top + row) * width + right + 1) * 4,
        ),
        row * w * 4,
      );
    out += graphicFields(crop, w, h, x + left, y + top);
    top = -1;
    left = width;
    right = -1;
  };
  for (let row = 0; row < height; row++) {
    let occupied = false;
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      if (
        data[i + 3] > 127 &&
        (data[i] + data[i + 1] + data[i + 2]) / 3 < 128
      ) {
        occupied = true;
        left = Math.min(left, col);
        right = Math.max(right, col);
      }
    }
    if (occupied && top < 0) top = row;
    if (!occupied) flush(row);
  }
  flush(height);
  return out;
}
async function raster(svg: string, width: number, height: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function createZpl(
  input: WarehouseProject,
  configurePage = false,
) {
  const p = validateProject(input);
  if (p.printer !== "zebra" || p.paper.medium !== "roll")
    throw new WarehouseError("paperError");
  const { frame } = await checkedDocument(p);
  frame.remove();
  const d = dotsPerMm(p.dpi),
    paper = p.paper,
    w = Math.round(paper.width * d),
    h = Math.round(paper.height * d);
  if (w * h > 12_000_000) throw new WarehouseError("sizeError");
  // Direct HTTP jobs must not inherit a previous driver's narrower print width.
  // Set geometry only when sending; never save settings or calibrate the media.
  const nativeDpi = p.dpi === 203 ? 200 : 300;
  const setup = configurePage
    ? `^MUD,${nativeDpi},${nativeDpi}\n^PW${Math.round(paper.pageWidth * d)}\n^LL${Math.round(paper.pageHeight * d)}\n^LS0\n^LT0\n`
    : "";
  let out = "",
    slot = p.start,
    page = -1;
  const cache = new Map<string, Uint8ClampedArray>();
  for (const item of printableItems(p)) {
    if (!item.copies) continue;
    const symbol = labelSymbol(item, p);
    const native =
      symbol.format === "code128"
        ? nativeCode128(symbol.codeSvg, symbol.moduleDots)
        : null;
    const placement = /<svg class="ink barcode" x="([^"]+)" y="([^"]+)"/.exec(
      symbol.svg,
    );
    if (native && !placement) throw new WarehouseError("invalid");
    const rasterSvg = native
      ? symbol.svg.replace(/<svg class="ink barcode"[\s\S]*?<\/svg>/, "")
      : symbol.svg;
    let pixels = cache.get(rasterSvg);
    if (!pixels) {
      pixels = await raster(
        rasterSvg.replace(
          /width="[^"]+mm" height="[^"]+mm"/,
          `width="${w}" height="${h}"`,
        ),
        w,
        h,
      );
      cache.set(rasterSvg, pixels);
    }
    for (let n = 0; n < item.copies; n++, slot++) {
      const next = Math.floor(slot / (paper.columns * paper.rows));
      if (next !== page) {
        if (page >= 0) out += "^PQ1^XZ\n";
        out += `^XA\n${setup}^LH0,0\n`;
        page = next;
      }
      const originX = Math.round(
        (paper.left +
          (slot % paper.columns) * (paper.width + paper.gapX) +
          p.offsetX) *
          d,
      );
      const originY = Math.round(
        (paper.top +
          Math.floor((slot % (paper.columns * paper.rows)) / paper.columns) *
            (paper.height + paper.gapY) +
          p.offsetY) *
          d,
      );
      out += (native ? textGraphicFields : graphicFields)(
        pixels,
        w,
        h,
        originX,
        originY,
      );
      if (native) {
        const x = originX + Math.round(Number(placement![1]) * d) + native.x;
        const y = originY + Math.round(Number(placement![2]) * d) + native.y;
        out += `^FO${x},${y}^BY${native.module},2,${native.height}^BCN,${native.height},N,N,N,N^FH_^FD${native.hex}^FS\n`;
      }
      if (out.length > MAX_ZPL_BYTES - 20)
        throw new WarehouseError("sizeError");
    }
  }
  if (page >= 0) out += "^PQ1^XZ\n";
  return out;
}
