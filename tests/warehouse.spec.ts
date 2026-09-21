import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:net";

test("warehouse navigation, native PDF, CSV mapping, ZPL and isolated TCP delivery", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "barcodemate-warehouse-"));
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });
  const jobs: string[] = [];
  const queries: string[] = [];
  const server = createServer((s) => {
    let body = "";
    s.on("data", (chunk) => {
      body += chunk.toString();
      if (body.startsWith("! U1") && body.endsWith("\r\n")) {
        queries.push(body);
        const key = body.match(/"([^"]+)"/)![1];
        const values: Record<string, string> = {
          "device.product_name": "ZD621",
          "head.resolution.in_dpi": "300",
          "device.languages": "epl_zpl",
          "ezpl.print_width": "1200",
          "zpl.label_length": "600",
        };
        s.write('"' + values[key] + '"\r\n');
        body = "";
      }
    });
    s.on("end", () => {
      if (body) jobs.push(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const p = await app.firstWindow();
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.locator("#language-select").selectOption("en");
    await p.locator("[data-workspace=scenarios]").click();
    await p.locator("#case-warehouse .hm-case-open").click();
    await expect(p.locator(".wh-root")).toBeVisible();
    const preview = p.frameLocator(".wh-preview iframe");
    await expect(preview.locator(".label")).toHaveCount(12);
    await expect(preview.locator(".guide")).toHaveCount(21);
    const pdfFile = path.join(temp, "warehouse.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, pdfFile);
    await p.getByRole("button", { name: "Save PDF", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(pdfFile)).subarray(0, 4).toString();
        } catch {
          return "";
        }
      })
      .toBe("%PDF");
    const mediaBox = (await readFile(pdfFile, "latin1")).match(
      /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/,
    )!;
    expect(mediaBox).toBeTruthy();
    expect(Math.abs(Number(mediaBox[1]) - (210 * 72) / 25.4)).toBeLessThan(1);
    expect(Math.abs(Number(mediaBox[2]) - (297 * 72) / 25.4)).toBeLessThan(1);
    await p.locator(".wh-paper-settings summary").click();
    await p.locator("[data-field=offsetX] input").fill("-50");
    await expect(p.locator(".wh-preview-panel .wh-error")).toContainText("outside");
    await expect(p.getByTestId("warehouse-code-preview").getByRole("alert")).toContainText("outside");
    await expect(preview.locator(".label")).toHaveCount(12);
    await expect(
      p.getByRole("button", { name: "Print All", exact: true }),
    ).toBeDisabled();
    await p.locator("[data-field=offsetX] input").fill("0");
    await p.locator("[data-mode=sku]").click();
    await p.locator("[data-testid=warehouse-csv]").setInputFiles({
      name: "sku.tsv",
      mimeType: "text/tab-separated-values",
      buffer: Buffer.from(
        "code\tname\tlocation\tcopies\n000123\t零件\tA-01\t2\n000456\t螺丝\tB-01\t1",
      ),
    });
    await p
      .getByRole("button", { name: "Replace current list", exact: true })
      .click();
    await expect(p.getByLabel("Code 1", { exact: true })).toHaveValue("000123");
    await expect(preview.locator(".label")).toHaveCount(3);
    await p.locator("[data-printer=thermal]").click();
    await p.getByTestId("warehouse-protocol").selectOption("zebra");
    await p.locator("[data-testid=warehouse-paper]").selectOption("roll-2");
    await p.locator("[data-field=pageWidth] input").fill("100");
    await p.locator("[data-field=width] input").fill("47");
    await expect(p.locator(".wh-error")).toHaveCount(0);
    const zplFile = path.join(temp, "warehouse.zpl");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, zplFile);
    await p.getByRole("button", { name: "Export ZPL", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(zplFile, "utf8")).startsWith("^XA");
        } catch {
          return false;
        }
      })
      .toBe(true);
    const zpl = await readFile(zplFile, "utf8");
    expect((zpl.match(/\^XA/g) || []).length).toBe(2);
    expect(zpl).not.toMatch(/\^PW|\^LL|~JC/);
    await p
      .getByLabel("Printer IPv4 address", { exact: true })
      .fill("127.0.0.1");
    await p
      .locator("[data-field=port] input")
      .fill(String((server.address() as { port: number }).port));
    // Entering the address triggers a read-only check without a button click.
    await expect(p.locator(".wh-device")).toContainText("ZD621");
    await expect(p.getByTestId("zebra-diagnostics")).toHaveAttribute(
      "data-state",
      "ready",
    );
    await expect(p.locator(".wh-device")).toContainText("epl_zpl");
    await expect(p.locator(".wh-device")).toContainText("1200 × 600 dots");
    expect(jobs).toHaveLength(0);
    expect(queries).toHaveLength(5);
    await p.getByLabel("I have checked the loaded", { exact: false }).check();
    p.once("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "Send labels", exact: true }).click();
    await expect(p.locator(".wh-notice")).toContainText(
      "Verify the printed labels",
    );
    await expect.poll(() => jobs.length).toBe(1);
    expect(jobs[0]).toBe(zpl);
    await expect(
      p.getByRole("button", { name: "Send labels", exact: true }),
    ).toBeDisabled();
    const jsonFile = path.join(temp, "warehouse.json");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, jsonFile);
    await p.locator(".wh-root .hm-backup summary").click();
    await p.getByRole("button", { name: "Export backup", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(jsonFile, "utf8")).schema;
        } catch {
          return "";
        }
      })
      .toBe("barcodemate-warehouse-1");
    expect(await readFile(jsonFile, "utf8")).not.toContain("127.0.0.1");
    await p.getByLabel("Code 1", { exact: true }).fill("CHANGED");
    await p.locator("[data-testid=warehouse-backup]").setInputFiles(jsonFile);
    await expect(p.getByLabel("Code 1", { exact: true })).toHaveValue("000123");
    await p.locator("[data-workspace=home]").click();
    await p.locator("[data-workspace=warehouse]").click();
    await expect(p.getByLabel("Code 1", { exact: true })).toHaveValue("000123");
    await p.getByTestId("warehouse-paper").selectOption("roll-102x152");
    await expect(p.locator("[data-field=pageHeight] input")).toHaveValue("152");
    await expect(p.locator("[data-field=rows] input")).toHaveValue("2");
    await expect(preview.locator(".label")).toHaveCount(2);
    const customPdf = path.join(temp, "warehouse-102x152.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, customPdf);
    await p.getByRole("button", { name: "Save PDF", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(customPdf)).subarray(0, 4).toString();
        } catch {
          return "";
        }
      })
      .toBe("%PDF");
    const customBox = (await readFile(customPdf, "latin1")).match(
      /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/,
    )!;
    expect(Math.abs(Number(customBox[1]) - (102 * 72) / 25.4)).toBeLessThan(1);
    expect(Math.abs(Number(customBox[2]) - (152 * 72) / 25.4)).toBeLessThan(1);
    const customZpl = path.join(temp, "warehouse-102x152.zpl");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, customZpl);
    await p.getByRole("button", { name: "Export ZPL", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(customZpl, "utf8")).startsWith("^XA");
        } catch {
          return false;
        }
      })
      .toBe(true);
    const customCommands = await readFile(customZpl, "utf8");
    expect((customCommands.match(/\^XA/g) || []).length).toBe(2);
    expect(customCommands.split("^XZ")[0]).toContain("^FO12,912");
    expect(customCommands.split("^XZ")[1]).not.toContain("^FO12,912");
    // Intercept the native print bridge: inspect the exact jobs, never open a real printer.
    await app.evaluate(({ ipcMain }) => {
      (globalThis as any).__warehousePrintJobs = [];
      ipcMain.removeHandler("print");
      ipcMain.handle("print", (_event, job) => {
        (globalThis as any).__warehousePrintJobs.push(job);
        return null;
      });
    });
    await p.getByRole("button", { name: "Print One", exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as any).__warehousePrintJobs.length),
      )
      .toBe(1);
    await p.getByRole("button", { name: "Print All", exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as any).__warehousePrintJobs.length),
      )
      .toBe(2);
    const printJobs = await app.evaluate(
      () =>
        (globalThis as any).__warehousePrintJobs as {
          html: string;
          width: number;
          height: number;
          pdf: boolean;
        }[],
    );
    expect(
      printJobs.map((job) => (job.html.match(/class="label"/g) || []).length),
    ).toEqual([2, 3]);
    expect(
      printJobs.map((job) => (job.html.match(/class="sheet"/g) || []).length),
    ).toEqual([1, 2]);
    for (const job of printJobs) {
      expect(job.width).toBe(102);
      expect(job.height).toBe(152);
      expect(job.pdf).toBe(false);
      expect(job.html).not.toContain('class="roll-stock"');
    }
    expect(printJobs[0].html).toContain('data-code="000123"');
    expect(printJobs[0].html).toContain("top:76mm;width:100mm;height:75mm");
    await expect(preview.locator(".label")).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Zebra selection checks saved addresses, blocks mismatches and ignores stale results", async () => {
  const temp = await mkdtemp(
    path.join(os.tmpdir(), "barcodemate-zebra-check-"),
  );
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });
  try {
    const p = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      (globalThis as any).__checks = [];
      ipcMain.removeHandler("warehouse:check");
      ipcMain.handle("warehouse:check", async (_event, address) => {
        (globalThis as any).__checks.push(address);
        if (address.host === "192.168.1.2")
          await new Promise((resolve) => setTimeout(resolve, 2000));
        if (address.host === "192.168.1.4") throw Error("connectionError");
        return {
          model: address.host === "192.168.1.2" ? "STALE" : "ZD621",
          dpi: address.host === "192.168.1.3" ? 203 : 300,
          languages: "epl_zpl",
          width: 1280,
          length: 600,
        };
      });
    });
    await p.locator("#language-select").selectOption("en");
    await p.evaluate(() =>
      localStorage.setItem(
        "barcodemate.warehouse.connection.v1",
        JSON.stringify({ host: "192.168.1.1", port: 9100 }),
      ),
    );
    await p.locator("[data-workspace=scenarios]").click();
    await p.locator("#case-warehouse .hm-case-open").click();
    await p.locator("[data-printer=thermal]").click();
    await p.getByTestId("warehouse-protocol").selectOption("zebra");
    const diagnostics = p.getByTestId("zebra-diagnostics");
    await expect(diagnostics).toHaveAttribute("data-state", "ready");
    expect(await app.evaluate(() => (globalThis as any).__checks.length)).toBe(
      1,
    );
    const host = p.getByLabel("Printer IPv4 address", { exact: true });
    await host.fill("192.168.1.2");
    await expect(diagnostics).toHaveAttribute("data-state", "checking");
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__checks.length))
      .toBe(2);
    await host.fill("192.168.1.3");
    await expect(diagnostics).toContainText("Select the printer’s resolution");
    await expect(
      p.getByRole("button", { name: "Send labels", exact: true }),
    ).toBeDisabled();
    await p.waitForTimeout(2200);
    await expect(diagnostics).not.toContainText("STALE");
    await expect(diagnostics).toContainText("203 dpi");
    await host.fill("192.168.1.4");
    await expect(diagnostics).toContainText("Connection failed");
    await expect(diagnostics.locator(".wh-device")).toHaveCount(0);
    await host.fill("192.168.1.1");
    await expect(diagnostics).toHaveAttribute("data-state", "ready");
    await p.getByLabel("I have checked the loaded", { exact: false }).check();
    await p.getByTestId("warehouse-paper").selectOption("roll-102x152");
    await expect(diagnostics).toContainText(
      "exceeds the printer’s configured width or label length",
    );
    await expect(
      p.getByRole("button", { name: "Send labels", exact: true }),
    ).toBeDisabled();
    await expect(
      p.getByLabel("I have checked the loaded", { exact: false }),
    ).not.toBeChecked();
    await p.getByTestId("warehouse-protocol").selectOption("thermal");
    await expect(diagnostics).toHaveCount(0);
    await p.getByTestId("warehouse-protocol").selectOption("zebra");
    await expect(diagnostics.locator(".wh-device")).toContainText("ZD621");
    expect(await app.evaluate(() => (globalThis as any).__checks.length)).toBe(
      6,
    );
  } finally {
    await app.close();
  }
});
