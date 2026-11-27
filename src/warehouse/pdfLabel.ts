import { dotsPerMm, type Paper } from "./core";
import { zplUnits } from "./errors";
import { graphicFields } from "./output";

// pdf.js is large and only needed once a PDF is dropped, so it is served as its
// own files and loaded on demand rather than bundled into the label tools.
const VERSION = "6.5.438";
const BASE = "/assets/pdfjs/";
let library: Promise<any> | undefined;
function pdfjs() {
  const url = `${BASE}pdf.min.js?v=${VERSION}`;
  library ??= import(url).then((module) => {
    module.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.js?v=${VERSION}`;
    return module;
  });
  library.catch(() => (library = undefined));
  return library;
}

export const PDF_MAX_BYTES = 20_000_000;
export const PDF_MAX_PAGES = 50;

export type PdfLabel = {
  name: string;
  pages: number;
  // Size of the first page and how much it is shrunk to fit the label.
  widthMm: number;
  heightMm: number;
  scale: number;
  // The first page exactly as it will be sent: black or white dots only.
  preview: HTMLCanvasElement;
  zpl: (page: number) => Promise<string>;
  close: () => void;
};

// Render each PDF page at the printer's own resolution and send it as one
// monochrome graphic. Pages keep their real size; a page larger than the
// selected label is shrunk to fit and never enlarged.
export async function openPdfLabel(
  file: File,
  paper: Paper,
  dpi: number,
): Promise<PdfLabel> {
  if (file.size > PDF_MAX_BYTES) throw Error("pdfTooLarge");
  const { getDocument } = await pdfjs();
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // Draw glyphs directly so no fonts are injected into the page, and take
    // standard fonts and character maps from this site only.
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
    standardFontDataUrl: `${BASE}standard_fonts/`,
    cMapUrl: `${BASE}cmaps/`,
    cMapPacked: true,
  });
  let pdf: any;
  try {
    pdf = await task.promise;
  } catch {
    throw Error("pdfError");
  }
  const close = () => void task.destroy();
  if (pdf.numPages > PDF_MAX_PAGES) {
    close();
    throw Error("pdfTooLarge");
  }
  const d = dotsPerMm(dpi),
    nativeDpi = zplUnits(dpi),
    printWidth = Math.round(paper.pageWidth * d),
    labelLength = Math.round(paper.pageHeight * d);
  const draw = async (number: number) => {
    const page = await pdf.getPage(number);
    const size = page.getViewport({ scale: 1 });
    const widthMm = (size.width / 72) * 25.4,
      heightMm = (size.height / 72) * 25.4;
    // A 4 × 6 in page is 101.6 × 152.4 mm, a hair over a 102 × 152 mm label.
    // Clip such a sliver rather than rescale every dot of a barcode for it.
    const fit = Math.min(paper.pageWidth / widthMm, paper.pageHeight / heightMm);
    const scale = fit >= 0.98 ? 1 : fit;
    const viewport = page.getViewport({ scale: (scale * d * 25.4) / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(printWidth, Math.round(viewport.width));
    canvas.height = Math.min(labelLength, Math.round(viewport.height));
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    page.cleanup();
    return { canvas, context, widthMm, heightMm, scale };
  };
  try {
    const first = await draw(1);
    // Show the dots the printer will get, not the smooth render behind them.
    const { canvas, context } = first;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const ink = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3 < 128;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = ink ? 0 : 255;
      image.data[i + 3] = 255;
    }
    const preview = document.createElement("canvas");
    preview.width = canvas.width;
    preview.height = canvas.height;
    preview.getContext("2d")!.putImageData(image, 0, 0);
    return {
      name: file.name,
      pages: pdf.numPages,
      widthMm: first.widthMm,
      heightMm: first.heightMm,
      scale: first.scale,
      preview,
      close,
      zpl: async (number) => {
        const { canvas, context } = await draw(number);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        return `^XA\n^MUD,${nativeDpi},${nativeDpi}\n^PW${printWidth}\n^LL${labelLength}\n^LS0\n^LT0\n^LH0,0\n${graphicFields(pixels.data, canvas.width, canvas.height)}^PQ1^XZ\n`;
      },
    };
  } catch {
    close();
    throw Error("pdfError");
  }
}
