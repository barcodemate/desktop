import React, { useEffect, useRef, useState } from "react";
import type { Paper } from "./core";
import { openPdfLabel, type PdfLabel } from "./pdfLabel";
import { text, type WarehouseKey } from "./i18n";

// A drop target for a ready-made PDF, such as a shipping label, to print on the
// connected Zebra instead of the labels designed on this page.
export function PdfDrop({
  language,
  paper,
  dpi,
  blockedReason,
  send,
}: {
  language: string;
  paper: Paper;
  dpi: number;
  // Why sending is not possible yet, or null when it is.
  blockedReason: WarehouseKey | null;
  send: (label: PdfLabel) => void;
}) {
  const t = (key: WarehouseKey) => text(language, key);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState<PdfLabel | null>(null);
  const [error, setError] = useState<WarehouseKey | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLDivElement>(null);

  // Re-render when the label size or resolution changes: both alter the dots.
  useEffect(() => {
    setLabel(null);
    setError(null);
    if (!file) return;
    let live = true,
      opened: PdfLabel | undefined;
    openPdfLabel(file, paper, dpi).then(
      (value) => {
        opened = value;
        if (live) setLabel(value);
        else value.close();
      },
      (e) =>
        live &&
        setError(e?.message === "pdfTooLarge" ? "pdfTooLarge" : "pdfError"),
    );
    return () => {
      live = false;
      opened?.close();
    };
  }, [file, paper.pageWidth, paper.pageHeight, dpi]);
  useEffect(() => {
    if (label) preview.current?.replaceChildren(label.preview);
  }, [label]);

  const choose = (files: FileList | null) => {
    const chosen = files?.[0];
    if (!chosen) return;
    if (chosen.type !== "application/pdf" && !/\.pdf$/i.test(chosen.name)) {
      setFile(null);
      setError("pdfError");
      return;
    }
    setFile(chosen);
  };
  const mm = (n: number) => Math.round(n * 10) / 10;

  return (
    <div className="wh-pdf" data-testid="pdf-drop">
      <h3>{t("pdfTitle")}</h3>
      <label
        className="wh-pdf-zone"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          choose(e.dataTransfer.files);
        }}
      >
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => {
            choose(e.target.files);
            e.target.value = "";
          }}
        />
        <span>{file ? file.name : t("pdfDrop")}</span>
      </label>
      {file && !label && !error && (
        <p className="hm-hint" role="status">
          {t("pdfReading")}
        </p>
      )}
      {error && (
        <p className="wh-error" role="alert">
          {t(error)}
        </p>
      )}
      {label && (
        <>
          <div className="wh-pdf-preview" ref={preview} />
          <p className="hm-hint" data-testid="pdf-summary">
            {label.pages} {t("page")} · {mm(label.widthMm)} ×{" "}
            {mm(label.heightMm)} mm ·{" "}
            {label.scale < 1
              ? `${t("pdfShrunk")} ${Math.round(label.scale * 100)}%`
              : t("pdfActualSize")}
          </p>
          <p className="hm-hint">{t("pdfMono")}</p>
          <div className="hm-actions">
            <button
              className="hm-primary"
              disabled={!!blockedReason}
              onClick={() => send(label)}
            >
              {t("pdfSend")}
            </button>
            <button onClick={() => setFile(null)}>{t("pdfRemove")}</button>
          </div>
          {blockedReason && (
            <p className="wh-pdf-blocked" role="status">
              {t(
                blockedReason === "httpConfirmRequired"
                  ? "pdfConfirmRequired"
                  : blockedReason,
              )}
            </p>
          )}
        </>
      )}
      <p className="hm-hint">{t("pdfLocal")}</p>
    </div>
  );
}
