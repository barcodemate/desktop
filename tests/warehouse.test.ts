import test from "node:test";
import assert from "node:assert/strict";
import {
  newWarehouse,
  validateProject,
  shelfItems,
  parseImport,
  importItems,
  renderWarehouse,
  sampleProject,
  presets,
  validPaper,
  labelSymbol,
  dotsPerMm,
  paperMargins,
  setOppositeMargin,
} from "../src/warehouse/core";
import { graphicFields } from "../src/warehouse/output";
import {
  inspectJob,
  validateAddress,
  checkPrinter,
  sendPrinter,
} from "../electron/warehouse-printer";
import { createServer, type Socket } from "node:net";
import { zplBounds, printerIssues } from "../src/warehouse/printerCheck";

test("ZPL preflight includes byte padding, skipped slots and repeated rows", () => {
  const p = newWarehouse();
  p.printer = "zebra";
  p.paper = { ...presets["roll-102x152"] };
  p.dpi = 203;
  p.paper.width = 99.1;
  p.paper.height = 50;
  p.paper.top = 0;
  p.lists.shelf = [{ ...p.lists.shelf[0], copies: 1 }];
  p.start = 1;
  assert.deepEqual(zplBounds(p), { width: 808, height: 800 });
  const device = {
    model: "ZD621",
    dpi: 203,
    languages: "zpl",
    width: 807,
    length: 800,
  };
  assert.deepEqual(printerIssues(device, p), ["checkSizeMismatch"]);
  assert.deepEqual(printerIssues({ ...device, width: 808 }, p), []);
  assert.deepEqual(
    printerIssues({ ...device, width: 808, dpi: 300, languages: "cpcl" }, p),
    ["checkLanguageMismatch", "checkDpiMismatch"],
  );
  p.lists.shelf[0].copies = 3;
  assert.deepEqual(zplBounds(p), { width: 808, height: 800 });
});

