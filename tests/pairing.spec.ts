import { test, expect, _electron as electron } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HomeProject } from "../src/home/core";
import { settled } from "./profile";
test("desktop pairing uses the native gateway and receives a phone edit without printing", async () => {
  let project: HomeProject | undefined,
    revision = 1,
    origin = "",
    writes = 0,
    attempts = 0,
    creates = 0,
    paired = false,
    gone = false;
  let id = "a".repeat(32),
    invite = "c".repeat(32);
  const token = "b".repeat(32);
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url?.endsWith("/capabilities")) {
      res.end(JSON.stringify({ voice: false }));
      return;
    }
    if (req.headers.origin !== origin) {
      res.writeHead(403).end("{}");
      return;
    }
    let input = "";
    for await (const c of req) input += c;
    if (req.method === "POST") {
      if (++attempts === 1) {
        res.writeHead(503).end("{}");
        return;
      }
      creates++;
      gone = false;
      id = String(creates).padStart(32, "a");
      project = undefined;
      res.end(
        JSON.stringify({
          id,
          token,
          invite,
          code: "12345678",
          origin,
          expires: Date.now() + 86400000,
          inviteExpires: Date.now() + 600000,
          revision,
          project,
          paired: false,
          ready: false,
        }),
      );
      return;
    }
    if (req.headers.authorization !== "Bearer " + token) {
      res.writeHead(401).end("{}");
      return;
    }
    if (gone) {
      res.writeHead(410).end("{}");
      return;
    }
    if (req.method === "DELETE") {
      paired = false;
      project = undefined;
      revision = 1;
      res.end(JSON.stringify({ closed: true }));
      return;
    }
    if (req.method === "PUT") {
      project = JSON.parse(input).project;
      writes++;
      res.end(JSON.stringify({ revision: ++revision }));
      return;
    }
    res.end(
      JSON.stringify({
        id,
        revision,
        project,
        ready: !!project,
        paired,
        ...(!paired
          ? { invite, code: "12345678", inviteExpires: Date.now() + 600000 }
          : {}),
        phoneOnline: true,
        ownerOnline: true,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const dir = await mkdtemp(path.join(os.tmpdir(), "barcodemate-pair-"));
  await settled(dir);
  const app = await electron.launch({
    ...(process.env.BARCODEMATE_EXECUTABLE
      ? { executablePath: process.env.BARCODEMATE_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: {
      ...process.env,
      BARCODEMATE_TEST_DIR: dir,
      BARCODEMATE_HOME_API: origin,
    },
  });
  try {
    const p = await app.firstWindow();
    await p.locator("#language-select").selectOption("en");
    await p.locator("[data-workspace=scenarios]").click();
    await p.locator("[data-workspace=home]").click();
    await expect(p.locator(".hm-pair-qr")).toBeVisible({ timeout: 15000 });
    expect(attempts).toBe(2);
    await expect(p.locator(".hm-pair button")).toHaveCount(1);
    await expect(p.locator("#hm-pair-copy-hint")).toHaveText(
      "Open this link on another computer to sync your list.",
    );
    await expect(p.locator(".hm-pair-title")).toHaveText("Sync with phone");
    expect(creates).toBe(1);
    expect(writes).toBe(0);
    const firstQr = await p.locator(".hm-pair-qr").getAttribute("src");
    invite = "d".repeat(32);
    await expect(p.locator(".hm-pair-qr")).not.toHaveAttribute("src", firstQr!);
    gone = true;
    await expect.poll(() => creates, { timeout: 15000 }).toBe(2);
    await expect(p.locator(".hm-pair-qr")).toBeVisible();
    expect(writes).toBe(0);
    paired = true;
    await expect.poll(() => project?.items.length).toBe(16);
    project!.items[0].originalName = project!.items[0].name;
    project!.items[0].name = "Phone basil";
    revision++;
    await expect(p.locator(".hm-name-editor input").first()).toHaveValue(
      "Phone basil",
      { timeout: 15000 },
    );
    const number = p.locator(".hm-chip input[type=number]").first();
    await number.fill("4");
    await number.blur();
    await expect
      .poll(() => project!.items[0].quantity, { timeout: 15000 })
      .toBe(4);
    expect(writes).toBeGreaterThan(0);
    await p.reload();
    await p.locator("[data-workspace=scenarios]").click();
    await p.locator("[data-workspace=home]").click();
    await expect(p.locator(".hm-name-editor input").first()).toHaveValue(
      "Phone basil",
    );
    expect(await p.evaluate(() => location.protocol)).toBe("barcodemate:");
    await p
      .getByRole("button", { name: "End sharing · keep local copy" })
      .click();
    await expect(p.locator(".hm-pair-qr")).toBeVisible({ timeout: 15000 });
    expect(creates).toBe(3);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
