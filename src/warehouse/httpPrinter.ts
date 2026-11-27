export type HttpPrinterAddress = { host: string; port: number };

export function printerHttpUrl({ host, port }: HttpPrinterAddress) {
  const parts = host.trim().split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    throw Error("httpAddressError");
  const [a, b] = parts.map(Number);
  if (
    !(
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw Error("httpAddressError");
  return `http://${parts.join(".")}:${port}`;
}

// A no-CORS response confirms only that an HTTP exchange completed, not its
// status code, the printer's identity, ZPL support or a completed print job.
async function exchange(
  address: HttpPrinterAddress,
  zpl?: string,
  signal?: AbortSignal,
) {
  const base = printerHttpUrl(address);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, zpl === undefined ? 8000 : 15000);
  try {
    const response = await fetch(
      base + (zpl === undefined ? "/" : "/pstprnt"),
      {
        method: zpl === undefined ? "GET" : "POST",
        mode: "no-cors",
        credentials: "omit",
        // Cross-origin no-CORS fetch requires the browser's follow redirect mode.
        redirect: "follow",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        ...(zpl === undefined
          ? {}
          : {
              headers: { "Content-Type": "text/plain;charset=UTF-8" },
              body: zpl,
            }),
        signal: controller.signal,
      },
    );
    if (response.type !== "opaque" && !response.ok) throw Error("httpError");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export function checkHttpPrinter(
  address: HttpPrinterAddress,
  signal?: AbortSignal,
) {
  return exchange(address, undefined, signal);
}

let sending = false;
export async function sendHttpPrinter(
  address: HttpPrinterAddress,
  zpl: string,
) {
  if (sending) throw Error("sendError");
  if (
    !zpl.startsWith("^XA\n") ||
    !zpl.endsWith("^PQ1^XZ\n") ||
    zpl.length > 6_000_000 ||
    /[^\x00-\x7F]/.test(zpl)
  )
    throw Error("invalid");
  sending = true;
  try {
    await exchange(address, zpl);
  } finally {
    sending = false;
  }
}

export type LocalNetworkPermission = "granted" | "prompt" | "denied" | "unknown";

// Chromium reports whether this site may reach private addresses. Other
// browsers have no such permission to query, so the answer is "unknown".
export async function localNetworkPermission(
  onChange?: () => void,
): Promise<LocalNetworkPermission> {
  try {
    const status = await navigator.permissions.query({
      name: "local-network-access" as PermissionName,
    });
    if (onChange) status.onchange = onChange;
    return status.state;
  } catch {
    return "unknown";
  }
}

// The page cannot read a cross-origin printer page, but it can tell whether an
// image exists. Zebra print servers serve /logo.png on their home page and
// answer 404 for unknown paths, so a decoded image there marks a Zebra printer.
// It does not reveal the model, resolution or ZPL support.
export function identifyHttpPrinter(
  address: HttpPrinterAddress,
  signal?: AbortSignal,
): Promise<"zebra" | "unknown"> {
  const base = printerHttpUrl(address);
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (kind: "zebra" | "unknown") => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      image.src = "";
      resolve(kind);
    };
    const timer = setTimeout(() => finish("unknown"), 8000);
    signal?.addEventListener("abort", () => finish("unknown"), { once: true });
    image.referrerPolicy = "no-referrer";
    image.onload = () => finish(image.naturalWidth > 0 ? "zebra" : "unknown");
    image.onerror = () => finish("unknown");
    image.src = `${base}/logo.png?t=${Date.now()}`;
  });
}
