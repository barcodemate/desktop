import type { Item, WarehouseProject } from "../warehouse/core";
import { bad } from "../warehouse/errors";

export const RETAIL_STORE = "barcodemate.retail.v1";
export type RetailOptions = {
  template: "product" | "shelf" | "sale";
  currency: string;
  locale: string;
};
export type RetailFields = {
  price: string;
  originalPrice: string;
  unit: string;
  note: string;
  offer: string;
  selected: boolean;
};
export const blankRetail = (): RetailFields => ({
  price: "",
  originalPrice: "",
  unit: "",
  note: "",
  offer: "",
  selected: true,
});
export function retailItem(part: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    location: "",
    copies: 1,
    ...part,
    retail: { ...blankRetail(), ...part.retail },
  };
}
export function validateRetailOptions(value: RetailOptions): RetailOptions {
  if (
    !value ||
    !["product", "shelf", "sale"].includes(value.template) ||
    typeof value.locale !== "string" ||
    value.locale.length > 40
  )
    bad("retailInvalid");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))
    bad("retailCurrencyError");
  try {
    new Intl.NumberFormat(value.locale, {
      style: "currency",
      currency: value.currency,
    });
  } catch {
    bad("retailCurrencyError");
  }
  return {
    template: value.template,
    currency: value.currency,
    locale: value.locale,
  };
}
export function cleanRetail(value: RetailFields): RetailFields {
  if (!value || typeof value.selected !== "boolean") bad("retailInvalid");
  for (const [key, max] of Object.entries({
    price: 24,
    originalPrice: 24,
    unit: 40,
    note: 160,
    offer: 80,
  })) {
    if (
      typeof value[key as keyof RetailFields] !== "string" ||
      (value[key as keyof RetailFields] as string).length > max
    )
      bad("retailInvalid");
  }
  return {
    price: value.price,
    originalPrice: value.originalPrice,
    unit: value.unit,
    note: value.note,
    offer: value.offer,
    selected: value.selected,
  };
}
// Keep money as decimal strings in projects. Never parse a price with parseFloat:
// it would silently turn "12,50" into 12 or accept a trailing currency symbol.
export function parsePrice(value: string, decimal: "." | "," = "."): string {
  const input = value.trim();
  if (!input) return "";
  const pattern =
    decimal === "." ? /^\d{1,9}(?:\.\d{1,3})?$/ : /^\d{1,9}(?:,\d{1,3})?$/;
  if (!pattern.test(input)) bad("retailPriceError");
  const [whole, fraction] = input.replace(",", ".").split(".");
  return String(Number(whole)) + (fraction ? "." + fraction : "");
}
export function priceText(value: string, options: RetailOptions) {
  const clean = parsePrice(value);
  if (!clean) return "";
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const fraction = clean.split(".")[1] || "";
  if (/[1-9]/.test(fraction.slice(decimals))) bad("retailPrecisionError");
  return formatter.format(Number(clean));
}
export function discountPercent(price: string, original: string) {
  const milli = (s: string) => {
    const [whole, fraction = ""] = parsePrice(s).split(".");
    return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  };
  const now = milli(price),
    before = milli(original);
  if (before <= now) bad("retailSaleError");
  // Round down to whole percent so the printed discount never overstates savings.
  return Number(((before - now) * 100n) / before);
}
export const retailColumns = [
  "name",
  "code",
  "price",
  "originalPrice",
  "unit",
  "note",
  "offer",
  "copies",
] as const;
export type RetailColumn = (typeof retailColumns)[number];
export type RetailMapping = Record<RetailColumn, number>;
export const emptyMapping = (): RetailMapping =>
  Object.fromEntries(retailColumns.map((k) => [k, -1])) as RetailMapping;
export function guessMapping(header: string[]): RetailMapping {
  const aliases: Record<RetailColumn, string[]> = {
    name: [
      "name",
      "product",
      "productname",
      "itemname",
      "title",
      "商品名",
      "商品名称",
      "名称",
    ],
    code: ["code", "barcode", "sku", "upc", "ean", "gtin", "条码", "编码"],
    price: ["price", "currentprice", "saleprice", "售价", "价格", "现价"],
    originalPrice: ["originalprice", "compareatprice", "regularprice", "原价"],
    unit: ["unit", "size", "variant", "specification", "规格", "单位"],
    note: ["note", "description", "care", "说明", "备注"],
    offer: ["offer", "promotion", "promotext", "促销", "优惠"],
    copies: ["copies", "quantity", "qty", "printquantity", "数量", "份数"],
  };
  const normalized = header.map((s) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_\-]/g, ""),
  );
  return Object.fromEntries(
    retailColumns.map((k) => [
      k,
      normalized.findIndex((s) => aliases[k].includes(s)),
    ]),
  ) as RetailMapping;
}
export function importRetail(
  table: string[][],
  map: RetailMapping,
  header: boolean,
  decimal: "." | ",",
): Item[] {
  const mapped = Object.values(map).filter((n) => n >= 0);
  if (
    !Object.values(map).every(
      (n) => Number.isInteger(n) && n >= -1 && n < 1000,
    ) ||
    new Set(mapped).size !== mapped.length ||
    (map.name < 0 && map.code < 0)
  )
    bad("retailMappingError");
  const rows = table.slice(header ? 1 : 0);
  if (!rows.length || rows.length > 1000) bad("importError");
  let total = 0;
  return rows.map((cells, index) => {
    const cell = (key: RetailColumn) =>
      map[key] < 0 ? "" : (cells[map[key]] ?? "").trim();
    const count = map.copies < 0 ? "1" : cell("copies");
    if (
      !/^\d+$/.test(count) ||
      Number(count) > 1000 ||
      (!cell("name") && !cell("code"))
    )
      bad("importError", String(index + 1));
    total += Number(count);
    if (total > 1000) bad("limit");
    let price: string, originalPrice: string;
    try {
      price = parsePrice(cell("price"), decimal);
      originalPrice = parsePrice(cell("originalPrice"), decimal);
    } catch {
      return bad("retailPriceError", String(index + 1));
    }
    const item = retailItem({
      name: cell("name"),
      code: cell("code"),
      copies: Number(count),
      retail: {
        price,
        originalPrice,
        unit: cell("unit"),
        note: cell("note"),
        offer: cell("offer"),
        selected: true,
      },
    });
    cleanRetail(item.retail!);
    if (item.name.length > 120 || item.code.length > 160)
      bad("importError", String(index + 1));
    return item;
  });
}
export function printableItems(p: WarehouseProject) {
  return p.lists[p.mode].filter(
    (item) => item.copies > 0 && (!p.retail || item.retail?.selected),
  );
}
