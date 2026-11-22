import React, { useEffect, useId, useRef, useState } from "react";
import { sampleProject, type WarehouseProject } from "./core";
import { createZpl } from "./output";
import { zplBounds } from "./printerCheck";
import {
  checkHttpPrinter,
  printerHttpUrl,
  sendHttpPrinter,
} from "./httpPrinter";
import { text, type WarehouseKey } from "./i18n";
import { AdjustmentInput } from "../home/AdjustmentInput";
import { PdfDrop } from "./PdfDrop";
import type { PdfLabel } from "./pdfLabel";

export const HTTP_PRINTER_STORE = "barcodemate.warehouse.http.v1";
const STORE = HTTP_PRINTER_STORE;
function savedAddress() {
  try {
    const stored = localStorage.getItem(STORE);
    const value = JSON.parse(
      stored ||
        localStorage.getItem("barcodemate.warehouse.connection.v1") ||
        "{}",
    );
    return {
      host: typeof value.host === "string" ? value.host : "",
      port: stored ? Number(value.port) || 80 : 80,
    };
  } catch {
    return { host: "", port: 80 };
  }
}

export function WebZebraPrinter({
  language,
  project,
  disabled,
  run,
}: {
  language: string;
  project: WarehouseProject;
  disabled: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const t = (key: WarehouseKey) => text(language, key);
  const [address, setAddress] = useState(savedAddress);
  const [check, setCheck] = useState<{ key: string; ok: boolean } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<WarehouseKey | null>(null);
  const sending = useRef(false);
  const hostInput = useRef<HTMLInputElement>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCheck = useRef<AbortController | null>(null);
  const reasonId = useId();
  const key = `${address.host.trim()}:${address.port}`;
  const current = check?.key === key ? check : null;
  let url = "";
  try {
    url = printerHttpUrl(address);
  } catch {}
  let bounds: ReturnType<typeof zplBounds> | undefined;
  try {
    bounds = zplBounds(project);
  } catch {}
  const ready =
    !!current?.ok &&
    !!url &&
    !!bounds &&
    !disabled &&
    project.paper.medium === "roll";
  const status: WarehouseKey = !address.host.trim()
    ? "httpNeedsAddress"
    : !url
      ? "httpAddressError"
      : !current
        ? "httpChecking"
        : current.ok
          ? "httpReachable"
          : "httpCheckFailed";
  const blockedReason: WarehouseKey | null =
    !url || !current?.ok
      ? status
      : !ready
        ? "checkLayoutInvalid"
        : !confirmed
          ? "httpConfirmRequired"
          : null;

  const startCheck = async () => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    activeCheck.current?.abort();
    if (!url) {
      hostInput.current?.focus();
      return;
    }
    const controller = new AbortController();
    activeCheck.current = controller;
    setCheck(null);
    try {
      await checkHttpPrinter(address, controller.signal);
      if (!controller.signal.aborted && activeCheck.current === controller)
        setCheck({ key, ok: true });
    } catch {
      if (!controller.signal.aborted && activeCheck.current === controller)
        setCheck({ key, ok: false });
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(address));
    } catch {}
  }, [address]);
  useEffect(() => {
    setConfirmed(false);
    setNotice(null);
  }, [project, key]);
  useEffect(() => {
    if (!url) return;
    setCheck(null);
    checkTimer.current = setTimeout(() => void startCheck(), 500);
    return () => {
      activeCheck.current?.abort();
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [key, url]);

  const send = (one: boolean) => {
    if (!ready || !confirmed || sending.current) return;
    sending.current = true;
    void run(async () => {
      try {
        setNotice(null);
        const job = one ? sampleProject(project) : project;
        const zpl = await createZpl(job, true);
        const pages = (zpl.match(/\^XA/g) || []).length;
        if (
          !window.confirm(
            `${t("confirmSend")}\n${url}/pstprnt\n${pages} ${t("page")}`,
          )
        )
          return;
        try {
          await sendHttpPrinter(address, zpl);
          setNotice("httpSent");
        } catch {
          setNotice("httpSendFailed");
        }
      } finally {
        sending.current = false;
        setConfirmed(false);
      }
    });
  };

  // A PDF replaces the designed labels, so only the connection, the roll
  // medium and the confirmation gate it, not the label layout.
  const pdfBlocked: WarehouseKey | null =
    !url || !current?.ok
      ? status
      : project.paper.medium !== "roll"
        ? "checkLayoutInvalid"
        : !confirmed
          ? "httpConfirmRequired"
          : null;
  const sendPdf = (label: PdfLabel) => {
    if (pdfBlocked || sending.current) return;
    sending.current = true;
    void run(async () => {
      try {
        setNotice(null);
        if (
          !window.confirm(
            `${t("confirmSend")}\n${url}/pstprnt\n${label.name}\n${label.pages} ${t("page")}`,
          )
        )
          return;
        try {
          // One request per page keeps each job within the size the printer
          // accepts, and stops at the first page that fails.
          for (let page = 1; page <= label.pages; page++)
            await sendHttpPrinter(address, await label.zpl(page));
          setNotice("httpSent");
        } catch {
          setNotice("httpSendFailed");
        }
      } finally {
        sending.current = false;
        setConfirmed(false);
      }
    });
  };

  return (
    <section
      className="wh-panel wh-diagnostics"
      data-testid="zebra-diagnostics"
      data-state={
        current?.ok
          ? "http-reachable"
          : url && !current
            ? "checking"
            : "unavailable"
      }
    >
      <h2>{t("httpTitle")}</h2>
      <p className="wh-check-status" role="status">
        {t(status)}
      </p>
      <div className="wh-fields">
        <label>
          {t("host")}
          <input
            ref={hostInput}
            value={address.host}
            placeholder={t("httpAddressExample")}
            aria-invalid={!!address.host.trim() && !url}
            onChange={(e) => setAddress({ ...address, host: e.target.value })}
          />
        </label>
        <label>
          {t("httpPort")}
          <AdjustmentInput
            integer
            value={address.port}
            onChange={(port) => setAddress({ ...address, port })}
          />
        </label>
      </div>
      <div className="hm-actions">
        <button onClick={() => void startCheck()}>{t("check")}</button>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {t("httpOpenPrinter")} ↗
          </a>
        )}
      </div>
      <p className="hm-hint">{t("httpCheckHelp")}</p>
      <div className="wh-http-body">
      <div>
      {url && (
        <dl className="wh-device">
          <div>
            <dt>{t("httpDestination")}</dt>
            <dd>{url}/pstprnt</dd>
          </div>
          <div>
            <dt>{t("dpi")}</dt>
            <dd>{project.dpi} dpi</dd>
          </div>
          {bounds && (
            <div>
              <dt>{t("checkRequired")}</dt>
              <dd>
                {bounds.width} × {bounds.height} dots
              </dd>
            </div>
          )}
          <div>
            <dt>{t("httpDeviceDetails")}</dt>
            <dd>{t("httpUnreadable")}</dd>
          </div>
        </dl>
      )}
      {(disabled || project.paper.medium !== "roll") && (
        <p className="wh-error">{t("checkLayoutInvalid")}</p>
      )}
      <p className="hm-hint">{t("httpGeometryNote")}</p>
      <label className="hm-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t("httpConfirm")}
      </label>
      {blockedReason && (
        <p id={reasonId} className="hm-hint" role="status">
          {t(blockedReason)}
        </p>
      )}
      <div className="hm-actions">
        <button
          className="hm-primary"
          disabled={!ready || !confirmed}
          aria-describedby={blockedReason ? reasonId : undefined}
          title={blockedReason ? t(blockedReason) : undefined}
          onClick={() => send(true)}
        >
          {t("httpSendOne")}
        </button>
        <button
          disabled={!ready || !confirmed}
          aria-describedby={blockedReason ? reasonId : undefined}
          title={blockedReason ? t(blockedReason) : undefined}
          onClick={() => send(false)}
        >
          {t("httpSendAll")}
        </button>
      </div>
      </div>
      <PdfDrop
        language={language}
        paper={project.paper}
        dpi={project.dpi}
        blockedReason={pdfBlocked}
        send={sendPdf}
      />
      </div>
      {notice && (
        <p className="wh-notice" role="status">
          {t(notice)}
        </p>
      )}
    </section>
  );
}
