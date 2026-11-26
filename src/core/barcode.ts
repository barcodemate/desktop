import { render, drawingSVG, type RenderOptions } from "@bwip-js/generic";
import { catalog, validateDesign, xml, type Design } from "./model";
export function checkDigit(body: string) {
  if (!/^\d+$/.test(body)) throw Error("Use digits only.");
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = 4 - w)
    sum += Number(body[i]) * w;
  return String((10 - (sum % 10)) % 10);
}
export function prepareData(d: Design) {
  const type = catalog.find((t) => t.id === d.type)!;
  let data = d.data;
  if (d.hexInput) {
    if (!/^(?:[0-9a-f]{2}\s*)+$/i.test(data))
      throw Error("Hex input needs complete byte pairs, e.g. 41 42 43.");
    data = data
      .replace(/\s/g, "")
      .match(/../g)!
      .map((h) => String.fromCharCode(parseInt(h, 16)))
      .join("");
  }
  if (!data.length) throw Error("Enter data to create a barcode.");
  if (type.digits) {
    if (
      !/^\d+$/.test(data) ||
      ![type.digits - 1, type.digits].includes(data.length)
    )
      throw Error(
        `Enter ${type.digits - 1} digits, or ${type.digits} with a check digit.`,
      );
    const digit = checkDigit(
      data.length === type.digits ? data.slice(0, -1) : data,
    );
    if (data.length === type.digits - 1) data += digit;
    else if (data.at(-1) !== digit)
      throw Error(`Check digit should be ${digit}.`);
  }
  return data;
}
function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const v = h
      .slice(1)
      .match(/../g)!
      .map((x) => parseInt(x, 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const l = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l[0] + 0.05) / (l[1] + 0.05);
}
export function encode(d: Design) {
  validateDesign(d);
  const type = catalog.find((t) => t.id === d.type)!;
  const data = prepareData(d);
  let advanced: Record<string, string | number | boolean>;
  try {
    advanced = JSON.parse(d.options);
  } catch {
    throw Error("Advanced options must be valid JSON.");
  }
  if (
    !advanced ||
    Array.isArray(advanced) ||
    typeof advanced !== "object" ||
    Object.entries(advanced).some(
      ([k, v]) =>
        !/^[a-z][a-z0-9]*$/i.test(k) ||
        !["string", "number", "boolean"].includes(typeof v) ||
        (typeof v === "number" && !Number.isFinite(v)),
    )
  )
    throw Error(
      "Advanced options need simple option names and string, number or boolean values.",
    );
  const pixelsPerModule = Math.max(1, Math.round((d.module * d.dpi) / 25.4));
  const actualModule = (pixelsPerModule * 25.4) / d.dpi;
  // bwip scale is in pixels per nominal module; physical dimensions come from the target DPI.
  const scale = pixelsPerModule;
  const options = {
    ...type.options,
    ...advanced,
    bcid: d.type,
    text: data,
    scale,
    ...(type.adjustableHeight
      ? { height: (d.height * d.dpi) / (72 * scale) }
      : {}),
    includetext: d.showText && type.showTextOption,
    textsize: (d.textSize * d.dpi) / (72 * scale),
    textxalign: d.textAlign,
    barcolor: d.foreground.slice(1),
    // Without a colour the encoder draws no backing rectangle at all.
    ...(d.transparent ? {} : { backgroundcolor: d.background.slice(1) }),
    textcolor: d.foreground.slice(1),
    paddingleft: (d.quietX * d.dpi) / (25.4 * scale),
    paddingright: (d.quietX * d.dpi) / (25.4 * scale),
    paddingtop: (d.quietY * d.dpi) / (25.4 * scale),
    paddingbottom: (d.quietY * d.dpi) / (25.4 * scale),
    inkspread: (d.reduction * d.dpi) / (25.4 * scale),
    dotty: d.dotty,
    includecheck: d.includeCheck,
    parse: d.parseEscapes,
    parsefnc: d.parseEscapes,
    binarytext: d.hexInput,
  } as RenderOptions;
  let svg: string;
  try {
    svg = render(options, drawingSVG());
  } catch (e) {
    throw Error(
      (e instanceof Error ? e.message : String(e)).replace(
        /^bwipp\.[^:]+:\s*/,
        "",
      ),
    );
  }
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!match) throw Error("Encoder returned an invalid image.");
  let width = +match[1],
    height = +match[2];
  if (width * height > 40_000_000 || width > 24000 || height > 24000)
    throw Error("Image too large; reduce DPI or content.");
  const fontpx = (d.textSize * d.dpi) / 72;
  const captionHeight = fontpx * 1.55;
  const top = d.captionAbove ? captionHeight : 0,
    bottom = d.captionBelow ? captionHeight : 0;
  let inner = svg.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/, "");
  if (d.logo) {
    if (!["qrcode", "azteccode", "datamatrix"].includes(d.type))
      throw Error(
        "Logo overlays are available for QR, Aztec and Data Matrix only.",
      );
    const size = (Math.min(width, height) * d.logoPercent) / 100;
    inner += `<rect x="${(width - size) / 2 - 3}" y="${(height - size) / 2 - 3}" width="${size + 6}" height="${size + 6}" fill="${d.background}"/><image href="${d.logo}" x="${(width - size) / 2}" y="${(height - size) / 2}" width="${size}" height="${size}"/>`;
  }
  inner = `<g transform="translate(0 ${top})">${inner}</g>`;
  const caption = (text: string, y: number) =>
    `<text x="${width / 2}" y="${y}" text-anchor="middle" fill="${d.foreground}" font-family="Arial,sans-serif" font-size="${fontpx}">${xml(text)}</text>`;
  if (d.captionAbove) inner += caption(d.captionAbove, fontpx * 1.15);
  if (d.captionBelow)
    inner += caption(d.captionBelow, top + height + fontpx * 1.15);
  height += top + bottom;
  if (d.rotation === 90) {
    inner = `<g transform="translate(${height} 0) rotate(90)">${inner}</g>`;
    [width, height] = [height, width];
  } else if (d.rotation === 180)
    inner = `<g transform="translate(${width} ${height}) rotate(180)">${inner}</g>`;
  else if (d.rotation === 270) {
    inner = `<g transform="translate(0 ${width}) rotate(-90)">${inner}</g>`;
    [width, height] = [height, width];
  }
  const warnings: string[] = [];
  // What ends up behind a transparent barcode is unknown here, so say what it
  // needs instead of comparing against a background that will not be drawn.
  if (d.transparent)
    warnings.push(
      "Transparent background. Place the barcode on a plain, light surface and test a printed sample.",
    );
  else if (contrast(d.foreground, d.background) < 4.5)
    warnings.push(
      "Low color contrast. Prefer dark bars on a light background.",
    );
  if (
    d.quietX < actualModule * (type.twoDimensional ? 4 : 10) ||
    d.quietY < (type.twoDimensional ? 4 : 1) * actualModule
  )
    warnings.push(
      "Small quiet zone. Check the requirements for this barcode format.",
    );
  if (d.logo || d.dotty || d.reduction)
    warnings.push(
      "Custom styling changes scan reliability. Test the exported and printed barcode.",
    );
  if (Math.abs(actualModule - d.module) > 0.005)
    warnings.push(
      `Module width aligned to ${pixelsPerModule} printer dots (${actualModule.toFixed(3)} mm).`,
    );
  svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${(width * 25.4) / d.dpi}mm" height="${(height * 25.4) / d.dpi}mm" viewBox="0 0 ${width} ${height}">${d.transparent ? "" : `<rect width="100%" height="100%" fill="${d.background}"/>`}${inner}</svg>`;
  return {
    svg,
    width,
    height,
    widthMm: (width * 25.4) / d.dpi,
    heightMm: (height * 25.4) / d.dpi,
    data,
    actualModule,
    pixelsPerModule,
    warnings,
  };
}
