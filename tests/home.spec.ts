import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { settled } from "./profile";
test("household labels preserve sizes across locales and export a real bilingual PDF", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "barcodemate-home-"));
  await settled(temp);
  const app = await electron.launch({
    ...(process.env.BARCODEMATE_EXECUTABLE
      ? { executablePath: process.env.BARCODEMATE_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });
  try {
    const page = await app.firstWindow();
    await page.locator("#language-select").selectOption("zh-Hans");
    await page.locator('[data-workspace="scenarios"]').click();
    await page.locator('[data-workspace="home"]').click();
    await expect(
      page.frameLocator(".hm-preview iframe").locator(".preview-guide").first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "＋ 盐", exact: true }).click();
    await page.getByLabel("加上英文", { exact: true }).check();
    await page.getByLabel("地区", { exact: true }).selectOption("CA");
    await page.locator("[data-testid=home-paper]").selectOption("letter-30");
    const ids = await page
      .locator("[data-testid=home-paper] option")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLOptionElement).value).sort(),
      );
    await page.locator("#language-select").selectOption("ar");
    expect(
      await page
        .locator("[data-testid=home-paper] option")
        .evaluateAll((nodes) =>
          nodes.map((n) => (n as HTMLOptionElement).value).sort(),
        ),
    ).toEqual(ids);
    await expect(page.locator("[data-testid=home-paper]")).toHaveValue(
      "letter-30",
    );
    await page.locator("#language-select").selectOption("zh-Hans");
    const file = path.join(temp, "household.pdf");
    await page.getByRole("button", { name: "手动缩放", exact: true }).click();
    await page
      .getByRole("slider", { name: "预览缩放", exact: true })
      .evaluate((el: HTMLInputElement) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(el, "4");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await page
      .getByRole("button", { name: "记住当前比例", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page.locator(".hm-preview iframe").boundingBox())?.width || 0,
      )
      .toBeCloseTo(863.6, 0);
    await expect(
      page.frameLocator(".hm-preview iframe").locator(".preview-guide"),
    ).toHaveCount(30);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page.getByRole("button", { name: "保存 PDF", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(file)).subarray(0, 4).toString();
        } catch {
          return "";
        }
      })
      .toBe("%PDF");
    const jsonFile = path.join(temp, "household.json");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, jsonFile);
    await page.locator(".hm-backup summary").click();
    await page.getByRole("button", { name: "导出备份", exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(jsonFile, "utf8")).schema;
        } catch {
          return "";
        }
      })
      .toBe("barcodemate-home-1");
    await page.locator(".hm-root input[type=file]").setInputFiles(jsonFile);
    await expect(page.locator("[data-testid=home-paper]")).toHaveValue(
      "letter-30",
    );
    await page.getByRole("button", { name: "设计条码", exact: true }).click();
    await page.locator('[data-workspace="scenarios"]').click();
    await page.locator('[data-workspace="home"]').click();
    await expect(page.locator(".hm-chip-selected")).toHaveCount(16);
    await page.locator(".hm-tabs button").nth(1).click();
    await expect(page.locator(".hm-chip")).toHaveCount(8);
    await page.locator(".hm-name-editor input").first().fill("My storage box");
    await page.locator(".hm-name-editor input").first().press("Enter");
    await page.locator(".hm-tabs button").first().click();
    await expect(page.locator(".hm-chip")).toHaveCount(16);
    await page.locator(".hm-tabs button").nth(1).click();
    await expect(page.locator(".hm-name-editor input").first()).toHaveValue("My storage box");
  } finally {
    await app.close();
  }
});
