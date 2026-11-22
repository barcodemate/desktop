import React, { useEffect, useRef, useState } from "react";
import {
  checkHttpPrinter,
  identifyHttpPrinter,
  localNetworkPermission,
  printerHttpUrl,
} from "./httpPrinter";
import { text, type WarehouseKey } from "./i18n";

type StepState = "waiting" | "checking" | "ok" | "warn" | "fail" | "skipped";
type Step = { state: StepState; detail: WarehouseKey };
type Verdict = "checking" | "zebra" | "unidentified" | "failed";

const waiting: Step = { state: "waiting", detail: "linkWaiting" };
const checking: Step = { state: "checking", detail: "linkChecking" };
const skipped: Step = { state: "skipped", detail: "linkSkipped" };
const marks: Record<StepState, string> = {
  waiting: "·",
  checking: "…",
  ok: "✓",
  warn: "!",
  fail: "✕",
  skipped: "–",
};

// Opened by a ?printer=<ip> link. It answers, in the order a person would
// troubleshoot, whether the browser may reach the LAN, whether the address
// answers, and what answers there, before the address is adopted.
export function PrinterLinkDialog({
  language,
  host,
  onClose,
}: {
  language: string;
  host: string;
  onClose: (use: boolean) => void;
}) {
  const t = (key: WarehouseKey) => text(language, key);
  const dialog = useRef<HTMLDialogElement>(null);
  const [steps, setSteps] = useState<[Step, Step, Step]>([
    checking,
    waiting,
    waiting,
  ]);
  const [verdict, setVerdict] = useState<Verdict>("checking");
  const [attempt, setAttempt] = useState(0);
  const address = { host, port: 80 };

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;
    // Re-run when the visitor answers the browser prompt or changes the setting.
    const rerun = () => live() && setAttempt((n) => n + 1);
    // "pending": the request ran out of time with the browser prompt unanswered.
    // "undecided": the request failed on its own before the browser ever asked.
    const permissionStep = async (
      afterRequest: false | "pending" | "undecided",
    ): Promise<Step> => {
      const permission = await localNetworkPermission(rerun);
      return permission === "granted"
        ? { state: "ok", detail: "linkPermGranted" }
        : permission === "denied"
          ? { state: "fail", detail: "linkPermDenied" }
          : permission === "unknown"
            ? { state: "warn", detail: "linkPermUnknown" }
            : afterRequest === "pending"
              ? { state: "warn", detail: "linkPermPending" }
              : afterRequest === "undecided"
                ? { state: "warn", detail: "linkPermUndecided" }
                : { state: "checking", detail: "linkPermPrompt" };
    };
    void (async () => {
      setVerdict("checking");
      setSteps([checking, waiting, waiting]);
      let permission = await permissionStep(false);
      if (!live()) return;
      if (permission.state === "fail") {
        setSteps([permission, skipped, skipped]);
        setVerdict("failed");
        return;
      }
      // With the permission still undecided, this request is what makes the
      // browser ask.
      setSteps([permission, checking, waiting]);
      let reachable = true;
      const started = Date.now();
      try {
        await checkHttpPrinter(address, controller.signal);
      } catch {
        reachable = false;
      }
      if (!live()) return;
      if (permission.state === "checking") {
        permission = await permissionStep(
          reachable || Date.now() - started > 7000 ? "pending" : "undecided",
        );
        if (!live()) return;
      }
      if (!reachable) {
        const blocked =
          permission.state === "fail" || permission.detail === "linkPermPending";
        setSteps([
          permission,
          blocked ? skipped : { state: "fail", detail: "linkReachFail" },
          skipped,
        ]);
        setVerdict("failed");
        return;
      }
      // A completed request proves access even where the browser cannot say so.
      if (permission.state === "warn" && permission.detail !== "linkPermUnknown")
        permission = { state: "ok", detail: "linkPermGranted" };
      const reached: Step = { state: "ok", detail: "linkReachOk" };
      setSteps([permission, reached, checking]);
      const kind = await identifyHttpPrinter(address, controller.signal);
      if (!live()) return;
      setSteps([
        permission,
        reached,
        kind === "zebra"
          ? { state: "ok", detail: "linkIdentifyZebra" }
          : { state: "warn", detail: "linkIdentifyUnknown" },
      ]);
      setVerdict(kind === "zebra" ? "zebra" : "unidentified");
    })();
    return () => controller.abort();
  }, [attempt, host]);

  const titles: WarehouseKey[] = [
    "linkStepPermission",
    "linkStepReach",
    "linkStepIdentify",
  ];
  return (
    <dialog
      ref={dialog}
      className="wh-link"
      data-testid="printer-link"
      data-verdict={verdict}
      aria-labelledby="wh-link-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
    >
      <h2 id="wh-link-title">
        {t("linkTitle")} <bdi>{host}</bdi>
      </h2>
      <ol aria-live="polite">
        {steps.map((step, index) => (
          <li key={titles[index]} data-state={step.state}>
            <span className="wh-link-mark" aria-hidden="true">
              {marks[step.state]}
            </span>
            <div>
              <strong>{t(titles[index])}</strong>
              <p>{t(step.detail)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="hm-hint">{t("linkNothingPrinted")}</p>
      <div className="hm-actions">
        {verdict === "zebra" && (
          <button className="hm-primary" onClick={() => onClose(true)}>
            {t("linkUse")}
          </button>
        )}
        {verdict === "unidentified" && (
          <>
            <a
              href={printerHttpUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("httpOpenPrinter")} ↗
            </a>
            <button onClick={() => onClose(true)}>{t("linkUseAnyway")}</button>
          </>
        )}
        {verdict !== "checking" && verdict !== "zebra" && (
          <button onClick={() => setAttempt((n) => n + 1)}>
            {t("linkRetry")}
          </button>
        )}
        <button onClick={() => onClose(false)}>{t("linkCancel")}</button>
      </div>
    </dialog>
  );
}
