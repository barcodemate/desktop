import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
let app: ElectronApplication, page: Page, temp: string;
test.beforeEach(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), "barcodemate-app-"));
  // Every other test starts from a profile that has already answered the
  // first-run question, so the dialog does not stand in front of the app.
  if (!test.info().title.includes("usage counting"))
    await writeFile(path.join(temp, "usage.json"), JSON.stringify({ enabled: false, log: [] }));
  app = await electron.launch({
    ...(process.env.BARCODEMATE_EXECUTABLE
      ? { executablePath: process.env.BARCODEMATE_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });
  page = await app.firstWindow();
  await page.waitForSelector("h1");
  await page.locator("#language-select").selectOption("en");
});
test.afterEach(async () => {
  await app?.close();
});
const saveTo = async (file: string) =>
  app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
  }, file);
test("desktop design renders, exports SVG and persists a project", async () => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByText("Encoded successfully")).toBeVisible();
  await saveTo(path.join(temp, "barcode.svg"));
  await page
    .getByRole("button", { name: "Export barcode", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("Exported");
  const svg = await readFile(path.join(temp, "barcode.svg"), "utf8");
  expect(svg).toContain("mm");
  expect(svg).toContain("<svg");
  await saveTo(path.join(temp, "project.barcodemate"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Project saved");
  const p = JSON.parse(
    await readFile(path.join(temp, "project.barcodemate"), "utf8"),
  );
  expect(p.design.data).toBe("MATE-2026-001");
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/design-light.png",
    fullPage: true,
  });
  await page.getByTitle("Switch appearance").click();
  await page.screenshot({
    path: "test-results/screenshots/design-dark.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("sequence to batch to two-page print PDF with real dimensions", async () => {
  await page.getByRole("button", { name: "Batch data", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate sequence", exact: true })
    .click();
  await page.getByLabel("How many?", { exact: true }).fill("23");
  await page.getByLabel("Prefix", { exact: true }).fill("SKU-");
  await page
    .getByRole("button", { name: "Create sequence", exact: true })
    .click();
  await expect(page.getByLabel("Data row 1", { exact: true })).toHaveValue(
    "SKU-00001",
  );
  await page
    .getByRole("button", { name: "Arrange labels", exact: true })
    .click();
  await expect(page.getByText("2 pages", { exact: true })).toBeVisible();
  await saveTo(path.join(temp, "labels.pdf"));
  await page
    .getByRole("button", { name: "Export print-ready PDF", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("PDF saved");
  const pdf = await readFile(path.join(temp, "labels.pdf"));
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1000);
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/labels.png",
    fullPage: true,
  });
  await writeFile("test-results/labels.pdf", pdf);
});
test("CSV mapping preserves leading zeros and quantities; invalid row blocks ZIP", async () => {
  await page.getByRole("button", { name: "Batch data", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste / import", exact: true })
    .click();
  await page
    .getByLabel("Paste your data", { exact: true })
    .fill("code,title,count\n00001234,Tea,2\n00004567,Coffee,3");
  await page
    .getByRole("combobox", { name: "Name", exact: true })
    .selectOption("1");
  await page
    .getByRole("combobox", { name: "Copies", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Import rows", exact: true }).click();
  await expect(page.getByLabel("Data row 1", { exact: true })).toHaveValue(
    "00001234",
  );
  await expect(page.getByLabel("Copies row 2", { exact: true })).toHaveValue(
    "3",
  );
  await saveTo(path.join(temp, "batch.zip"));
  await page.getByRole("button", { name: "Export ZIP", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Batch exported");
  expect(
    (await readFile(path.join(temp, "batch.zip"))).subarray(0, 2).toString(),
  ).toBe("PK");
  await page.getByLabel("Data row 1", { exact: true }).fill("");
  await page.getByRole("button", { name: "Export ZIP", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Row 1");
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: "test-results/screenshots/batch.png",
    fullPage: true,
  });
});
test("sandbox and network restrictions are active; bilingual workspace and project library work", async () => {
  const prefs = await page.evaluate(() => window.desktop.security());
  expect(prefs.contextIsolation).toBe(true);
  expect(prefs.sandbox).toBe(true);
  expect(prefs.nodeIntegration).toBe(false);
  const network = await page.evaluate(async () => {
    try {
      await fetch("https://example.com");
      return true;
    } catch {
      return false;
    }
  });
  expect(network).toBe(false);
  await page
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Project library", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Untitled project", exact: true }),
  ).toBeVisible();
  await page.locator("#language-select").selectOption("zh-Hans");
  await expect(
    page.getByRole("heading", {
      name: "保存好设计，下次直接用。",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("all image exporters produce usable files and the local reader decodes exported QR data", async () => {
  await page.locator(".design-controls select").first().selectOption("qrcode");
  const data = "https://barcodemate.com/desktop-test";
  await page.locator(".barcode-data").fill(data);
  for (const format of ["svg", "png", "gif", "bmp", "tiff", "jpeg"]) {
    const file = path.join(temp, "qr." + format);
    await saveTo(file);
    await page.locator(".export-controls select").selectOption(format);
    await page
      .getByRole("button", { name: "Export barcode", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText("qr." + format);
    const bytes = await readFile(file);
    expect(bytes.length).toBeGreaterThan(100);
    await mkdir("test-results/exports", { recursive: true });
    await writeFile("test-results/exports/qr." + format, bytes);
  }
  await page
    .getByRole("button", { name: "Read a barcode", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles(path.join(temp, "qr.png"));
  await expect(page.locator(".scan-result pre")).toHaveText(data, {
    timeout: 30000,
  });
  await page.screenshot({
    path: "test-results/screenshots/reader.png",
    fullPage: true,
  });
});

test("a uniform column of digits offers its retail format without blocking the import", async () => {
  await page.getByRole("button", { name: "Batch data", exact: true }).click();
  await page
    .getByRole("button", { name: "Paste / import", exact: true })
    .click();
  // Not an exact label match: React writes a textarea's value into its child
  // text node, so the wrapping label's text grows to include whatever was
  // typed and the field can only be found again by prefix.
  const paste = page.getByLabel("Paste your data");
  const hint = page.locator(".import-hint");
  // Mixed content is nobody's retail code, so there is nothing to offer.
  await paste.fill("code\nMATE-2026-001\n5901234123457");
  await expect(hint).toHaveCount(0);
  // Thirteen digits throughout is an EAN-13, and the labels are Code 128.
  await paste.fill("code\n5901234123457\n4006381333931");
  await expect(hint).toContainText("13 digits");
  await expect(hint).toContainText("EAN-13");
  await expect(hint).toContainText("Code 128");
  // A Format ID column means each row names its own, so the hint stands down.
  const format = page.getByRole("combobox", { name: "Format ID" });
  await format.selectOption("0");
  await expect(hint).toHaveCount(0);
  await format.selectOption("-1");
  await expect(hint).toBeVisible();
  // Taking the offer switches the project, which leaves nothing to say.
  await page
    .getByRole("button", { name: "Switch to EAN-13", exact: true })
    .click();
  await expect(hint).toHaveCount(0);
  // The import itself was never blocked, and the format stuck.
  await page.getByRole("button", { name: "Import rows", exact: true }).click();
  await expect(page.getByLabel("Data row 1", { exact: true })).toHaveValue(
    "5901234123457",
  );
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Barcode format" }),
  ).toHaveValue("ean13");
});
test("usage counting is off until asked, and the record is readable in the app", async () => {
  // A fresh profile means the first-run question, which blocks nothing else.
  const ask = page.getByRole("heading", { name: "Help improve BarcodeMate?" });
  await expect(ask).toBeVisible();
  await expect(page.getByText(/Barcode content, names, file paths and error text are never included/)).toBeVisible();

  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(ask).toBeHidden();
  // Declining is remembered as an answer, so it is not asked again.
  const settings = async () => JSON.parse(await readFile(path.join(temp, "usage.json"), "utf8"));
  expect(await settings()).toEqual({ enabled: false, log: [] });

  // The About panel shows the state and offers the record.
  await page.getByTitle("About BarcodeMate").click();
  const toggle = page.getByRole("checkbox", { name: /Send anonymous usage counts/ });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText(/Usage counts are off until you turn them on/)).toBeVisible();
  await page.getByRole("button", { name: "See exactly what was sent" }).click();
  await expect(page.getByRole("heading", { name: "What this app has sent" })).toBeVisible();
  await expect(page.getByText("Nothing has been sent.")).toBeVisible();
  await page.locator(".modal-actions").getByRole("button", { name: "Back" }).click();

  // Turning it on is recorded; nothing was sent while it was off.
  await toggle.click();
  await expect(toggle).toBeChecked();
  const after = await settings();
  expect(after.enabled).toBe(true);
  expect(after.log).toEqual([]);
});