test("warehouse sequences, imports and limits preserve codes and separate lists", () => {
  const items = shelfItems("A", 9, 2, 2, 3);
  assert.equal(items.length, 12);
  assert.equal(items.at(-1)?.code, "A-10-02-03");
  assert.throws(() => shelfItems("A", 1, 20, 20, 20));
  assert.throws(() => shelfItems("", 1, 1, 1, 1));
  assert.throws(() => shelfItems("A", 1, -1, 2, 2));
  const table = parseImport(
    '\uFEFFcode\tname\tlocation\tcopies\n000123\t"Shelf, box"\tA-01\t2',
  );
  const imported = importItems(
    table,
    { code: 0, name: 1, location: 2, copies: 3 },
    true,
  );
  assert.equal(imported[0].code, "000123");
  assert.equal(imported[0].name, "Shelf, box");
  assert.equal(imported[0].copies, 2);
  assert.throws(() =>
    importItems(
      [["1", "1.5"]],
      { code: 0, name: -1, location: -1, copies: 1 },
      false,
    ),
  );
  const p = newWarehouse();
  p.lists.sku = imported;
  assert.equal(validateProject(p).lists.shelf.length, 12);
  p.lists.sku[0].copies = 1001;
  assert.throws(() => validateProject(p));
});
test("physical sheet and roll layouts paginate copies and exclude backing gap from the page", () => {
  const p = newWarehouse();
  p.start = 20;
  let r = renderWarehouse(p);
  assert.equal(r.pageCount, 2);
  assert.equal(r.total, 12);
  p.printer = "thermal";
  p.start = 0;
  p.paper = { ...presets["roll-3"] };
  r = renderWarehouse(p);
  assert.equal(r.pageCount, 4);
  assert.equal(r.paper.pageHeight, 20);
  assert.equal(r.paper.gapY, 3);
  assert.equal((r.html.match(/class="label"/g) || []).length, 12);
  assert.equal((r.html.match(/class="guide"/g) || []).length, 12);
  assert.equal(r.previewStep, 4);
  assert.equal(r.displayHeight, 4 * 20 + 3 * 3);
  assert.match(r.html, /class="roll-stock"/);
  const print = renderWarehouse(p, 0, false);
  assert.equal((print.html.match(/class="sheet"/g) || []).length, 4);
  assert.equal((print.html.match(/class="label"/g) || []).length, 12);
  assert.doesNotMatch(print.html, /roll-stage|roll-stock/);
  assert.equal(print.paper.pageWidth, 98);
  assert.equal(print.paper.pageHeight, 20);
  p.paper.pageWidth = 80;
  assert.throws(() => validPaper(p.paper));
});
test("negative offsets retain preview and block output; bad items do not erase other labels", () => {
  const p = newWarehouse();
  p.offsetX = -20;
  assert.equal(renderWarehouse(p).errors[0].key, "offsetError");
  assert.match(renderWarehouse(p).html, /<svg/);
  assert.throws(() => renderWarehouse(p, 0, false));
  p.offsetX = 0;
  p.lists.shelf[0].code = "";
  assert.equal(renderWarehouse(p).errors[0].key, "codeError");
  assert.match(renderWarehouse(p).html, /A-01-01-02/);
  assert.throws(() => renderWarehouse(p, 0, false));
});
test("Zebra uses native 8/12 dots per mm and auto chooses QR for narrow labels", () => {
  const p = newWarehouse();
  p.printer = "zebra";
  p.paper = { ...presets["roll-3"] };
  assert.equal(labelSymbol(p.lists.shelf[0], p).format, "qrcode");
  assert.equal(dotsPerMm(203), 8);
  assert.equal(dotsPerMm(300), 12);
  p.dpi = 600;
  assert.throws(() => validateProject(p));
  assert.throws(() => dotsPerMm(600));
  p.dpi = 300;
  p.paper = { ...presets["roll-1"] };
  p.lists.shelf[0].name = "<script>alert(1)</script>";
  assert.doesNotMatch(labelSymbol(p.lists.shelf[0], p).svg, /<script>/);
});
test("GFA chunks stay below 99999 bytes and whitelist prevents printer configuration commands", () => {
  const data = new Uint8ClampedArray(800 * 1100 * 4).fill(255);
  data.set([0, 0, 0, 255], 0);
  const fields = graphicFields(data, 800, 1100);
  assert.equal((fields.match(/\^GFA/g) || []).length, 2);
  assert.match(fields, /,80000000/);
  const zpl = "^XA\n^LH0,0\n" + fields + "^PQ1^XZ\n";
  assert.deepEqual(inspectJob(zpl), { width: 800, height: 1100, pages: 1 });
  assert.throws(() => inspectJob(zpl + "~JC"));
  assert.throws(() => inspectJob(zpl.replace("99900,99900", "99900,99901")));
  for (const host of [
    "example.com",
    "8.8.8.8",
    "127.0.0.1",
    "192.168.1.1\n~JC",
  ])
    assert.throws(() => validateAddress({ host, port: 9100 }));
  assert.equal(
    validateAddress({ host: "192.168.2.10", port: 9100 }).port,
    9100,
  );
});
test("TCP checks are read-only; sending validates device and delivers exactly once", async () => {
  const received: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString();
      if (input.startsWith("! U1") && input.endsWith("\r\n")) {
        received.push(input);
        const key = input.match(/"(.*?)"/)![1];
        const values: Record<string, string> = {
          "device.product_name": "ZD621",
          "head.resolution.in_dpi": "300",
          "device.languages": "epl_zpl",
          "ezpl.print_width": "1200",
          "zpl.label_length": "600",
        };
        socket.write('"' + values[key] + '"\r\n');
        input = "";
      }
    });
    socket.on("end", () => {
      if (input) received.push(input);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = {
    host: "127.0.0.1",
    port: (server.address() as { port: number }).port,
  };
  try {
    const info = await checkPrinter(address, true);
    assert.equal(info.model, "ZD621");
    assert.equal(received.length, 5);
    assert(received.every((s) => s.startsWith("! U1 getvar")));
    const job = "^XA\n^LH0,0\n^FO0,0^GFA,1,1,1,80^FS\n^PQ1^XZ\n";
    await assert.rejects(
      sendPrinter(address, job, 203, true),
      /deviceMismatch/,
    );
    assert(received.every((s) => !s.startsWith("^XA")));
    await sendPrinter(address, job, 300, true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(received.filter((s) => s === job).length, 1);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("TCP query timeout closes the socket without retry", async () => {
  let calls = 0;
  const sockets = new Set<Socket>();
  const server = createServer((s) => {
    calls++;
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      checkPrinter(
        {
          host: "127.0.0.1",
          port: (server.address() as { port: number }).port,
        },
        true,
        40,
      ),
      /connectionError/,
    );
    assert.equal(calls, 1);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("sample printing retains the entire first physical page and leaves the full job unchanged", () => {
  for (const preset of ["a4", "roll-3", "roll-102x152"]) {
    const p = newWarehouse();
    p.paper = { ...presets[preset] };
    p.printer = preset === "a4" ? "office" : "thermal";
    p.mode = "sku";
    p.lists.sku = p.lists.shelf
      .slice(0, 3)
      .map((item, i) => ({ ...item, copies: i === 0 ? 0 : 25 }));
    p.start = 1;
    const before = JSON.stringify(p);
    const sample = sampleProject(p);
    const output = renderWarehouse(sample, 0, false);
    assert.equal(output.total, p.paper.columns * p.paper.rows - p.start);
    assert.equal(output.pageCount, 1);
    assert.equal(sample.lists.sku[0].code, p.lists.sku[1].code);
    assert.equal(sample.start, p.start);
    assert.deepEqual(sample.paper, p.paper);
    assert.equal(JSON.stringify(p), before);
    assert.equal(renderWarehouse(p, 0, false).total, 50);
    p.lists.sku.forEach((item) => (item.copies = 0));
    assert.throws(() => sampleProject(p), /empty/);
  }
});

test("102 by 152 mm roll pages fit two 100 by 75 labels with symmetric margins", () => {
  const p = newWarehouse();
  p.printer = "zebra";
  p.paper = { ...presets["roll-102x152"] };
  const output = renderWarehouse(p, 0, false);
  assert.equal(output.paper.pageHeight, 152);
  assert.equal(output.paper.rows, 2);
  assert.equal(output.pageCount, 6);
  assert.match(output.html, /@page\{size:102mm 152mm/);
  assert.match(output.html, /left:1mm;top:76mm;width:100mm;height:75mm/);
  p.paper.pageHeight = 99;
  assert.throws(() => validPaper(p.paper));
});

test("warehouse symbols grow with the label while retaining whole-dot modules and quiet zones", () => {
  for (const dpi of [203, 300]) {
    const p = newWarehouse();
    p.printer = "zebra";
    p.dpi = dpi;
    p.paper = { ...presets["roll-102x152"] };
    const symbol = labelSymbol(p.lists.shelf[0], p);
    const barcode = symbol.svg.match(
      /class="ink barcode"[^>]+width="([\d.]+)" height="([\d.]+)" viewBox="0 0 (\d+) (\d+)"/,
    )!;
    assert.equal(symbol.format, "code128");
    assert(
      Number(barcode[1]) > (dpi === 203 ? 80 : 85) && Number(barcode[1]) <= 97,
    );
    assert(Number(barcode[2]) > 50 && Number(barcode[2]) < 60);
    assert(
      Math.abs(Number(barcode[1]) * dotsPerMm(dpi) - Number(barcode[3])) <
        0.001,
    );
    assert.match(symbol.svg, /font-size="12"/);
    p.paper = { ...presets["roll-102x152"], height: 150, rows: 1 };
    const full = labelSymbol(p.lists.shelf[0], p);
    const size = full.svg.match(
      /class="ink barcode"[^>]+width="([\d.]+)" height="([\d.]+)"/,
    )!;
    assert(Number(size[1]) > (dpi === 203 ? 80 : 85));
    assert(Number(size[2]) > 120);
    assert.equal(renderWarehouse(p).rowsShown, 1);
    assert.deepEqual(zplBounds(sampleProject(p)), {
      width: 101 * dotsPerMm(dpi),
      height: 151 * dotsPerMm(dpi),
    });
    p.format = "qrcode";
    const qr = labelSymbol(p.lists.shelf[0], p).svg.match(
      /class="ink barcode"[^>]+width="([\d.]+)" height="([\d.]+)"/,
    )!;
    assert.equal(Number(qr[1]), Number(qr[2]));
    assert(Number(qr[1]) > 85 && Number(qr[1]) <= 97);
  }
});

test("custom code sizes preserve printer dots, QR aspect ratio and old backups", () => {
  for (const printer of ["zebra", "thermal", "office"] as const) {
    for (const dpi of printer === "zebra" ? [203, 300] : [203, 300, 600]) {
      const p = newWarehouse();
      p.printer = printer;
      p.dpi = dpi;
      p.paper = { ...presets["roll-1"] };
      const old = JSON.parse(JSON.stringify(p));
      delete old.symbolSize;
      assert.equal(validateProject(old).symbolSize, null);
      p.format = "code128";
      const automatic = labelSymbol(p.lists.shelf[0], p);
      p.symbolSize = { width: 60, height: 15 };
      const linear = labelSymbol(p.lists.shelf[0], p);
      assert(linear.widthMm <= 60 && linear.heightMm <= 15);
      assert(linear.widthMm < automatic.widthMm);
      assert(linear.heightMm < automatic.heightMm);
      assert(Number.isInteger(linear.moduleDots));
      const density = printer === "zebra" ? dotsPerMm(dpi) : dpi / 25.4;
      for (const size of [linear.widthMm, linear.heightMm])
        assert(Math.abs(size * density - Math.round(size * density)) < 0.00001);
      assert.deepEqual(
        validateProject(JSON.parse(JSON.stringify(p))).symbolSize,
        { moduleDots: linear.moduleDots, height: p.symbolSize.height },
      );
      p.format = "qrcode";
      p.symbolSize = { width: 20, height: 1 };
      const qr = labelSymbol(p.lists.shelf[0], p);
      assert.equal(qr.widthMm, qr.heightMm);
      assert(qr.widthMm <= 20 && qr.widthMm > 10);
      assert(Number.isInteger(qr.moduleDots));
      p.symbolSize = null;
      p.format = "code128";
      assert.equal(labelSymbol(p.lists.shelf[0], p).svg, automatic.svg);
    }
  }
});

test("custom sizes that cannot fit show errors and block print output", () => {
  const p = newWarehouse();
  p.printer = "zebra";
  p.paper = { ...presets["roll-1"] };
  for (const format of ["code128", "qrcode"] as const) {
    p.format = format;
    p.symbolSize = { width: 200, height: 100 };
    assert.equal(renderWarehouse(p).errors[0].key, "symbolSizeOverflow");
    assert.throws(() => renderWarehouse(p, 0, false), /symbolSizeOverflow/);
    p.symbolSize = { width: 1, height: 1 };
    assert.equal(renderWarehouse(p).errors[0].key, "symbolSizeError");
    assert.throws(() => renderWarehouse(p, 0, false), /symbolSizeError/);
  }
  for (const size of [0, -1, NaN, Infinity, 601]) {
    p.symbolSize = { width: size, height: 15 };
    assert.throws(() => validateProject(p), /symbolSizeError/);
  }
});

test("four margins describe the full paper and editing opposite edges preserves stock dimensions", () => {
  for (const paper of Object.values(presets)) {
    const { right, bottom } = paperMargins(validPaper(paper));
    assert(right >= 0 && bottom >= 0);
    assert(
      Math.abs(
        paper.left +
          right +
          paper.columns * paper.width +
          (paper.columns - 1) * paper.gapX -
          paper.pageWidth,
      ) < 0.000001,
    );
    assert(
      Math.abs(
        paper.top +
          bottom +
          paper.rows * paper.height +
          (paper.rows - 1) * paper.gapY -
          paper.pageHeight,
      ) < 0.000001,
    );
  }
  const p = newWarehouse();
  p.printer = "zebra";
  p.paper = { ...presets["roll-102x152"] };
  assert.deepEqual(paperMargins(p.paper), { right: 1, bottom: 1 });
  p.paper = setOppositeMargin(p.paper, "right", 1.25);
  p.paper = setOppositeMargin(p.paper, "bottom", 1.5);
  assert.equal(p.paper.left, 0.75);
  assert.equal(p.paper.top, 0.5);
  assert.equal(p.paper.width, 100);
  assert.equal(p.paper.height, 75);
  assert.equal(p.paper.pageWidth, 102);
  assert.equal(p.paper.pageHeight, 152);
  assert.deepEqual(paperMargins(p.paper), { right: 1.25, bottom: 1.5 });
  assert.match(
    renderWarehouse(p, 0, false).html,
    /left:0.75mm;top:75.5mm;width:100mm;height:75mm/,
  );
  assert.deepEqual(
    paperMargins(validateProject(JSON.parse(JSON.stringify(p))).paper),
    { right: 1.25, bottom: 1.5 },
  );
  p.paper = { ...presets["roll-102x152"], height: 50, top: 0, gapY: 3 };
  assert.equal(paperMargins(p.paper).bottom, 49);
  assert.equal(setOppositeMargin(p.paper, "bottom", 40).top, 9);
  for (const edge of ["right", "bottom"] as const) {
    assert.throws(
      () => validPaper(setOppositeMargin(p.paper, edge, -1)),
      /paperError/,
    );
    assert.throws(
      () => validPaper(setOppositeMargin(p.paper, edge, 600)),
      /paperError/,
    );
  }
});

test("explicit module dots determine width without shrinking, including odd QR modules", () => {
  for (const dpi of [203, 300]) {
    const p = newWarehouse();
    p.printer = "zebra";
    p.dpi = dpi;
    p.paper = { ...presets["roll-1"] };
    p.lists.shelf = [{ ...p.lists.shelf[0], code: "A1" }];
    for (const format of ["code128", "qrcode"] as const) {
      p.format = format;
      p.symbolSize = { moduleDots: 5, height: 15 };
      const a = labelSymbol(p.lists.shelf[0], p);
      assert.equal(a.moduleDots, 5);
      p.symbolSize.moduleDots = 6;
      const b = labelSymbol(p.lists.shelf[0], p);
      assert.equal(b.moduleDots, 6);
      assert(Math.abs(a.widthMm / 5 - b.widthMm / 6) < 0.00001);
      assert(
        Math.abs(
          a.widthMm * dotsPerMm(dpi) - Math.round(a.widthMm * dotsPerMm(dpi)),
        ) < 0.00001,
      );
      if (format === "qrcode") assert.equal(a.widthMm, a.heightMm);
      else assert.equal(a.heightMm, b.heightMm);
      p.symbolSize.moduleDots = 32;
      assert.equal(renderWarehouse(p).errors[0].key, "symbolSizeOverflow");
      assert.throws(() => renderWarehouse(p, 0, false), /symbolSizeOverflow/);
      p.symbolSize.moduleDots = 1;
      assert.equal(renderWarehouse(p).errors[0].key, "symbolModuleTooSmall");
      p.symbolSize.moduleDots = 3.5;
      assert.throws(() => validateProject(p), /symbolSizeError/);
    }
  }
});
