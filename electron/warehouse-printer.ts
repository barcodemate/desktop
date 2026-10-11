import { nativeCode128Width } from "../src/warehouse/nativeCode128";
import { Socket, isIPv4 } from "node:net";
import { request } from "node:http";
export type PrinterAddress = {
  host: string;
  port: number;
  transport?: "tcp" | "http";
  httpPort?: number;
};
export type PrinterInfo = {
  model: string;
  dpi: number;
  languages: string;
  width: number;
  length: number;
};
export function validateAddress(value: PrinterAddress, allowLoopback = false) {
  if (
    !value ||
    typeof value.host !== "string" ||
    !isIPv4(value.host) ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535 ||
    (value.transport !== undefined &&
      !["tcp", "http"].includes(value.transport)) ||
    (value.httpPort !== undefined &&
      (!Number.isInteger(value.httpPort) ||
        value.httpPort < 1 ||
        value.httpPort > 65535))
  )
    throw Error("connectionError");
  const [a, b] = value.host.split(".").map(Number);
  if (!(
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (allowLoopback && a === 127)
  ))
    throw Error("connectionError");
  return {
    host: value.host,
    port: value.port,
    transport: value.transport ?? "tcp",
    httpPort: value.httpPort ?? 80,
  };
}
// Fixed endpoints, bounded responses, no redirects and no automatic retries.
function httpExchange(
  address: ReturnType<typeof validateAddress>,
  zpl?: string,
  timeout = 5000,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let done = false;
    const error = () =>
      Error(zpl === undefined ? "connectionError" : "sendError");
    const finish = (failure?: Error, status = 0) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req.destroy();
      failure ? reject(failure) : resolve(status);
    };
    const req = request(
      {
        host: address.host,
        port: address.httpPort,
        path: zpl === undefined ? "/" : "/pstprnt",
        method: zpl === undefined ? "GET" : "POST",
        agent: false,
        headers:
          zpl === undefined
            ? {}
            : {
                "Content-Type": "text/plain",
                "Content-Length": Buffer.byteLength(zpl, "ascii"),
              },
      },
      (response) => {
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 262144) finish(error());
        });
        response.on("error", () => finish(error()));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          finish(status >= 200 && status < 300 ? undefined : error(), status);
        });
      },
    );
    const timer = setTimeout(() => finish(error()), timeout);
    req.on("error", () => finish(error()));
    req.end(zpl);
  });
}
export async function checkHttpPrinter(
  input: PrinterAddress,
  allowLoopback = false,
  timeout = 5000,
) {
  const address = validateAddress(input, allowLoopback);
  try {
    return {
      reachable: true,
      status: await httpExchange(address, undefined, timeout),
    };
  } catch {
    return { reachable: false, status: 0 };
  }
}
export async function checkPrinterConnection(
  input: PrinterAddress,
  allowLoopback = false,
) {
  const [device, http] = await Promise.all([
    checkPrinter(input, allowLoopback),
    checkHttpPrinter(input, allowLoopback),
  ]);
  return { ...device, http };
}
function exchange(
  address: PrinterAddress,
  data: string,
  read: boolean,
  timeout = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let received = "",
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      socket.destroy();
      error ? reject(error) : resolve(received);
    };
    const deadline = setTimeout(
      () => finish(Error(read ? "connectionError" : "sendError")),
      timeout,
    );
    socket.on("error", () =>
      finish(Error(read ? "connectionError" : "sendError")),
    );
    socket.on("data", (chunk) => {
      received += chunk.toString("utf8");
      if (received.length > 8192) return finish(Error("connectionError"));
      if (read && /^"[^"\r\n]*"\s*$/.test(received)) finish();
    });
    socket.on("end", () =>
      finish(
        read && !/^"[^"\r\n]*"\s*$/.test(received)
          ? Error("connectionError")
          : undefined,
      ),
    );
    socket.connect(address.port, address.host, () => {
      if (read) socket.write(data);
      else socket.end(data, () => finish());
    });
  });
}
export async function readPrinterInfo(
  input: PrinterAddress,
  allowLoopback = false,
  timeout = 5000,
): Promise<PrinterInfo> {
  const address = validateAddress(input, allowLoopback);
  const keys = [
    "device.product_name",
    "head.resolution.in_dpi",
    "device.languages",
    "ezpl.print_width",
    "zpl.label_length",
  ];
  const values: string[] = [];
  for (const key of keys) {
    const reply = await exchange(
      address,
      `! U1 getvar "${key}"\r\n`,
      true,
      timeout,
    );
    values.push(reply.trim().slice(1, -1));
  }
  const [model, dpi, languages, width, length] = values;
  if (
    !model ||
    !languages ||
    ![dpi, width, length].every(
      (v) => /^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 32000,
    )
  )
    throw Error("deviceMismatch");
  return {
    model,
    dpi: Number(dpi),
    languages,
    width: Number(width),
    length: Number(length),
  };
}
export async function checkPrinter(
  input: PrinterAddress,
  allowLoopback = false,
  timeout = 5000,
): Promise<PrinterInfo> {
  const device = await readPrinterInfo(input, allowLoopback, timeout);
  if (
    ![203, 300].includes(device.dpi) ||
    !device.languages.toLowerCase().includes("zpl")
  )
    throw Error("deviceMismatch");
  return device;
}
// Accept only generated graphic/native Code 128 jobs, never arbitrary device commands.
export function inspectJob(zpl: string) {
  if (typeof zpl !== "string" || zpl.length < 20 || zpl.length > 2_000_000)
    throw Error("sizeError");
  const tokens = zpl.match(
    /\^XA\n\^LH0,0\n(?:\^FO\d+,\d+(?:\^GFA,\d+,\d+,\d+,[0-9A-F]+|\^BY\d+,2,\d+\^BCN,\d+,N,N,N,N\^FH_\^FD(?:_[0-9A-F]{2})+)\^FS\n)+\^PQ1\^XZ\n/g,
  );
  if (!tokens || tokens.join("") !== zpl || tokens.length > 1000)
    throw Error("invalid");
  let width = 0,
    height = 0;
  for (const m of zpl.matchAll(
    /\^FO(\d+),(\d+)\^GFA,(\d+),(\d+),(\d+),([0-9A-F]+)\^FS/g,
  )) {
    const [x, y, b, c, stride] = m.slice(1, 6).map(Number);
    if (
      !b ||
      b !== c ||
      b > 99999 ||
      !stride ||
      b % stride ||
      m[6].length !== b * 2
    )
      throw Error("invalid");
    width = Math.max(width, x + stride * 8);
    height = Math.max(height, y + b / stride);
  }
  for (const m of zpl.matchAll(
    /\^FO(\d+),(\d+)\^BY(\d+),2,(\d+)\^BCN,(\d+),N,N,N,N\^FH_\^FD((?:_[0-9A-F]{2})+)\^FS/g,
  )) {
    const [x, y, module, h, bcHeight] = m.slice(1, 6).map(Number);
    if (h < 1 || h > 32000 || h !== bcHeight) throw Error("invalid");
    width = Math.max(width, x + nativeCode128Width(m[6], module));
    height = Math.max(height, y + h);
  }
  return { width, height, pages: tokens.length };
}
let sending = false;
export async function sendPrinter(
  input: PrinterAddress,
  zpl: string,
  dpi: number,
  allowLoopback = false,
) {
  const address = validateAddress(input, allowLoopback),
    job = inspectJob(zpl);
  if (sending) throw Error("sendError");
  sending = true;
  try {
    const device = await checkPrinter(address, allowLoopback);
    if (
      device.dpi !== dpi ||
      job.width > device.width ||
      job.height > device.length
    )
      throw Error("deviceMismatch");
    if (address.transport === "http") await httpExchange(address, zpl, 15000);
    else await exchange(address, zpl, false, 15000);
    return { sent: true as const, pages: job.pages };
  } finally {
    sending = false;
  }
}
