export class WarehouseError extends Error {
  constructor(
    public key: string,
    public detail = "",
  ) {
    super(key);
  }
}
export const bad = (key = "invalid", detail = ""): never => {
  throw new WarehouseError(key, detail);
};
// Zebra print heads come in three densities, each a whole number of dots per
// millimetre. "203 dpi" is the trade name of the 8 dot head.
export const ZEBRA_DPI = [203, 300, 600] as const;
export function dotsPerMm(dpi: number) {
  if (dpi === 203) return 8;
  if (dpi === 300) return 12;
  if (dpi === 600) return 24;
  return bad("dpiError");
}
/**
 * The pair for ^MUD that leaves dots as dots. ^MU can rescale a format written
 * for one density to another; equal values switch that off, so a previous job's
 * setting cannot resize this one. Its base parameter only accepts 150, 200 and
 * 300, so a 600 dpi job also says 300,300: the point is that the two match.
 */
export const zplUnits = (dpi: number) => (dpi === 203 ? 200 : 300);
