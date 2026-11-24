"use client";
import { useState, useEffect } from "react";
import { api, t, State, Field, useAction, useLoad, type Locale } from "./ui";
import { sections, boardLabels, type Board, type Section } from "./board-model";
import { withBasePath } from "../base-path";
export function BoardWizard({ lang }: { lang: Locale }) {
  const [open, set] = useState(false),
    [choice, select] = useState<Section[]>([...sections]),
    [language, setLang] = useState(lang),
    [title, name] = useState(""),
    [id, created] = useState(""),
    a = useAction(lang),
    l = (x: string, y: string) => t(lang, x, y);
  return (
    <section className="exchange ex-card">
      <div className="ex-head">
        <h2>{l("Yönetim kurulu raporları", "Board reporting")}</h2>
        <button
          className="ex-primary"
          onClick={() => {
            set(!open);
            created("");
          }}
        >
          {open
            ? l("Kapat", "Close")
            : l("Yönetim Kurulu Paketi Oluştur", "Create board package")}
        </button>
      </div>
      {open &&
        (!id ? (
          <form
            className="ex-form"
            onSubmit={(e) => {
              e.preventDefault();
              void a.act(async () => {
                const r = await api<{ id: string }>("exchange?area=board", {
                  title,
                  lang: language,
                  sections: choice,
                });
                created(r.id);
              });
            }}
          >
            <Field label={l("Rapor başlığı", "Report title")}>
              <input
                maxLength={140}
                value={title}
                onChange={(e) => name(e.target.value)}
              />
            </Field>
            <Field label={l("Rapor dili", "Report language")}>
              <select
                value={language}
                onChange={(e) => setLang(e.target.value as Locale)}
              >
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </Field>
            <fieldset>
              <legend>{l("Paket içeriği", "Package contents")}</legend>
              {sections.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={choice.includes(s)}
                    onChange={(e) =>
                      select(
                        e.target.checked
                          ? [...choice, s]
                          : choice.filter((x) => x !== s),
                      )
                    }
                  />{" "}
                  {boardLabels[s][lang === "tr" ? 0 : 1]}
                </label>
              ))}
            </fieldset>
            <button disabled={!choice.length || a.busy}>
              {l("Özeti oluştur", "Generate summary")}
            </button>
          </form>
        ) : (
          <div className="ex-actions">
            <a
              target="_blank"
              rel="noreferrer"
              href={withBasePath("/board-pack/" + id)}
            >
              {l("Yönetici özeti / PDF", "Executive summary / PDF")} ↗
            </a>
            <a
              target="_blank"
              rel="noreferrer"
              href={withBasePath("/board-pack/" + id + "?format=slides")}
            >
              {l("16:9 sunum ve dışa aktarım", "16:9 slides and export")} ↗
            </a>
          </div>
        ))}
      <small role="status">{a.note}</small>
    </section>
  );
}
const escape = (x: string) =>
  x.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function exportSlides(b: Board) {
  const markup =
    '<!doctype html><html lang="' +
    b.lang +
    '"><meta charset="utf-8"><title>' +
    escape(b.title) +
    "</title><style>*{box-sizing:border-box}body{margin:0;background:#10292c;color:#122b31;font:20px system-ui}section{position:relative;max-width:1500px;aspect-ratio:16/9;margin:2vw auto;background:#f7f6f1;border-top:12px solid #087773;padding:4vw;break-after:page}header,footer{color:#376669}h2{font-size:2em}li{padding:.6em;border-bottom:1px solid #bccccc}strong{float:right}@page{size:320mm 180mm;margin:0}@media print{section{margin:0;width:320mm;height:180mm;padding:15mm}}</style>" +
    b.sections
      .map(
        (s) =>
          "<section><header>Fornost GRC · " +
          escape(b.title) +
          "</header><h2>" +
          escape(s.title) +
          "</h2><ul>" +
          s.rows
            .map(
              ([k, v]) =>
                "<li>" + escape(k) + "<strong>" + escape(v) + "</strong></li>",
            )
            .join("") +
          "</ul><footer>" +
          escape(b.at) +
          "</footer></section>",
      )
      .join("") +
    "</html>";
  const url = URL.createObjectURL(
      new Blob([markup], { type: "text/html;charset=utf-8" }),
    ),
    el = document.createElement("a");
  el.href = url;
  el.download = "Fornost-board-slides.html";
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function downloadPdf(b: Board, id: string) {
  const [{ reportSnapshot }, { renderReportPdf }] = await Promise.all([
    import("../report-export"),
    import("../report-pdf"),
  ]);
  const metrics = b.sections.flatMap((section) =>
    section.rows.map(([label, value]) => ({
      label,
      value,
      note: section.title,
    })),
  );
  const snapshot = reportSnapshot(b.title, [], metrics, b.lang === "tr", {
    reportId: "BRD-" + id.slice(0, 8),
    generatedAt: b.at,
    composer: true,
    preparedBy: b.preparedBy || "Fornost GRC",
    sections: ["metrics"],
    scope: b.lang === "tr" ? "Konsolide kurum" : "Consolidated enterprise",
    classification: b.lang === "tr" ? "Kurum içi" : "Internal",
  });
  const url = URL.createObjectURL(
      await renderReportPdf(
        snapshot,
        undefined,
        b.lang === "tr"
          ? b.sections.length + " rapor bölümü"
          : b.sections.length + " report sections",
      ),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "Fornost-board.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function BoardPage({ id, slides }: { id: string; slides: boolean }) {
  const { v, err } = useLoad<Board>(
      "exchange?area=board&id=" + encodeURIComponent(id),
    ),
    action = useAction(v?.lang || "tr");
  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("fornost-grc-theme-v5") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (v) document.documentElement.lang = v.lang;
  }, [v]);
  if (!v) return <State lang="tr" error={err} />;
  const l = (x: string, y: string) => t(v.lang, x, y);
  return (
    <main
      className={"exchange ex-public ex-board" + (slides ? " ex-slides" : "")}
    >
      <header>
        <strong>Fornost GRC</strong>
        <h1>{v.title}</h1>
        <time>{new Date(v.at).toLocaleString(v.lang)}</time>
      </header>
      <div className="ex-actions ex-noprint">
        <button
          disabled={action.busy}
          onClick={() => action.act(() => downloadPdf(v, id))}
        >
          {l("Yönetici özeti PDF indir", "Download executive PDF")}
        </button>
        <small role="status">{action.note}</small>
        <button onClick={() => window.print()}>
          {l("Yazdır / PDF kaydet", "Print / Save PDF")}
        </button>
        <button onClick={() => exportSlides(v)}>
          {l("16:9 slaytları indir", "Download 16:9 slides")}
        </button>
      </div>
      {v.sections.map((s) => (
        <section className="ex-card" key={s.title}>
          <h2>{s.title}</h2>
          <dl>
            {s.rows.map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  );
}
