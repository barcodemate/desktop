import test from "node:test";
import assert from "node:assert/strict";
import { newWarehouse, labelSymbol, dotsPerMm } from "../src/warehouse/core";
import {
  nativeCode128,
  nativeCode128Width,
} from "../src/warehouse/nativeCode128";
import { inspectJob } from "../electron/warehouse-printer";
import { graphicFields, textGraphicFields } from "../src/warehouse/output";

const fixtures = [
  ["123456", [105, 12, 34, 56]],
  ["SKU-12345678", [104, 51, 43, 53, 13, 99, 12, 34, 56, 78]],
  ["A^~>_B", [104, 33, 62, 94, 30, 63, 34]],
  ["abc\u0001def", [104, 65, 66, 67, 98, 65, 68, 69, 70]],
] as const;
for (const dpi of [203, 300])
  test(`native Code 128 matches preview bars and dimensions at ${dpi} DPI`, () => {
    const p = newWarehouse();
    p.printer = "zebra";
    p.dpi = dpi;
    for (const [code, expected] of fixtures) {
      const s = labelSymbol({ ...p.lists.shelf[0], code }, p);
      const n = nativeCode128(s.codeSvg, s.moduleDots);
      assert.deepEqual(n.words, expected);
      assert.equal(nativeCode128Width(n.hex, n.module), n.width);
      // Both side quiet zones and all barcode dimensions remain in printer dots.
      assert.equal(n.x, s.moduleDots * 10);
      assert.ok(
        Math.abs(s.widthMm * dotsPerMm(dpi) - (n.width + 2 * n.x)) < 1e-8,
      );
      const field = n.hex.replace(/_([0-9A-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16)),
      );
      if (code === "A^~>_B") assert.equal(field, ">:A><>=>0_B");
      if (code === "abc\u0001def") assert.equal(field, ">:abc>465def");
      const zpl = `^XA\n^LH0,0\n^FO20,30^BY${n.module},2,${n.height}^BCN,${n.height},N,N,N,N^FH_^FD${n.hex}^FS\n^PQ1^XZ\n`;
      assert.deepEqual(inspectJob(zpl), {
        width: 20 + n.width,
        height: 30 + n.height,
        pages: 1,
      });
      assert.throws(() => inspectJob(zpl.replace("^FH_", "~JC^FH_")));
      assert.throws(() => inspectJob(zpl.replace("^BY" + n.module, "^BY11")));
    }
  });
test("native conversion retains exact encoding for mixed printable data", () => {
  const p = newWarehouse();
  p.printer = "zebra";
  for (let i = 32; i < 127; i++) {
    const code = `a${String.fromCharCode(i)}01234567Z`;
    const s = labelSymbol({ ...p.lists.shelf[0], code }, p);
    const n = nativeCode128(s.codeSvg, s.moduleDots);
    assert.equal(nativeCode128Width(n.hex, n.module), n.width, code);
  }
});
test("text graphics preserve pixel positions and omit the empty barcode area", () => {
  const data = new Uint8ClampedArray(64 * 80 * 4);
  for (const [x, y] of [
    [7, 2],
    [12, 3],
    [20, 70],
  ])
    data[(y * 64 + x) * 4 + 3] = 255;
  const compact = textGraphicFields(data, 64, 80, 10, 20);
  assert.ok(compact.length < graphicFields(data, 64, 80, 10, 20).length / 10);
  const result = new Set<string>();
  for (const m of compact.matchAll(
    /\^FO(\d+),(\d+)\^GFA,(\d+),\d+,(\d+),([0-9A-F]+)\^FS/g,
  )) {
    const [x, y, bytes, stride] = m.slice(1, 5).map(Number);
    for (let i = 0; i < bytes; i++)
      for (let bit = 0; bit < 8; bit++)
        if (parseInt(m[5].slice(i * 2, i * 2 + 2), 16) & (128 >> bit))
          result.add(
            `${x + (i % stride) * 8 + bit},${y + Math.floor(i / stride)}`,
          );
  }
  assert.deepEqual([...result].sort(), ["17,22", "22,23", "30,90"]);
});
test("unsupported native module width blocks output instead of silent printer scaling", () => {
  const p = newWarehouse();
  p.printer = "zebra";
  p.format = "code128";
  p.symbolSize = { moduleDots: 11, height: 20 };
  assert.throws(() => labelSymbol(p.lists.shelf[0], p));
});
