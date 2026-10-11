import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { languages, translate } from "../src/i18n";
import { settled } from "./profile";

test("all 24 languages switch instantly across workflows and native menus without changing project data", async () => {
  test.setTimeout(180000);
  const temp = await mkdtemp(path.join(os.tmpdir(), "barcodemate-languages-"));
  await settled(temp);
  let app = await electron.launch({
    ...(process.env.BARCODEMATE_EXECUTABLE
      ? { executablePath: process.env.BARCODEMATE_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#language-select");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1080, 800),
    );
    await page.locator("#language-select").selectOption("en");
    await page.locator(".barcode-data").fill("KEEP-00001234");
    const failures: string[] = [];
    page.on("pageerror", (e) => failures.push(e.message));
    for (const language of languages) {
      const L = (s: string) => translate(language.code, s);
      await page.locator("#language-select").selectOption(language.code);
      await expect(page.locator("html")).toHaveAttribute("lang", language.code);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        language.direction,
      );
      for (const index of [
        "scenarios",
        "home",
        "design",
        "batch",
        "labels",
        "library",
        "scan",
      ]) {
        await page.locator(`[data-workspace="${index}"]`).click();
        await expect(page.locator("h1")).not.toBeEmpty();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          language.code + " tab " + index,
        ).toBe(true);
      }
      await page.locator('[data-workspace="batch"]').click();
      await page
        .locator(".batch-toolbar")
        .getByRole("button", { name: L("Generate sequence"), exact: true })
        .click();
      await expect(page.locator("#modal-title")).toHaveText(
        L("Create a numbered series"),
      );
      await page.getByRole("button", { name: L("Close"), exact: true }).click();
      const labels = await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()?.items.map((i) => i.label),
      );
      expect(labels).toContain(L("File"));
      await page.locator('[data-workspace="design"]').click();
      await expect(page.locator(".barcode-data")).toHaveValue("KEEP-00001234");
    }
    await page.locator("#language-select").selectOption("ar");
    await mkdir("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: "test-results/screenshots/arabic-design.png",
      fullPage: true,
    });
    await page.locator("#language-select").selectOption("de");
    await page.screenshot({
      path: "test-results/screenshots/german-design.png",
      fullPage: true,
    });
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(path.join(temp, "language.json"), "utf8"))
            .language,
      )
      .toBe("de");
    await page.reload();
    await expect(page.locator("#language-select")).toHaveValue("de");
    expect(failures).toEqual([]);
    await app.close();
    app = await electron.launch({
      ...(process.env.BARCODEMATE_EXECUTABLE
        ? { executablePath: process.env.BARCODEMATE_EXECUTABLE, args: [] }
        : { args: ["."] }),
      env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
    });
    const reopened = await app.firstWindow();
    await expect(reopened.locator("#language-select")).toHaveValue("de");
    await expect(reopened.locator("html")).toHaveAttribute("lang", "de");
    await expect
      .poll(async () =>
        app.evaluate(({ Menu }) =>
          Menu.getApplicationMenu()?.items.map((i) => i.label),
        ),
      )
      .toContain(translate("de", "File"));
  } finally {
    await app.close();
  }
});
