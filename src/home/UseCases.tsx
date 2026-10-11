import React, { useEffect } from "react";
import { type ShortcutId, shortcutKeys } from "./shortcuts";
import "./shortcuts.css";
import { text, isRTL } from "./i18n";
import "./home.css";

export function UseCases({
  language,
  onHome,
  onWarehouse,
  onRetail,
  shortcuts,
  onAdd,
  focusCase,
}: {
  language: string;
  onHome: () => void;
  onWarehouse: () => void;
  onRetail: () => void;
  shortcuts: ShortcutId[];
  onAdd: (id: ShortcutId) => void;
  focusCase: ShortcutId | null;
}) {
  const t = (key: Parameters<typeof text>[1]) => text(language, key);
  useEffect(() => {
    if (focusCase) document.getElementById("case-" + focusCase)?.focus();
  }, [focusCase]);
  const pin = (id: ShortcutId) => (
    <button
      type="button"
      className="hm-pin"
      data-pin-case={id}
      aria-pressed={shortcuts.includes(id)}
      title={
        t(shortcuts.includes(id) ? "shortcutAdded" : "addShortcut") +
        ": " +
        t(shortcutKeys[id])
      }
      aria-label={
        t(shortcuts.includes(id) ? "shortcutAdded" : "addShortcut") +
        ": " +
        t(shortcutKeys[id])
      }
      onClick={() => onAdd(id)}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 18 18 6M6 6h12v12" />
      </svg>
    </button>
  );
  return (
    <section className="hm-root hm-cases" dir={isRTL(language) ? "rtl" : "ltr"}>
      <div className="hm-heading">
        <div>
          <p className="hm-eyebrow">BARCODEMATE</p>
          <h1>{t("useCases")}</h1>
          <p>{t("casesIntro")}</p>
        </div>
      </div>
      <div className="hm-case-grid">
        <article className="hm-case-card" id="case-home">
          <button
            type="button"
            className="hm-case-open hm-case-ready"
            onClick={onHome}
          >
            <div className="hm-case-heading">
              <svg
                width={24}
                height={24}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" />
              </svg>
              <h2>{t("homeCategory")}</h2>
            </div>
            <p>{t("homeCaseDescription")}</p>
            <span className="hm-case-link">{t("title")} →</span>
          </button>
          {pin("home")}
        </article>
        <article className="hm-case-card" id="case-warehouse" tabIndex={-1}>
          <button type="button" className="hm-case-open hm-case-ready" onClick={onWarehouse}>
          <div className="hm-case-heading">
            <svg
              width={24}
              height={24}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M3 21V7l9-4 9 4v14M7 21V10h10v11M7 14h10M7 18h10" />
            </svg>
            <h2>{t("warehouse")}</h2>
          </div>
          <p>{t("warehouseDescription")}</p>
          <span className="hm-case-link">{t("warehouse")} →</span>
          </button>
          {pin("warehouse")}
        </article>
        <article className="hm-case-card" id="case-supermarket" tabIndex={-1}>
          <button type="button" className="hm-case-open hm-case-ready" onClick={onRetail}>
          <div className="hm-case-heading">
            <svg
              width={24}
              height={24}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M2 3h3l3 13h11l3-9H6M9 20h.01M18 20h.01" />
            </svg>
            <h2>{t("supermarket")}</h2>
          </div>
          <p>{t("supermarketDescription")}</p>
          <span className="hm-case-link">{t("supermarket")} →</span>
          </button>
          {pin("supermarket")}
        </article>
      </div>
    </section>
  );
}
