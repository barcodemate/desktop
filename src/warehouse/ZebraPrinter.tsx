import React, { useEffect, useState } from "react";
import type { DesktopAPI } from "../bridge";
import type { Paper, WarehouseProject } from "./core";
import { createZpl } from "./output";
import { printerIssues, zplBounds } from "./printerCheck";
import { text } from "./i18n";
import { WebZebraPrinter } from "./WebZebraPrinter";
import { AdjustmentInput } from "../home/AdjustmentInput";

const CONNECTION = "barcodemate.warehouse.connection.v1";
function savedAddress() {
  try {
    const value = JSON.parse(localStorage.getItem(CONNECTION) || "{}");
    return {
      host: typeof value.host === "string" ? value.host : "",
      port: Number(value.port) || 9100,
    };
  } catch {
    return { host: "", port: 9100 };
  }
}
type Info = Awaited<ReturnType<DesktopAPI["warehouseCheck"]>>;

function DesktopZebraPrinter({
  language,
  desktop,
  project,
  disabled,
  run,
  onSent,
}: {
  language: string;
  desktop?: DesktopAPI;
  project: WarehouseProject;
  disabled: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onSent: () => void;
}) {
  const t = (key: Parameters<typeof text>[1]) => text(language, key);
  const [connection, setConnection] = useState(savedAddress);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<{
    key: string;
    device?: Info;
    error?: boolean;
  } | null>(null);
  const [media, setMedia] = useState(false);
  const host = connection.host.trim();
  const key = `${host}:${connection.port}:${attempt}`;
  const current = check?.key === key ? check : null;
  const device = current?.device;
  const checking = !!desktop && !!host && !current;
  const issues = device ? printerIssues(device, project) : [];
  const compatible = !!device && !issues.length && !disabled;
  let bounds: ReturnType<typeof zplBounds> | undefined;
  try {
    bounds = zplBounds(project);
  } catch {}

  useEffect(() => {
    try {
      localStorage.setItem(CONNECTION, JSON.stringify(connection));
    } catch {}
  }, [connection]);
  useEffect(() => {
    setMedia(false);
  }, [project, key]);
  useEffect(() => {
    if (!desktop || !host) return;
    let active = true;
    // Coalesce address edits and discard results after edits, mode switches or unmounts.
    const timer = setTimeout(async () => {
      try {
        const device = await desktop.warehouseCheck({
          host,
          port: connection.port,
        });
        if (active) setCheck({ key, device });
      } catch {
        if (active) setCheck({ key, error: true });
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [desktop, host, connection.port, key]);

  const status = !desktop
    ? "checkWebUnavailable"
    : !host
      ? "checkNeedsAddress"
      : checking
        ? "checkRunning"
        : current?.error
          ? "connectionError"
          : compatible
            ? "checkCompatible"
            : "checkIncompatible";
  return (
    <section
      className="wh-panel wh-diagnostics"
      data-testid="zebra-diagnostics"
      data-state={compatible ? "ready" : checking ? "checking" : "unavailable"}
    >
      <h2>{t("checkTitle")}</h2>
      <p role="status" className="wh-check-status">
        {t(status)}
      </p>
      {desktop ? (
        <>
          <div className="wh-fields">
            <label>
              {t("host")}
              <input
                value={connection.host}
                placeholder="192.168.x.x"
                onChange={(e) =>
                  setConnection({ ...connection, host: e.target.value })
                }
              />
            </label>
            <label>
              {t("port")}
              <span data-field="port">
                <AdjustmentInput
                  integer
                  value={connection.port}
                  onChange={(port) => setConnection({ ...connection, port })}
                />
              </span>
            </label>
          </div>
          <button
            disabled={!host || checking}
            onClick={() => {
              setCheck(null);
              setAttempt((n) => n + 1);
            }}
          >
            {t("check")}
          </button>
          <p className="hm-hint">{t("checkReadOnly")}</p>
          {device && (
            <dl className="wh-device">
              <div>
                <dt>{t("checkModel")}</dt>
                <dd>{device.model}</dd>
              </div>
              <div>
                <dt>{t("protocol")}</dt>
                <dd>{device.languages}</dd>
              </div>
              <div>
                <dt>{t("dpi")}</dt>
                <dd>
                  {device.dpi} dpi · {t("checkSelected")}: {project.dpi} dpi
                </dd>
              </div>
              <div>
                <dt>{t("checkDimensions")}</dt>
                <dd>
                  {device.width} × {device.length} dots
                  {[203, 300].includes(device.dpi) &&
                    ` · ${+(device.width / (device.dpi === 203 ? 8 : 12)).toFixed(2)} × ${+(device.length / (device.dpi === 203 ? 8 : 12)).toFixed(2)} mm`}
                </dd>
              </div>
              {bounds && (
                <div>
                  <dt>{t("checkRequired")}</dt>
                  <dd>
                    {bounds.width} × {bounds.height} dots
                  </dd>
                </div>
              )}
            </dl>
          )}
          {!!issues.length && (
            <ul className="wh-error">
              {issues.map((issue) => (
                <li key={issue}>{t(issue)}</li>
              ))}
            </ul>
          )}
          {device && disabled && (
            <p className="wh-error">{t("checkLayoutInvalid")}</p>
          )}
          <p className="hm-hint">{t("localConnection")}</p>
          <p className="hm-hint">{t("zplNote")}</p>
          <label className="hm-check">
            <input
              type="checkbox"
              checked={media}
              disabled={!compatible}
              onChange={(e) => setMedia(e.target.checked)}
            />
            {t("confirmMedia")}
          </label>
          <button
            className="hm-primary"
            disabled={!compatible || !media}
            onClick={() =>
              void run(async () => {
                const zpl = await createZpl(project);
                if (
                  !window.confirm(
                    `${t("confirmSend")}\n${host}:${connection.port}`,
                  )
                )
                  return;
                try {
                  await desktop.warehouseSend(
                    { host, port: connection.port },
                    zpl,
                    project.dpi,
                  );
                  onSent();
                } finally {
                  setMedia(false);
                }
              })
            }
          >
            {t("send")}
          </button>
        </>
      ) : (
        <>
          <p>{t("browserNote")}</p>
          <p className="hm-hint">{t("checkWebHelp")}</p>
          <a
            href="https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("browserLink")} ↗
          </a>
        </>
      )}
    </section>
  );
}

export function ZebraPrinter({
  usePaper,
  ...props
}: Parameters<typeof DesktopZebraPrinter>[0] & {
  usePaper: (paper: Paper) => void;
}) {
  return props.desktop ? (
    <DesktopZebraPrinter {...props} />
  ) : (
    <WebZebraPrinter {...props} usePaper={usePaper} />
  );
}
