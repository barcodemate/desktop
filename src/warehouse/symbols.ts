import { encode } from "../core/barcode";
import { defaultDesign } from "../core/model";
import { bad, dotsPerMm, WarehouseError } from "./errors";
import type { WarehouseProject } from "./core";

// One dot-aligned encoder for every label use case. Callers supply only the
// space reserved for the symbol; margins, quiet zones and overflow rules stay shared.
export function fitCode(
  code: string,
  p: WarehouseProject,
  w: number,
  available: number,
  formats = p.format === "auto" ? ["code128", "qrcode"] : [p.format],
) {
  const options = formats;
  let overflow = false;
  let narrowModule = false;
  for (const format of options) {
    try {
      const targetWidth = p.symbolSize?.width ?? w;
      // QR stays square; its width setting is a side-length limit. A stored
      // linear-code height must not distort or constrain it after switching.
      const targetHeight =
        (format === "qrcode" ? p.symbolSize?.width : p.symbolSize?.height) ??
        available;
      if (targetHeight < 4) continue;
      const dpi = p.printer === "zebra" ? dotsPerMm(p.dpi) * 25.4 : p.dpi;
      const minScale =
        format === "qrcode"
          ? Math.max(1, Math.round((0.3 * dpi) / 25.4 / 2))
          : Math.max(1, Math.round((0.25 * dpi) / 25.4));
      // Grow the encoded symbol in whole printer dots, including quiet zones.
      // Changing the label width must grow its contents, not just its white canvas.
      const atScale = (scale: number, halfQrGrid = false) => {
        // bwip QR uses two device pixels per module at scale 1; Code 128 uses one.
        // For explicit QR dot counts, encode on a doubled grid. Each module
        // then lands on exactly the requested number of native printer dots,
        // including odd counts, without resampling a bitmap.
        const renderDpi = dpi * (halfQrGrid ? 2 : 1);
        const moduleDots =
          (scale * (format === "qrcode" ? 2 : 1)) / (halfQrGrid ? 2 : 1);
        return encode({
          ...defaultDesign(),
          type: format,
          data: code,
          name: "",
          showText: false,
          // bwip validates textsize even when the caption is disabled.
          textSize: 5,
          height: Math.min(300, targetHeight - 1),
          module: (scale * 25.4) / renderDpi,
          dpi: renderDpi,
          quietX:
            ((moduleDots * 25.4) / dpi) *
            (format === "qrcode"
              ? 4
              : format.startsWith("ean") || format === "upca"
                ? 11
                : 10),
          quietY: format === "qrcode" ? ((moduleDots * 25.4) / dpi) * 4 : 0.4,
          foreground: "#000000",
          background: "#ffffff",
        });
      };
      const requestedDots = p.symbolSize?.moduleDots;
      if (
        p.printer === "zebra" &&
        format === "code128" &&
        requestedDots !== undefined &&
        requestedDots > 10
      ) {
        overflow = true;
        continue;
      }
      if (
        requestedDots !== undefined &&
        requestedDots < minScale * (format === "qrcode" ? 2 : 1)
      ) {
        narrowModule = true;
        continue;
      }
      let s;
      if (requestedDots !== undefined) {
        s = atScale(requestedDots, format === "qrcode");
      } else {
        s = atScale(minScale);
        if (
          s.widthMm > targetWidth + 0.001 ||
          s.heightMm > targetHeight + 0.001
        )
          continue;
        const maxScale = Math.floor(
          Math.min(
            p.printer === "zebra" && format === "code128" ? 10 : Infinity,
            (minScale * targetWidth) / s.widthMm,
            format === "qrcode"
              ? (minScale * targetHeight) / s.heightMm
              : Infinity,
            // Encoder limits: module <= 5 mm and quiet zones <= 40 mm.
            (dpi / 25.4) *
              (format === "qrcode"
                ? 5
                : format.startsWith("ean") || format === "upca"
                  ? 40 / 11
                  : 4),
          ),
        );
        for (let scale = maxScale; scale > minScale; scale--) {
          const candidate = atScale(scale);
          if (
            candidate.widthMm <= targetWidth + 0.001 &&
            candidate.heightMm <= targetHeight + 0.001
          ) {
            s = candidate;
            break;
          }
        }
      }
      // Do not silently shrink an oversized custom symbol to the label.
      if (s.widthMm > w + 0.001 || s.heightMm > available + 0.001) {
        overflow = true;
        continue;
      }
      return {
        ...s,
        format,
        dpi,
        moduleDots:
          requestedDots ?? s.pixelsPerModule * (format === "qrcode" ? 2 : 1),
      };
    } catch (e) {
      if (e instanceof WarehouseError) throw e;
    }
  }
  return bad(
    overflow
      ? "symbolSizeOverflow"
      : narrowModule
        ? "symbolModuleTooSmall"
        : p.symbolSize
          ? "symbolSizeError"
          : "barcodeError",
    code,
  );
}
