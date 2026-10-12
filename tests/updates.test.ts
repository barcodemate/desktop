import { test } from "node:test";
import assert from "node:assert/strict";
import { Updates, newer } from "../electron/updates";

const store = () => {
  let saved: any = null;
  return {
    data: () => saved,
    read: async () => saved,
    write: async (_name: string, data: string) => { saved = JSON.parse(data); },
  };
};
const at = (iso: string) => () => new Date(iso);

test("a version is only newer when it really is", () => {
  assert.equal(newer("0.5.3", "0.5.2"), true);
  assert.equal(newer("0.6.0", "0.5.9"), true);
  assert.equal(newer("1.0.0", "0.9.9"), true);
  // Compared as numbers, not as text: 0.5.10 beats 0.5.9.
  assert.equal(newer("0.5.10", "0.5.9"), true);
  assert.equal(newer("0.5.2", "0.5.2"), false);
  assert.equal(newer("0.5.1", "0.5.2"), false);
  assert.equal(newer("0.4.9", "0.5.2"), false);
  // Anything that is not three numbers is not a version, and never newer.
  for (const bad of ["0.5", "0.5.2.1", "v0.5.3", "", "latest", "9999.0.0.0", "0.5.x"])
    assert.equal(newer(bad, "0.5.2"), false, bad);
});

test("nothing is asked when checking is switched off", async () => {
  const s = store();
  let asked = 0;
  const u = new Updates(s, "0.5.2", async () => { asked++; return "0.5.3"; });
  await u.allow(false);
  assert.deepEqual(await u.check(), { enabled: false, latest: null, available: false });
  assert.equal(asked, 0);
  assert.equal(s.data().enabled, false);

  // Switching it back on asks again, and the answer is offered.
  const back = await u.allow(true);
  assert.equal(back.enabled, true);
  assert.deepEqual(await u.check(), { enabled: true, latest: "0.5.3", available: true });
  assert.equal(asked, 1);
});

test("the site is asked at most once a day, and a newer version is offered", async () => {
  const s = store();
  let asked = 0;
  let clock = "2026-10-12T09:00:00.000Z";
  const u = new Updates(s, "0.5.2", async () => { asked++; return "0.5.3"; }, () => new Date(clock));
  assert.deepEqual(await u.check(), { enabled: true, latest: "0.5.3", available: true });
  assert.equal(asked, 1);

  // Within the day: the stored answer is reused, nothing is asked.
  clock = "2026-10-12T23:59:00.000Z";
  assert.deepEqual(await u.check(), { enabled: true, latest: "0.5.3", available: true });
  assert.equal(asked, 1);

  // A day later it asks once more.
  clock = "2026-10-13T09:00:01.000Z";
  await u.check();
  assert.equal(asked, 2);
});

test("the same version, an older one, or a nonsense answer offers nothing", async () => {
  for (const answer of ["0.5.2", "0.5.1", "not-a-version", "", "0.5", "99"]) {
    const u = new Updates(store(), "0.5.2", async () => answer, at("2026-10-12T09:00:00.000Z"));
    const status = await u.check();
    assert.equal(status.available, false, answer);
  }
});

test("being offline is not an error the person has to see, and is not retried all day", async () => {
  const s = store();
  let asked = 0;
  let clock = "2026-10-12T09:00:00.000Z";
  const u = new Updates(s, "0.5.2", async () => { asked++; throw new Error("offline"); }, () => new Date(clock));
  assert.deepEqual(await u.check(), { enabled: true, latest: null, available: false });
  // A failure still counts as asked: a site that is down is not retried on every start.
  clock = "2026-10-12T12:00:00.000Z";
  await u.check();
  assert.equal(asked, 1);
  assert.equal(typeof s.data().checkedAt, "string");
});

test("a dismissed notice stays dismissed, until a later version appears", async () => {
  const s = store();
  let answer = "0.5.3";
  let clock = "2026-10-12T09:00:00.000Z";
  const u = new Updates(s, "0.5.2", async () => answer, () => new Date(clock));
  assert.equal((await u.check()).available, true);
  assert.equal((await u.dismiss()).available, false);
  // Still dismissed on the next start, without asking again.
  clock = "2026-10-12T20:00:00.000Z";
  assert.equal((await u.check()).available, false);
  // A later release is offered again.
  answer = "0.5.4"; clock = "2026-10-14T09:00:00.000Z";
  assert.equal((await u.check()).available, true);
});

test("the stored state survives a restart, and switching off forgets it", async () => {
  const s = store();
  const first = new Updates(s, "0.5.2", async () => "0.5.3", at("2026-10-12T09:00:00.000Z"));
  await first.check();
  const second = new Updates({ read: async () => s.data(), write: s.write }, "0.5.2", async () => {
    throw new Error("should not be asked again within the day");
  }, at("2026-10-12T10:00:00.000Z"));
  assert.deepEqual(await second.check(), { enabled: true, latest: "0.5.3", available: true });

  await second.allow(false);
  assert.deepEqual(s.data(), { enabled: false, latest: null, checkedAt: null, dismissed: null });
});

test("callers that race the first read all see the stored state", async () => {
  let release: (value: any) => void = () => {};
  const slow = {
    read: async () => new Promise(resolve => { release = resolve; }),
    write: async () => {},
  };
  const u = new Updates(slow, "0.5.2", async () => "0.5.9");
  const a = u.current(), b = u.current(), c = u.current();
  release({ enabled: false, latest: null, checkedAt: null, dismissed: null });
  for (const status of await Promise.all([a, b, c]))
    assert.deepEqual(status, { enabled: false, latest: null, available: false });
});
