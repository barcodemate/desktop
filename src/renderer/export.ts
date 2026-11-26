import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { zipSync, strToU8 } from "fflate";
import { encode } from "../core/barcode";
import {
  safeName,
  type Design,
  type ExportFormat,
  type Row,
} from "../core/model";
// Only PNG keeps the transparency; the other raster formats have no alpha
// channel here and are filled with the chosen background colour.
export async function raster(d: Design, alpha = false) {
  const result = encode(d);
  const image = new Image();
  const url = URL.createObjectURL(
    new Blob([result.svg], { type: "image/svg+xml" }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(Error("Unable to render image."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(result.width);
    canvas.height = Math.ceil(result.height);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    if (!(alpha && d.transparent)) {
      ctx.fillStyle = d.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx, result };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
function pngDpi(bytes: Uint8Array, dpi: number) {
  const chunk = new Uint8Array(21),
    v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set(strToU8("pHYs"), 4);
  v.setUint32(8, Math.round(dpi / 0.0254));
  v.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, 33));
  out.set(chunk, 33);
  out.set(bytes.subarray(33), 54);
  return out;
}
export function bmp(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dpi: number,
) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const bytes = new Uint8Array(54 + stride * height);
  const v = new DataView(bytes.buffer);
  bytes.set([66, 77]);
  v.setUint32(2, bytes.length, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, stride * height, true);
  v.setInt32(38, Math.round(dpi / 0.0254), true);
  v.setInt32(42, Math.round(dpi / 0.0254), true);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4,
        t = 54 + (height - 1 - y) * stride + x * 3;
      bytes[t] = rgba[s + 2];
      bytes[t + 1] = rgba[s + 1];
      bytes[t + 2] = rgba[s];
    }
  return bytes;
}
export function tiff(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dpi: number,
) {
  const count = 13,
    extra = 8 + 2 + count * 12 + 4,
    bits = extra,
    xres = extra + 6,
    yres = extra + 14,
    pixels = extra + 22;
  const bytes = new Uint8Array(pixels + width * height * 3);
  const v = new DataView(bytes.buffer);
  bytes.set([73, 73, 42, 0]);
  v.setUint32(4, 8, true);
  v.setUint16(8, count, true);
  const fields = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, 3, bits],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, pixels],
    [277, 3, 1, 3],
    [278, 4, 1, height],
    [279, 4, 1, width * height * 3],
    [282, 5, 1, xres],
    [283, 5, 1, yres],
    [284, 3, 1, 1],
    [296, 3, 1, 2],
  ];
  fields.forEach(([tag, type, n, value], i) => {
    const o = 10 + i * 12;
    v.setUint16(o, tag, true);
    v.setUint16(o + 2, type, true);
    v.setUint32(o + 4, n, true);
    if (type === 3 && n === 1) v.setUint16(o + 8, value, true);
    else v.setUint32(o + 8, value, true);
  });
  for (let i = 0; i < 3; i++) v.setUint16(bits + i * 2, 8, true);
  for (const p of [xres, yres]) {
    v.setUint32(p, dpi, true);
    v.setUint32(p + 4, 1, true);
  }
  for (let i = 0, j = pixels; i < rgba.length; i += 4) {
    bytes[j++] = rgba[i];
    bytes[j++] = rgba[i + 1];
    bytes[j++] = rgba[i + 2];
  }
  return bytes;
}
export async function imageBytes(
  d: Design,
  format: Exclude<ExportFormat, "pdf">,
) {
  if (format === "svg") return strToU8(encode(d).svg);
  const { canvas, ctx } = await raster(d, format === "png");
  if (format === "bmp" || format === "tiff") {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return format === "bmp"
      ? bmp(data, canvas.width, canvas.height, d.dpi)
      : tiff(data, canvas.width, canvas.height, d.dpi);
  }
  if (format === "gif") {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      palette = quantize(data, 256);
    const gif = GIFEncoder();
    gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, {
      palette,
    });
    gif.finish();
    return gif.bytes();
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Image export failed."))),
      format === "jpeg" ? "image/jpeg" : "image/png",
      1,
    ),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (format === "png") return pngDpi(bytes, d.dpi);
  if (bytes[6] === 74 && bytes[7] === 70) {
    bytes[13] = 1;
    new DataView(bytes.buffer).setUint16(14, d.dpi);
    new DataView(bytes.buffer).setUint16(16, d.dpi);
  }
  return bytes;
}
export async function batchZip(
  design: Design,
  rows: Row[],
  format: Exclude<ExportFormat, "pdf">,
  progress: (n: number) => void,
  signal: AbortSignal,
) {
  if (!rows.length) throw Error("Add data before exporting a batch.");
  const files: Record<string, Uint8Array> = {};
  const names = new Set<string>();
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if (signal.aborted) throw Error("Export cancelled.");
    const r = rows[i];
    let name = safeName(r.name || r.data.slice(0, 80));
    if (names.has(name.toLowerCase())) name += `-${i + 1}`;
    while (names.has(name.toLowerCase())) name += "-copy";
    names.add(name.toLowerCase());
    try {
      const bytes = await imageBytes(
        {
          ...design,
          type: r.type || design.type,
          data: r.data,
          captionAbove: r.captionAbove || design.captionAbove,
          captionBelow: r.captionBelow || design.captionBelow,
        },
        format,
      );
      total += bytes.length;
      if (total > 200_000_000)
        throw Error("Batch exceeds 200 MB. Export a smaller selection.");
      files[name + "." + format] = bytes;
    } catch (e) {
      throw Error(
        `Row ${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    progress(i + 1);
    await new Promise((r) => setTimeout(r, 0));
  }
  return zipSync(files, { level: 0 });
}
