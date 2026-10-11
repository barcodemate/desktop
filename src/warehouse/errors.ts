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
export function dotsPerMm(dpi: number) {
  if (dpi === 203) return 8;
  if (dpi === 300) return 12;
  return bad("dpiError");
}
