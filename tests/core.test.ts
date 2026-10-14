import test from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  newProject,
  defaultDesign,
  validateProject,
  validateLayout,
  safeName,
  rowFrom,
} from "../src/core/model";
import { encode, checkDigit } from "../src/core/barcode";
import {
  parseTable,
  mapRows,
  suggestType,
  sequence,
  labelPages,
  labelDocument,
} from "../src/core/batch";
import { wifi, vcard, gs1 } from "../src/core/assistants";

test("108 format samples encode with finite physical dimensions", () => {
  for (const type of catalog) {
    const r = encode({ ...defaultDesign(), type: type.id, data: type.sample });
    assert.ok(r.widthMm > 0 && r.heightMm > 0, type.id);
    assert.match(r.svg, /<svg/);
    assert.ok(!r.svg.includes("NaN"), type.id);
  }
  assert.equal(catalog.length, 108);
});
test("retail check digits are validated without losing leading zeros", () => {
  assert.equal(checkDigit("01234567890"), "5");
  assert.equal(
    encode({ ...defaultDesign(), type: "upca", data: "01234567890" }).data,
    "012345678905",
  );
  assert.throws(
    () => encode({ ...defaultDesign(), type: "upca", data: "012345678904" }),
    /Check digit/,
  );
});
test("long integer sequences remain exact with prefix, padding and descending steps", () => {
  assert.deepEqual(
    sequence("9007199254740993", 3, "1", "A-", "-Z", 18).map((r) => r.data),
    [
      "A-009007199254740993-Z",
      "A-009007199254740994-Z",
      "A-009007199254740995-Z",
    ],
  );
  assert.deepEqual(
    sequence("2", 3, "-2", "", "", 3).map((r) => r.data),
    ["002", "000", "-002"],
  );
  assert.throws(() => sequence("1", 2, "0", "", "", 0), /zero/);
  assert.throws(() => sequence("1", 2.5, "1", "", "", 0), /whole/);
  const random = sequence("1", 100, "1", "", "", 0, true);
  assert.equal(new Set(random.map((r) => r.data)).size, 100);
});
test("CSV mapping preserves text, quoted commas, multiline values and quantities", () => {
  const table = parseTable(
    '\uFEFFcode,title,count\r\n0000123,"Tea, green",2\r\n0000456,"A\nB",1',
  );
  const rows = mapRows(table, {
    data: 0,
    name: 1,
    quantity: 2,
    type: -1,
    captionAbove: -1,
    captionBelow: -1,
  });
  assert.equal(rows[0].data, "0000123");
  assert.equal(rows[0].name, "Tea, green");
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[1].name, "A\nB");
  assert.throws(
    () =>
      mapRows(
        [
          ["code", "q"],
          ["a", "1.5"],
        ],
        {
          data: 0,
          name: -1,
          quantity: 1,
          type: -1,
          captionAbove: -1,
          captionBelow: -1,
        },
      ),
    /quantity/,
  );
});
test("a uniform column of digits names its retail format, and stays quiet when it cannot", () => {
  const ean = ["5901234123457", "4006381333931"];
  assert.deepEqual(suggestType(ean, "code128", catalog), {
    id: "ean13",
    length: 13,
  });
  // Blanks are not data, and padding never changes the reading.
  assert.deepEqual(suggestType(["  5901234123457  ", "", "4006381333931"], "code128", catalog), {
    id: "ean13",
    length: 13,
  });
  // A complete code outranks one of a different format missing its check
  // digit: twelve digits is a UPC-A far more often than a headless EAN-13.
  assert.equal(suggestType(["012345678905"], "code128", catalog)?.id, "upca");
  assert.equal(suggestType(["01234567890"], "code128", catalog)?.id, "upca");
  assert.equal(suggestType(["12345670"], "code128", catalog)?.id, "ean8");
  // Nothing to say: already set to it, not all digits, uneven lengths, no
  // format claims that width, or an empty column.
  assert.equal(suggestType(ean, "ean13", catalog), null);
  assert.equal(suggestType(["5901234123457", "MATE-2026-001"], "code128", catalog), null);
  assert.equal(suggestType(["5901234123457", "590123412345"], "code128", catalog), null);
  assert.equal(suggestType(["123456789012345678"], "code128", catalog), null);
  assert.equal(suggestType(["", "   "], "code128", catalog), null);
  assert.equal(suggestType([], "code128", catalog), null);
  // Every suggestion is a real format that accepts data of that width, so the
  // switch it offers cannot land the project on something invalid.
  for (const digits of [7, 8, 11, 12, 13]) {
    const match = suggestType(["1".repeat(digits)], "code128", catalog);
    const type = catalog.find((t) => t.id === match!.id)!;
    assert([type.digits - 1, type.digits].includes(digits), String(digits));
  }
});
test("default label layout fits real barcode and labels preserve quantities and skipped positions", () => {
  const p = newProject();
  assert.equal(labelPages(p).length, 1);
  p.rows = [rowFrom("ABC", "", 22)];
  p.layout.start = 1;
  const pages = labelPages(p);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].match(/class="label"/g)?.length, 20);
  assert.equal(pages[1].match(/class="label"/g)?.length, 2);
  assert.ok(labelDocument(p).includes("@page{size:210mm 297mm"));
});
test("oversized labels, invalid quantities and malformed projects fail without silent resizing", () => {
  const p = newProject();
  p.layout.width = 100;
  assert.throws(() => validateLayout(p.layout), /beyond/);
  p.layout = { ...newProject().layout, width: 10 };
  assert.throws(() => labelPages(p), /larger/);
  const bad = newProject();
  bad.rows = [rowFrom("ABC", "", 0)];
  assert.throws(() => validateProject(bad), /Invalid batch/);
  assert.throws(() => validateProject({ schema: 7 }), /Unsupported/);
  assert.throws(() => encode({ ...defaultDesign(), foreground: "red" }), /RGB/);
});
test("rotation swaps dimensions and captions escape markup", () => {
  const d = defaultDesign(),
    a = encode(d),
    b = encode({ ...d, rotation: 90 });
  assert.equal(a.widthMm, b.heightMm);
  assert.equal(a.heightMm, b.widthMm);
  const c = encode({ ...d, captionAbove: "<script>alert(1)</script>" });
  assert.ok(c.heightMm > a.heightMm);
  assert.ok(!c.svg.includes("<script>"));
  assert.match(c.svg, /&lt;script&gt;/);
});
test("GS1, Wi-Fi and contact assistants escape structural data", () => {
  assert.equal(
    gs1("0950600013435", "LOT1", "271231", "SER1"),
    "(01)09506000134352(17)271231(10)LOT1(21)SER1",
  );
  assert.match(wifi("A;B", "pass:word"), /S:A\\;B;P:pass\\:word/);
  assert.match(vcard("A;B", "", "", "", ""), /FN:A\\;B/);
  assert.throws(() => gs1("bad", "", "", ""), /GTIN/);
});
test("filenames are portable and cannot escape export folders", () => {
  assert.ok(!safeName("../CON").startsWith("."));
  assert.ok(!safeName("x/y\\z:thing").includes("/"));
  assert.equal(safeName("NUL"), "_NUL");
});
