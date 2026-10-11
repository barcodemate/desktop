import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { settled } from "./profile";

test("retail desktop navigation, saved selection and native PDF reuse the shared paper geometry", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "barcodemate-retail-"));
  await settled(temp);
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator("#language-select").selectOption("en");
    await page.locator("[data-workspace=scenarios]").click();
    await page.locator("#case-supermarket .hm-case-open").click();
    await expect(page.locator(".rt-editor")).toBeVisible();
    await page.getByLabel("Price 1", { exact: true }).fill("7.50");
    await page.getByTestId("retail-template").selectOption("sale");
    await expect(
      page.frameLocator(".wh-preview iframe").locator(".price"),
    ).toHaveText("$7.50");
    const pdfFile = path.join(temp, "retail.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, pdfFile);
    await page.getByRole("button", { name: "Save PDF", exact: true }).click();
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
    expect(Math.abs(Number(mediaBox[1]) - (210 * 72) / 25.4)).toBeLessThan(1);
    expect(Math.abs(Number(mediaBox[2]) - (297 * 72) / 25.4)).toBeLessThan(1);
    await page.locator("[data-workspace=warehouse]").click();
    await expect(
      page.frameLocator(".wh-preview iframe").locator(".label"),
    ).toHaveCount(12);
    await page.locator("[data-workspace=retail]").click();
    await expect(page.getByLabel("Price 1", { exact: true })).toHaveValue(
      "7.50",
    );
    await expect(page.getByTestId("retail-template")).toHaveValue("sale");
    await page.locator("[data-workspace=scenarios]").click();
    await page.locator('[data-pin-case="supermarket"]').click();
    await page
      .locator('[data-shortcut="supermarket"] > button')
      .first()
      .click();
    await expect(page.locator(".rt-editor")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
