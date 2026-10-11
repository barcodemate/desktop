import test from "node:test";
import assert from "node:assert/strict";
import {
  newRetail,
  newWarehouse,
  labelSymbol,
  parseImport,
  renderWarehouse,
  sampleProject,
  validateProject,
  presets,
  WarehouseError,
} from "../src/warehouse/core";
import {
  discountPercent,
  guessMapping,
  importRetail,
  parsePrice,
  priceText,
  retailItem,
} from "../src/retail/model";
import { retailFormat } from "../src/retail/label";
import { zplBounds } from "../src/warehouse/printerCheck";

test("retail imports map POS-style headers, preserve leading zeros and do not mutate existing rows", () => {
  const p = newRetail(),
    before = JSON.stringify(p);
  const table = parseImport(
    "\uFEFFItem Name\tSKU\tPrice\tCompare at price\tQuantity\nTea\t000123\t8.50\t10.00\t2",
  );
  const rows = importRetail(table, guessMapping(table[0]), true, ".");
  assert.equal(rows[0].code, "000123");
  assert.equal(rows[0].retail!.price, "8.50");
  assert.equal(rows[0].copies, 2);
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(
    validateProject({ ...p, lists: { shelf: [], sku: rows } }).lists.sku,
    rows,
  );
});
test("import handles comma decimals and rejects ambiguous prices, duplicate mappings and invalid quantities atomically", () => {
  const table = parseImport("name;price;copies\nTea;12,50;2");
  const map = guessMapping(table[0]);
  assert.equal(importRetail(table, map, true, ",")[0].retail!.price, "12.50");
  for (const value of ["12,50", "$12.50", "1,234.56", "-2", "NaN", "1e3"])
    assert.throws(() => parsePrice(value));
  assert.throws(() =>
    importRetail(table, { ...map, price: map.name }, true, ","),
  );
  for (const value of ["1.5", "-1", "1001", ""])
    assert.throws(() =>
      importRetail([table[0], ["Tea", "12,50", value]], map, true, ","),
    );
  assert.throws(() =>
    importRetail(
      [table[0], ["Tea", "12,50", "600"], ["Pot", "8,00", "600"]],
      map,
      true,
      ",",
    ),
  );
  assert.throws(() => parseImport(Array(1002).fill("column").join(",")));
});
test("money follows selected currency precision and discounts never overstate savings", () => {
  const options = newRetail().retail!;
  assert.equal(priceText("8.50", options), "$8.50");
  assert.equal(priceText("0", options), "$0.00");
  assert.throws(() => priceText("8.501", options));
  assert.throws(() => priceText("8.50", { ...options, currency: "JPY" }));
  assert.match(priceText("8.501", { ...options, currency: "KWD" }), /8\.501/);
  assert.equal(discountPercent("8.50", "10.00"), 15);
  assert.equal(discountPercent("2.00", "3.00"), 33);
  assert.throws(() => discountPercent("10.00", "8.00"));
});
test("EAN/UPC use complete original codes and reject incorrect check digits without silently substituting QR", () => {
  for (const [code, format] of [
    ["5901234123457", "ean13"],
    ["036000291452", "upca"],
    ["96385074", "ean8"],
    ["000123", "code128"],
  ])
    assert.equal(retailFormat(code, "auto"), format);
  for (const code of ["5901234123450", "036000291453", "96385075"])
    assert.throws(() => retailFormat(code, "auto"));
  assert.throws(() => retailFormat("590123412345", "ean13"));
  assert.equal(retailFormat("https://example.com/care", "qrcode"), "qrcode");
});
test("three retail templates keep the same physical paper, support no-code labels and escape untrusted text", () => {
  const p = newRetail();
  const paper = JSON.stringify(p.paper);
  for (const template of ["product", "shelf", "sale"] as const) {
    p.retail!.template = template;
    const r = renderWarehouse(p, 0, false);
    assert.equal(r.total, 1);
    assert.match(r.html, /\$8\.50/);
    assert.equal(JSON.stringify(r.paper), paper);
    if (template === "sale") {
      assert.match(r.html, /original-price/);
      assert.match(r.html, /−15%/);
    } else assert.doesNotMatch(r.html, /original-price/);
  }
  p.format = "none";
  p.lists.sku[0].code = "";
  p.lists.sku[0].name = '<img onerror="x">';
  const s = labelSymbol(p.lists.sku[0], p);
  assert.equal(s.codeSvg, "");
  assert.doesNotMatch(s.svg, /<img/);
  assert.match(s.svg, /&lt;img/);
});
test("selected products drive preview, first-page samples and printer bounds without changing quantities", () => {
  const p = newRetail();
  p.printer = "zebra";
  p.paper = { ...presets["roll-102x152"] };
  const original = p.lists.sku[0];
  original.copies = 3;
  p.lists.sku.push(
    retailItem({
      name: "Excluded",
      code: "bad",
      copies: 9,
      retail: { ...original.retail!, selected: false },
    }),
  );
  const before = JSON.stringify(p),
    r = renderWarehouse(p);
  assert.equal(r.total, 3);
  assert.equal(r.pageCount, 2);
  assert.doesNotMatch(r.html, /Excluded/);
  const sample = sampleProject(p);
  assert.equal(sample.lists.sku.length, 1);
  assert.equal(sample.lists.sku[0].copies, 2);
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(zplBounds(sample), zplBounds(p));
  original.retail!.selected = false;
  assert.equal(renderWarehouse(p).total, 0);
  assert.throws(() => sampleProject(p));
});
test("oversized barcode or text blocks output instead of shrinking modules or clipping prices", () => {
  const p = newRetail();
  p.symbolSize = { moduleDots: 20, height: 10 };
  assert.equal(renderWarehouse(p).errors[0].key, "symbolSizeOverflow");
  assert.throws(() => renderWarehouse(p, 0, false));
  p.symbolSize = null;
  p.paper = { ...presets["roll-3"] };
  p.lists.sku[0].retail!.note = "A".repeat(160);
  assert(renderWarehouse(p).errors.length);
  assert.throws(() => renderWarehouse(p, 0, false));
});
test("retail backups preserve fields and selection, reject malformed data and cannot change warehouse behavior", () => {
  const p = newRetail("zh-Hans");
  p.lists.sku[0].retail!.selected = false;
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  const invalid = structuredClone(p);
  (invalid.lists.sku[0].retail as any).price = 1;
  assert.throws(() => validateProject(invalid));
  const warehouse = newWarehouse();
  warehouse.format = "none";
  assert.throws(() => validateProject(warehouse));
  warehouse.format = "auto";
  assert.equal(renderWarehouse(warehouse).total, 12);
  assert.throws(
    () => validateProject({ ...p, retail: { ...p.retail!, currency: "" } }),
    WarehouseError,
  );
});
