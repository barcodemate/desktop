import { test } from "node:test";
import assert from "node:assert/strict";
import { Usage, allowed, EVENTS } from "../electron/usage";

const formats = new Set(["code128", "qrcode", "ean13"]);
const store = () => {
  let saved: any = null;
  return {
    data: () => saved,
    read: async () => saved,
    write: async (_name: string, data: string) => { saved = JSON.parse(data); },
  };
};
const recorder = () => {
  const sent: string[] = [];
  return { sent, send: async (body: string) => { sent.push(body); } };
};

test("only whitelisted event and type pairs can be sent", () => {
  assert.equal(allowed("app_start", "0.5.0", formats), true);
  assert.equal(allowed("app_start", "0.5", formats), false);
  assert.equal(allowed("app_start", "'; DROP", formats), false);
  assert.equal(allowed("app_generate", "code128", formats), true);
  assert.equal(allowed("app_generate", "not-a-format", formats), false);
  assert.equal(allowed("app_import", "csv", formats), true);
  assert.equal(allowed("app_import", "/Users/someone/stock.csv", formats), false);
  assert.equal(allowed("app_export", "png", formats), true);
  assert.equal(allowed("app_fail", "print", formats), true);
  assert.equal(allowed("app_fail", "TypeError: cannot read x of undefined", formats), false);
  assert.equal(allowed("app_everything", "code128", formats), false);
  assert.equal(allowed("app_generate", "x".repeat(41), formats), false);
  // The set is closed: nothing outside it is a valid event at all.
  for (const event of EVENTS) assert.equal(typeof event, "string");
  assert.equal(EVENTS.length, 6);
});

test("nothing is sent before consent, and consent is not implied by a corrupt file", async () => {
  const s = store(), r = recorder();
  const usage = new Usage(s, formats, r.send);
  assert.deepEqual(await usage.current(), { decided: false, enabled: false });
  assert.equal(await usage.track("app_start", "0.5.0"), false);
  assert.deepEqual(r.sent, []);

  // A declined answer is remembered, and still sends nothing.
  await usage.decide(false);
  assert.deepEqual(await usage.current(), { decided: true, enabled: false });
  assert.equal(await usage.track("app_start", "0.5.0"), false);
  assert.deepEqual(r.sent, []);

  const broken = { read: async () => { throw new Error("corrupt"); }, write: async () => {} };
  const second = new Usage(broken, formats, r.send);
  assert.deepEqual(await second.current(), { decided: false, enabled: false });
  assert.equal(await second.track("app_start", "0.5.0"), false);
});

test("after consent only permitted payloads leave, and each one is logged locally", async () => {
  const s = store(), r = recorder();
  const usage = new Usage(s, formats, r.send, () => new Date("2026-10-10T08:00:00Z"));
  await usage.decide(true);
  assert.equal(await usage.track("app_start", "0.5.0"), true);
  assert.equal(await usage.track("app_generate", "qrcode"), true);
  // Refused: not on the whitelist, so it never reaches the network.
  assert.equal(await usage.track("app_generate", "SKU-12345"), false);
  assert.equal(await usage.track("app_note", "hello"), false);
  assert.deepEqual(r.sent, ['{"event":"app_start","type":"0.5.0"}', '{"event":"app_generate","type":"qrcode"}']);
  // Every payload carries exactly two fields and no more.
  for (const body of r.sent) assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ["event", "type"]);
  // The local log mirrors what was sent, which is what the app shows.
  const log = await usage.sent();
  assert.deepEqual(log.map(e => `${e.event}/${e.type}`), ["app_start/0.5.0", "app_generate/qrcode"]);
  assert.equal(log[0].at, "2026-10-10T08:00:00.000Z");
  assert.equal(s.data().enabled, true);

  // Turning it off stops sending immediately.
  await usage.decide(false);
  assert.equal(await usage.track("app_generate", "code128"), false);
  assert.equal(r.sent.length, 2);
  // The log can be cleared without affecting the setting.
  await usage.decide(true);
  await usage.forget();
  assert.deepEqual(await usage.sent(), []);
  assert.equal((await usage.current()).enabled, true);
});

test("a failed send is not retried and never throws", async () => {
  const s = store();
  const usage = new Usage(s, formats, async () => { throw new Error("offline"); });
  await usage.decide(true);
  assert.equal(await usage.track("app_start", "0.5.0"), false);
  // A failure leaves no local record either: nothing was sent.
  assert.deepEqual(await usage.sent(), []);
});

test("a stored preference and log survive a restart, and the log stays bounded", async () => {
  const s = store(), r = recorder();
  const first = new Usage(s, formats, r.send);
  await first.decide(true);
  for (let i = 0; i < 250; i++) await first.track("app_generate", "code128");
  assert.equal((await first.sent()).length, 200);

  const second = new Usage({ read: async () => s.data(), write: s.write }, formats, r.send);
  assert.deepEqual(await second.current(), { decided: true, enabled: true });
  assert.equal((await second.sent()).length, 200);
});

test("a stored answer is never reported as undecided, even to callers that race the first read", async () => {
  // The renderer asks for the state more than once while starting up. A second
  // caller that arrives mid-read must not be told the question is unanswered:
  // that would put the first-run dialog in front of someone who already answered.
  let release: (value: any) => void = () => {};
  const slow = {
    read: async () => new Promise(resolve => { release = resolve; }),
    write: async () => {},
  };
  const usage = new Usage(slow, formats, async () => {});
  const first = usage.current();
  const second = usage.current();
  const third = usage.current();
  release({ enabled: true, log: [{ at: "2026-10-11T00:00:00.000Z", event: "app_start", type: "0.5.0" }] });
  for (const state of await Promise.all([first, second, third]))
    assert.deepEqual(state, { decided: true, enabled: true });
  assert.equal((await usage.sent()).length, 1);
});
