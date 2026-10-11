import React, { useEffect, useMemo, useState } from "react";
import {
  parseImport,
  validateProject,
  WarehouseError,
  type Item,
  type WarehouseProject,
} from "../warehouse/core";
import { AdjustmentInput } from "../home/AdjustmentInput";
import { retailText, type RetailKey } from "./i18n";
import {
  emptyMapping,
  guessMapping,
  importRetail,
  retailColumns,
  retailItem,
  type RetailFields,
  type RetailMapping,
} from "./model";
import "./retail.css";

export const retailSample =
  "name,code,price,originalPrice,unit,note,offer,copies\nOrganic green tea,5901234123457,8.50,10.00,250 g,,,2\nCeramic mug,000123,12.00,15.00,350 ml,,2 for $20,1\n";
export function RetailEditor({
  project,
  language,
  onChange,
  onNotice,
  onPickFile,
  onSample,
  incoming,
}: {
  project: WarehouseProject;
  language: string;
  onChange: (next: WarehouseProject) => void;
  onNotice: (message: string) => void;
  onPickFile: () => void;
  onSample: () => void;
  incoming: { text: string } | null;
}) {
  const t = (key: Parameters<typeof retailText>[1]) =>
    retailText(language, key);
  const rows = project.lists.sku,
    options = project.retail!;
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [csv, setCsv] = useState(""),
    [table, setTable] = useState<string[][]>([]);
  const [header, setHeader] = useState(true),
    [map, setMap] = useState<RetailMapping>(emptyMapping);
  const [decimal, setDecimal] = useState<"." | ",">(".");
  const [error, setError] = useState("");
  const fail = (e: unknown) =>
    e instanceof WarehouseError
      ? t(e.key as RetailKey) + (e.detail ? ` · ${e.detail}` : "")
      : t("importError");
  const stage = (value: string) => {
    try {
      const parsed = parseImport(value);
      if (!parsed.length) throw new WarehouseError("importError");
      setCsv(value);
      setTable(parsed);
      setHeader(true);
      setMap(guessMapping(parsed[0]));
      setError("");
    } catch (e) {
      setTable([]);
      setError(fail(e));
    }
  };
  useEffect(() => {
    if (incoming) stage(incoming.text);
  }, [incoming]);
  const prepared = useMemo(() => {
    if (!table.length) return null;
    try {
      return { items: importRetail(table, map, header, decimal), error: "" };
    } catch (e) {
      return { items: [] as Item[], error: fail(e) };
    }
  }, [table, map, header, decimal, language]);
  const updateRows = (items: Item[]) =>
    onChange({ ...project, lists: { ...project.lists, sku: items } });
  const edit = (
    id: string,
    change: Partial<Item>,
    fields?: Partial<RetailFields>,
  ) =>
    updateRows(
      rows.map((item) =>
        item.id === id
          ? {
              ...item,
              ...change,
              ...(fields ? { retail: { ...item.retail!, ...fields } } : {}),
            }
          : item,
      ),
    );
  const filtered = rows.filter((item) =>
    `${item.name} ${item.code} ${item.retail!.unit} ${item.retail!.note}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const count = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, count - 1);
  const selectResults = (selected: boolean) => {
    const ids = new Set(filtered.map((item) => item.id));
    updateRows(
      rows.map((item) =>
        ids.has(item.id)
          ? { ...item, retail: { ...item.retail!, selected } }
          : item,
      ),
    );
  };
  const apply = (append: boolean) => {
    if (!prepared || prepared.error) return;
    try {
      const items = append ? [...rows, ...prepared.items] : prepared.items;
      const next = validateProject({
        ...project,
        lists: { shelf: [], sku: items },
      });
      // Numeric validation is independent of the selected template. Layout
      // problems remain visible and editable in the shared preview afterwards.
      onChange(next);
      setTable([]);
      setCsv("");
      setError("");
      setQuery("");
      setPage(append ? Math.floor(rows.length / 10) : 0);
    } catch (e) {
      setError(fail(e));
    }
  };
  const pagination = count > 1 && (
    <div className="wh-pagination">
      <button
        aria-label={t("page") + " −"}
        disabled={!current}
        onClick={() => setPage(current - 1)}
      >
        ←
      </button>
      <span>
        {current + 1} / {count}
      </span>
      <button
        aria-label={t("page") + " +"}
        disabled={current >= count - 1}
        onClick={() => setPage(current + 1)}
      >
        →
      </button>
    </div>
  );
  return (
    <section className="wh-panel rt-editor">
      <h2>03 · {t("products")}</h2>
      <div className="wh-fields">
        <label>
          {t("template")}
          <select
            data-testid="retail-template"
            value={options.template}
            onChange={(e) =>
              onChange({
                ...project,
                retail: {
                  ...options,
                  template: e.target.value as typeof options.template,
                },
              })
            }
          >
            {(["product", "shelf", "sale"] as const).map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("currency")}
          <input
            list="retail-currencies"
            maxLength={3}
            value={options.currency}
            onChange={(e) =>
              onChange({
                ...project,
                retail: { ...options, currency: e.target.value.toUpperCase() },
              })
            }
          />
          <datalist id="retail-currencies">
            {[
              "USD",
              "CAD",
              "EUR",
              "GBP",
              "CNY",
              "HKD",
              "TWD",
              "JPY",
              "KRW",
              "AUD",
              "INR",
              "BRL",
              "MXN",
              "CHF",
            ].map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
        </label>
      </div>
      <p className="hm-hint">{t("templateHelp")}</p>
      <p className="hm-hint">{t("currencyHelp")}</p>
      <details className="wh-import" open={table.length ? true : undefined}>
        <summary>{t("importTitle")}</summary>
        <p className="hm-hint">{t("importHelp")}</p>
        <div className="hm-actions">
          <button onClick={onPickFile}>{t("import")}</button>
          <button onClick={onSample}>{t("sample")}</button>
        </div>
        <label>
          {t("pasteTable")}
          <textarea
            rows={4}
            value={csv}
            placeholder={retailSample}
            onChange={(e) => {
              setCsv(e.target.value);
              setTable([]);
              setError("");
            }}
          />
        </label>
        <button onClick={() => stage(csv)}>{t("previewImport")}</button>
        {table.length > 0 && (
          <>
            <label className="hm-check">
              <input
                type="checkbox"
                checked={header}
                onChange={(e) => setHeader(e.target.checked)}
              />
              {t("header")}
            </label>
            <div className="wh-fields">
              <label>
                {t("decimal")}
                <select
                  value={decimal}
                  onChange={(e) => setDecimal(e.target.value as "." | ",")}
                >
                  <option value=".">{t("dot")}</option>
                  <option value=",">{t("comma")}</option>
                </select>
              </label>
              {retailColumns.map((key) => (
                <label key={key}>
                  {t(
                    key === "copies"
                      ? "quantity"
                      : key === "name"
                        ? "productName"
                        : key,
                  )}
                  <select
                    data-map={key}
                    value={map[key]}
                    onChange={(e) =>
                      setMap({ ...map, [key]: Number(e.target.value) })
                    }
                  >
                    <option value={-1}>{t("skip")}</option>
                    {Array.from(
                      { length: Math.max(...table.map((r) => r.length)) },
                      (_, i) => (
                        <option key={i} value={i}>
                          {t("column")} {i + 1}
                          {header ? ` · ${table[0][i] || ""}` : ""}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ))}
            </div>
            <div className="wh-table-scroll">
              <table className="rt-import-preview">
                <thead>
                  <tr>
                    {["productName", "code", "price", "quantity"].map((key) => (
                      <th key={key}>{t(key as RetailKey)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prepared?.items.slice(0, 5).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.code}</td>
                      <td>{item.retail!.price}</td>
                      <td>{item.copies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {prepared?.error ? (
              <p className="wh-error" role="alert">
                {prepared.error}
              </p>
            ) : (
              <p className="hm-hint">
                {prepared?.items.length} {t("importCount")}
              </p>
            )}
            <p className="hm-hint">{t("replaceHelp")}</p>
            <div className="hm-actions">
              <button
                disabled={!prepared?.items.length || !!prepared.error}
                onClick={() => apply(true)}
              >
                {t("append")}
              </button>
              <button
                disabled={!prepared?.items.length || !!prepared.error}
                onClick={() => apply(false)}
              >
                {t("replace")}
              </button>
              <button
                onClick={() => {
                  setTable([]);
                  setError("");
                }}
              >
                {t("cancel")}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="wh-error" role="alert">
            {error}
          </p>
        )}
      </details>
      <label className="rt-search">
        {t("search")}
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="hm-actions rt-selection">
        <span>
          {rows.filter((item) => item.retail!.selected).length} / {rows.length}{" "}
          {t("selection")}
        </span>
        <button disabled={!filtered.length} onClick={() => selectResults(true)}>
          {t("selectShown")}
        </button>
        <button
          disabled={!filtered.length}
          onClick={() => selectResults(false)}
        >
          {t("deselectShown")}
        </button>
      </div>
      <p className="hm-hint">{t("selectionHelp")}</p>
      <p className="hm-hint">{t("priceHelp")}</p>
      {pagination}
      <div className="rt-products">
        {filtered.slice(current * 10, current * 10 + 10).map((item, index) => {
          const n = current * 10 + index + 1;
          const field = (
            key:
              | "name"
              | "code"
              | "price"
              | "originalPrice"
              | "unit"
              | "note"
              | "offer",
            max: number,
          ) => (
            <label key={key}>
              {t(key === "name" ? "productName" : key)}
              <input
                aria-label={`${t(key === "name" ? "productName" : key)} ${n}`}
                maxLength={max}
                inputMode={
                  key === "price" || key === "originalPrice"
                    ? "decimal"
                    : undefined
                }
                value={
                  key === "name" || key === "code"
                    ? item[key]
                    : item.retail![key]
                }
                onChange={(e) =>
                  key === "name" || key === "code"
                    ? edit(item.id, { [key]: e.target.value })
                    : edit(item.id, {}, { [key]: e.target.value })
                }
              />
            </label>
          );
          return (
            <article
              className="rt-item"
              key={item.id}
              data-selected={item.retail!.selected}
            >
              <div className="rt-item-heading">
                <label className="hm-check">
                  <input
                    type="checkbox"
                    checked={item.retail!.selected}
                    aria-label={`${t("select")} ${n}`}
                    onChange={(e) =>
                      edit(item.id, {}, { selected: e.target.checked })
                    }
                  />
                  {t("select")} · {n}
                </label>
                <button
                  className="rt-remove"
                  aria-label={`${t("remove")} ${item.name || item.code || n}`}
                  onClick={() =>
                    updateRows(rows.filter((r) => r.id !== item.id))
                  }
                >
                  ×
                </button>
              </div>
              <div className="wh-fields">
                {field("name", 120)}
                {field("price", 24)}
                {field("code", 160)}
                <label>
                  {t("quantity")}
                  <span data-field="retail-quantity">
                    <AdjustmentInput
                      integer
                      value={item.copies}
                      onChange={(copies) => edit(item.id, { copies })}
                    />
                  </span>
                </label>
              </div>
              <details className="rt-details">
                <summary>{t("details")}</summary>
                <div className="wh-fields">
                  {field("unit", 40)}
                  {field("originalPrice", 24)}
                  {field("note", 160)}
                  {field("offer", 80)}
                </div>
                <p className="hm-hint">{t("offerHelp")}</p>
              </details>
            </article>
          );
        })}
      </div>
      {!filtered.length && <p className="hm-hint">{t("emptyResults")}</p>}
      <button
        onClick={() => {
          if (rows.length >= 1000) {
            onNotice(t("limit"));
            return;
          }
          updateRows([...rows, retailItem()]);
          setQuery("");
          setPage(Math.floor(rows.length / 10));
        }}
      >
        {t("newProduct")}
      </button>
      {pagination}
    </section>
  );
}
