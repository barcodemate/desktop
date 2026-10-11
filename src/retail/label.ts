import { xml } from "../core/model";
import { checkDigit } from "../core/barcode";
import type { Item, WarehouseProject } from "../warehouse/core";
import { bad, dotsPerMm } from "../warehouse/errors";
import { fitCode } from "../warehouse/symbols";
import { discountPercent, priceText } from "./model";
import { retailText } from "./i18n";

export function retailFormat(code: string, format: WarehouseProject["format"]) {
  const selected =
    format === "auto"
      ? /^\d{13}$/.test(code)
        ? "ean13"
        : /^\d{12}$/.test(code)
          ? "upca"
          : /^\d{8}$/.test(code)
            ? "ean8"
            : "code128"
      : format;
  const length = { ean13: 13, upca: 12, ean8: 8 }[selected as "ean13"];
  if (
    length &&
    (!/^\d+$/.test(code) ||
      code.length !== length ||
      checkDigit(code.slice(0, -1)) !== code.at(-1))
  )
    bad("retailCodeError", code);
  return selected;
}
function units(value: string) {
  return [...value].reduce(
    (sum, c) =>
      sum +
      (/[^\u0000-\u024f]/.test(c)
        ? 1
        : /[il.,' ]/.test(c)
          ? 0.3
          : /[MW@]/.test(c)
            ? 0.9
            : 0.59),
    0,
  );
}
function wrap(
  value: string,
  width: number,
  size: number,
  max: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    if (units(word) * size > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const char of word) {
        if (units(line + char) * size > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    } else if (line && units(line + " " + word) * size > width) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  if (lines.length > max) bad("barcodeError", value);
  return lines;
}
export function retailLabel(item: Item, p: WarehouseProject) {
  const options = p.retail!,
    data = item.retail!;
  const name = item.name.trim() || item.code;
  if (!name) bad("retailNameError");
  const price = priceText(data.price, options);
  if (
    options.template !== "product" &&
    !price &&
    !(options.template === "sale" && data.offer.trim())
  )
    bad("retailMissingPrice", name);
  const original =
    options.template === "sale" ? priceText(data.originalPrice, options) : "";
  const discount = original
    ? price
      ? discountPercent(data.price, data.originalPrice)
      : bad("retailMissingPrice", name)
    : 0;
  const density = p.printer === "zebra" ? dotsPerMm(p.dpi) : p.dpi / 25.4;
  const align = (mm: number) => Math.round(mm * density) / density;
  const width = p.printer === "zebra" ? align(p.paper.width) : p.paper.width;
  const height = p.printer === "zebra" ? align(p.paper.height) : p.paper.height;
  const pad = 1.2,
    w = width - pad * 2,
    h = height - pad * 2;
  const scale = Math.max(0.65, Math.min(2.5, width / 63.5, height / 38.1));
  const small = Math.max(2, 2.6 * scale),
    titleSize = Math.max(2.6, 3.8 * scale);
  let y = pad,
    content = "";
  const text = (
    value: string,
    font: number,
    cls: string,
    weight = 400,
    maxLines = 1,
    extra = "",
  ) => {
    for (const line of wrap(value, w - 0.6, font, maxLines)) {
      y += font;
      content += `<text class="ink ${cls}" x="${width / 2}" y="${y}" font-size="${font}" font-weight="${weight}" text-anchor="middle" direction="${/[\u0590-\u08ff]/.test(line) ? "rtl" : "ltr"}" unicode-bidi="plaintext" ${extra}>${xml(line)}</text>`;
      y += font * 0.28;
    }
  };
  if (options.template === "sale") {
    const badge = retailText(options.locale, "saleBadge");
    const size = Math.max(2.2, 2.8 * scale);
    content += `<rect x="${pad}" y="${y}" width="${w}" height="${size * 1.45}" fill="#000"/>`;
    text(badge, size, "sale-badge", 700, 1, 'fill="#fff"');
    y += size * 0.3;
  }
  text(name, titleSize, "title", 700, 2);
  if (data.unit.trim()) text(data.unit, small, "unit");
  if (original) {
    const before = content.length;
    text(
      original + (discount ? `  −${discount}%` : ""),
      small,
      "original-price",
    );
    content =
      content.slice(0, before) +
      content
        .slice(before)
        .replace(
          xml(original),
          `<tspan text-decoration="line-through">${xml(original)}</tspan>`,
        );
  }
  if (price) {
    const preferred = (options.template === "product" ? 5.5 : 8.3) * scale;
    const size = Math.min(preferred, (w - 0.6) / Math.max(1, units(price)));
    if (size < 3) bad("barcodeError", name);
    text(price, size, "price", 700);
  }
  if (options.template === "sale" && data.offer.trim())
    text(data.offer, Math.max(2.2, 3 * scale), "offer", 700, 2);
  if (data.note.trim()) text(data.note, small, "note", 400, 2);
  let codeSvg = "",
    format = "",
    widthMm = 0,
    heightMm = 0,
    moduleDots = 0;
  const available =
    height - pad - y - (p.format === "none" ? 0 : small * 1.28 + 0.5);
  if (available < -0.001) bad("barcodeError", name);
  if (p.format !== "none") {
    if (!item.code.trim()) bad("codeError", name);
    const selected = retailFormat(item.code, p.format);
    if (available < 4) bad("barcodeError", name);
    const s = fitCode(item.code, p, w, available, [selected]);
    ({ format, widthMm, heightMm, moduleDots } = s);
    codeSvg = s.svg;
    const codeY = align(y + Math.max(0, (available - heightMm) / 2));
    content += `<svg class="ink barcode" x="${align((width - widthMm) / 2)}" y="${codeY}" width="${widthMm}" height="${heightMm}" viewBox="0 0 ${s.width} ${s.height}">${s.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`;
    y = height - pad - small * 1.28;
    // Captions are never truncated; overflow blocks output just like other text.
    const caption = Math.min(small, (w - 0.6) / Math.max(1, units(item.code)));
    if (caption < 1.8) bad("barcodeError", item.code);
    text(item.code, caption, "code");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" style="overflow:visible" font-family="Arial, sans-serif" fill="#000">${content}</svg>`;
  return {
    html: svg,
    svg,
    codeSvg,
    format,
    widthMm,
    heightMm,
    moduleDots,
    availableWidth: w,
    availableHeight: Math.max(0, available),
  };
}
