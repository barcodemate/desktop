/**
 * An update notice, and nothing else.
 *
 * The app asks our own website which version is current, at most once a day,
 * and shows a line when that version is newer than the one running. It
 * downloads nothing and installs nothing: the link opens the download page in
 * the browser, and the person decides from there.
 *
 * The request is a bare GET with no body, no cookies, no referrer and no
 * identifier, and it does not say which version is asking: the comparison
 * happens here, so the answer cannot be tailored to one machine and the site
 * learns only that somebody asked. It reaches an endpoint whose access
 * logging is disabled, as the usage counter's is.
 *
 * Checking can be switched off, and then nothing leaves at all.
 */

export const ENDPOINT = "https://barcodemate.com/api/desktop/version";
const DAY = 24 * 60 * 60 * 1000;
const VERSION = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/;

/** True when `latest` is a later release than `current`. Equal is not newer. */
export function newer(latest: string, current: string): boolean {
  if (!VERSION.test(latest) || !VERSION.test(current)) return false;
  const a = latest.split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export interface Status {
  /** Whether the app may ask at all. */
  enabled: boolean;
  /** The newest version the site reported, or null when never answered. */
  latest: string | null;
  /** True when `latest` is newer than this build and has not been dismissed. */
  available: boolean;
}

interface State {
  enabled: boolean;
  latest: string | null;
  checkedAt: string | null;
  dismissed: string | null;
}

type Store = {
  read(name: string): Promise<any>;
  write(name: string, data: string): Promise<void>;
};

export class Updates {
  private state: State = { enabled: true, latest: null, checkedAt: null, dismissed: null };
  private loading?: Promise<void>;
  constructor(
    private store: Store,
    private version: string,
    private ask: () => Promise<string>,
    private now: () => Date = () => new Date(),
  ) {}

  /**
   * Reads the stored state once. Callers arriving while the first read is in
   * flight await that same read rather than seeing the empty default.
   */
  private load() {
    return (this.loading ??= this.read());
  }
  private async read() {
    try {
      const saved = await this.store.read("updates.json");
      if (saved && typeof saved === "object") {
        if (typeof saved.enabled === "boolean") this.state.enabled = saved.enabled;
        if (typeof saved.latest === "string" && VERSION.test(saved.latest)) this.state.latest = saved.latest;
        if (typeof saved.checkedAt === "string") this.state.checkedAt = saved.checkedAt;
        if (typeof saved.dismissed === "string" && VERSION.test(saved.dismissed)) this.state.dismissed = saved.dismissed;
      }
    } catch {
      /* A damaged preference must not block startup. Checking stays on, which sends no data about this machine. */
    }
  }
  private persist() {
    return this.store.write("updates.json", JSON.stringify(this.state)).catch(() => {});
  }
  private status(): Status {
    const { enabled, latest, dismissed } = this.state;
    return {
      enabled,
      latest,
      available: !!latest && newer(latest, this.version) && latest !== dismissed,
    };
  }

  async current(): Promise<Status> {
    await this.load();
    return this.status();
  }

  /**
   * Asks the site, but only when switched on and not asked within a day.
   * Returns the status either way, and never throws: being offline, blocked
   * or answered with nonsense all mean the same thing here, which is that the
   * app carries on and says nothing about updates.
   */
  async check(): Promise<Status> {
    await this.load();
    if (!this.state.enabled) return this.status();
    const last = this.state.checkedAt ? Date.parse(this.state.checkedAt) : NaN;
    if (Number.isFinite(last) && this.now().getTime() - last < DAY) return this.status();
    try {
      const latest = await this.ask();
      if (!VERSION.test(latest)) return this.status();
      this.state.latest = latest;
    } catch {
      return this.status();
    } finally {
      // A failed answer still counts as asked: a site that is down must not be
      // retried on every start, and the person is not waiting for this.
      this.state.checkedAt = this.now().toISOString();
      void this.persist();
    }
    return this.status();
  }

  /** Switches checking on or off. Off also forgets what was last reported. */
  async allow(enabled: boolean): Promise<Status> {
    await this.load();
    this.state.enabled = !!enabled;
    if (!this.state.enabled) {
      this.state.latest = null;
      this.state.checkedAt = null;
      this.state.dismissed = null;
    }
    await this.persist();
    return this.status();
  }

  /** Hides the notice for the version currently offered. A later one shows again. */
  async dismiss(): Promise<Status> {
    await this.load();
    if (this.state.latest) this.state.dismissed = this.state.latest;
    await this.persist();
    return this.status();
  }
}

/** The one request this module makes: no body, no cookies, no referrer, no identifier. */
export async function askSite(): Promise<string> {
  const response = await fetch(ENDPOINT, {
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(String(response.status));
  const text = await response.text();
  if (text.length > 200) throw new Error("Unexpected answer");
  const version = JSON.parse(text)?.version;
  if (typeof version !== "string") throw new Error("Unexpected answer");
  return version;
}
