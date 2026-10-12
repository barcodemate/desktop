import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { settled } from "./profile";

const launch = (temp: string) =>
  electron.launch({
    ...(process.env.BARCODEMATE_EXECUTABLE
      ? { executablePath: process.env.BARCODEMATE_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: { ...process.env, BARCODEMATE_TEST_DIR: temp },
  });

test("an available update is offered once, can be dismissed, and the check can be switched off", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "barcodemate-updates-"));
  await settled(temp);
  const file = path.join(temp, "updates.json");
  const stored = async () => JSON.parse(await readFile(file, "utf8"));
  // A version nobody will ever ship, answered a moment ago so the app has no
  // reason to ask again. Nothing in this test reaches the real website: the
  // main process refuses to make that request while BARCODEMATE_TEST_DIR is set.
  await writeFile(file, JSON.stringify({
    enabled: true, latest: "99.0.0", checkedAt: new Date().toISOString(), dismissed: null,
  }));

  let app = await launch(temp);
  try {
    let page = await app.firstWindow();
    const notice = page.locator(".update-notice");
    // Generous only because this waits for the app to start on a slow machine:
    // the notice itself comes from stored state, with no network and no timer.
    await expect(notice).toContainText("A new version is available", { timeout: 20000 });
    await expect(notice).toContainText("v99.0.0");
    // The notice is a line above the work, not a dialog: the workspace is usable.
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator(".modal-overlay")).toHaveCount(0);

    // It follows the interface language.
    await page.locator("#language-select").selectOption("zh-Hans");
    await expect(notice).toContainText("有新版本可用");
    await page.locator("#language-select").selectOption("en");

    // Dismissing hides it and is remembered for that version.
    await notice.getByRole("button", { name: "Not now" }).click();
    await expect(notice).toHaveCount(0);
    expect((await stored()).dismissed).toBe("99.0.0");
    await page.reload();
    await expect(page.locator(".update-notice")).toHaveCount(0);

    // Switching the check off clears what was learned, so nothing is kept.
    await page.getByTitle("About BarcodeMate").click();
    const toggle = page.getByRole("checkbox", { name: /Check for new versions/ });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect(await stored()).toEqual({ enabled: false, latest: null, checkedAt: null, dismissed: null });
  } finally {
    await app.close();
  }

  // Off stays off across a restart, and no notice appears even though a newer
  // version was known before.
  app = await launch(temp);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator(".update-notice")).toHaveCount(0);
    expect((await stored()).enabled).toBe(false);
  } finally {
    await app.close();
  }
});
