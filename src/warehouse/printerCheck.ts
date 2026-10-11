import { dotsPerMm, validateProject, type WarehouseProject } from "./core";
import { printableItems } from "../retail/model";
import type { PrinterInfo } from "../../electron/warehouse-printer";
import type { WarehouseKey } from "./i18n";

// Match the occupied bitmap bounds, including each GFA row's byte padding.
export function zplBounds(input: WarehouseProject) {
  const p = validateProject(input),
    paper = p.paper,
    d = dotsPerMm(p.dpi);
  const total = printableItems(p).reduce((sum, item) => sum + item.copies, 0);
  let width = 0,
    height = 0;
  for (let slot = p.start; slot < p.start + total; slot++) {
    const x =
      paper.left +
      (slot % paper.columns) * (paper.width + paper.gapX) +
      p.offsetX;
    const y =
      paper.top +
      Math.floor((slot % (paper.columns * paper.rows)) / paper.columns) *
        (paper.height + paper.gapY) +
      p.offsetY;
    width = Math.max(
      width,
      Math.round(x * d) + Math.ceil(Math.round(paper.width * d) / 8) * 8,
    );
    height = Math.max(height, Math.round(y * d) + Math.round(paper.height * d));
  }
  return { width, height };
}

export function printerIssues(
  device: PrinterInfo,
  project: WarehouseProject,
): WarehouseKey[] {
  const issues: WarehouseKey[] = [];
  if (!device.languages.toLowerCase().includes("zpl"))
    issues.push("checkLanguageMismatch");
  if (![203, 300].includes(device.dpi) || device.dpi !== project.dpi)
    issues.push("checkDpiMismatch");
  try {
    const bounds = zplBounds(project);
    if (bounds.width > device.width || bounds.height > device.length)
      issues.push("checkSizeMismatch");
    if (project.paper.medium !== "roll") issues.push("paperError");
  } catch {
    issues.push("checkLayoutInvalid");
  }
  return issues;
}
