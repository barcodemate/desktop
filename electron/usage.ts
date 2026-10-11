/**
 * Optional, opt-in usage counts.
 *
 * Nothing is sent until the person says yes, and what can be sent is fixed
 * here rather than decided by whatever calls track(): an event name and one
 * value from a closed list, two short strings, nothing else. Barcode content,
 * names, file paths, imported rows, error text, identifiers and timing never
 * enter a payload, because there is no field they could travel in.
 *
 * Every accepted payload is also appended to a local log the person can read
 * in the app, so the claim above is checkable rather than merely stated.
 */

export const ENDPOINT = "https://barcodemate.com/api/usage";
export const EVENTS = [
  "app_start",
  "app_generate",
  "app_import",
  "app_print",
  "app_export",
  "app_fail",
] as const;
export type UsageEvent = (typeof EVENTS)[number];

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const SOURCES = new Set(["csv", "paste", "library"]);
const TARGETS = new Set(["zpl", "system", "pdf"]);
const FILES = new Set(["png", "svg", "gif", "pdf", "zpl", "csv", "zip"]);
const STEPS = new Set(["generate", "import", "print", "export"]);

/** The type a given event may carry. Anything else is refused before sending. */
export function allowed(event: string, type: string, formats: ReadonlySet<string>): boolean {
  if (typeof event !== "string" || typeof type !== "string" || type.length > 40) return false;
  switch (event) {
    case "app_start": return VERSION.test(type);
    case "app_generate": return formats.has(type);
    case "app_import": return SOURCES.has(type);
    case "app_print": return TARGETS.has(type);
    case "app_export": return FILES.has(type);
    case "app_fail": return STEPS.has(type);
    default: return false;
  }
}

export interface Sent { at: string; event: string; type: string }
export interface State { decided: boolean; enabled: boolean }

type Store = {
  read(name: string): Promise<any>;
  write(name: string, data: string): Promise<void>;
};

export class Usage {
  private state: State = { decided: false, enabled: false };
  private log: Sent[] = [];
  private loading?: Promise<void>;
  constructor(
    private store: Store,
    private formats: ReadonlySet<string>,
    private send: (body: string) => Promise<void>,
    private now: () => Date = () => new Date(),
  ) {}

  /**
   * Reads the stored answer once. Callers arriving while the first read is
   * still in flight await that same read: handing them the empty default
   * would look like an unanswered first run and ask all over again.
   */
  private load() {
    return (this.loading ??= this.read());
  }
  private async read() {
    try {
      const saved = await this.store.read("usage.json");
      if (typeof saved?.enabled === "boolean") this.state = { decided: true, enabled: saved.enabled };
      if (Array.isArray(saved?.log)) {
        this.log = saved.log
          .filter((row: any) => typeof row?.at === "string" && typeof row?.event === "string" && typeof row?.type === "string")
          .slice(-200);
      }
    } catch {
      /* A corrupt preference must not block startup, and must not imply consent. */
    }
  }
  private persist() {
    return this.store
      .write("usage.json", JSON.stringify({ enabled: this.state.enabled, log: this.log.slice(-200) }))
      .catch(() => {});
  }

  async current(): Promise<State> {
    await this.load();
    return { ...this.state };
  }
  /** Records the answer to the first-run question, and turns collection on or off later. */
  async decide(enabled: boolean): Promise<State> {
    await this.load();
    this.state = { decided: true, enabled: !!enabled };
    await this.persist();
    return { ...this.state };
  }
  /** What this machine has actually sent, newest last, for the person to read. */
  async sent(): Promise<Sent[]> {
    await this.load();
    return this.log.slice();
  }
  async forget(): Promise<void> {
    await this.load();
    this.log = [];
    await this.persist();
  }

  /** Returns false when nothing was sent, for any reason. Never throws. */
  async track(event: string, type: string): Promise<boolean> {
    await this.load();
    if (!this.state.enabled) return false;
    if (!allowed(event, type, this.formats)) return false;
    const body = JSON.stringify({ event, type });
    if (body.length > 256) return false;
    try {
      await this.send(body);
    } catch {
      // Statistics must never interrupt the work, and a failure is not retried:
      // a queue that survives restarts would outlive the consent that allowed it.
      return false;
    }
    this.log.push({ at: this.now().toISOString(), event, type });
    this.log = this.log.slice(-200);
    void this.persist();
    return true;
  }
}

/** The one request this module makes. No cookies, no referrer, no identifiers. */
export async function post(body: string): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // The app is not a browser and sends no Origin; this names it instead.
      "X-BarcodeMate-Desktop": "1",
    },
    body,
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(String(response.status));
}
