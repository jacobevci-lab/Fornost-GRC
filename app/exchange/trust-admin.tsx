"use client";
import { useState } from "react";
import { api, t, Field, State, useLoad, useAction, type Locale } from "./ui";
import { withBasePath } from "../base-path";
type Config = {
  tr: string;
  en: string;
  frameworks: string[];
  policies: string[];
  documents: string[];
};
type Opt = { id: string; title: string };
type View = {
  config: Config;
  options: { policies: Opt[]; documents: Opt[]; frameworks: string[] };
  requests: {
    id: string;
    version_id: string;
    name: string;
    company: string;
    email: string;
    status: string;
  }[];
};
function Settings({
  v,
  lang,
  reload,
}: {
  v: View;
  lang: Locale;
  reload: () => void;
}) {
  const [c, set] = useState({
      ...v.config,
      documents: v.config.documents.filter((id) =>
        v.options.documents.some((o) => o.id === id),
      ),
      policies: v.config.policies.filter((id) =>
        v.options.policies.some((o) => o.id === id),
      ),
      frameworks: v.config.frameworks.filter((id) =>
        v.options.frameworks.includes(id),
      ),
    }),
    a = useAction(lang),
    [link, url] = useState(""),
    l = (x: string, y: string) => t(lang, x, y);
  return (
    <section className="exchange">
      <header className="ex-head">
        <h2>{l("Trust Center Yönetimi", "Trust Center management")}</h2>
        <a
          href={withBasePath("/trust-center")}
          target="_blank"
          rel="noreferrer"
        >
          {l("Müşteri portalını aç", "Open customer portal")} ↗
        </a>
      </header>
      <form
        className="ex-form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.act(async () => {
            await api("exchange", { ...c, action: "publish" });
            a.say(l("Yayın güncellendi.", "Publication updated."));
          });
        }}
      >
        <div className="ex-grid">
          {(["tr", "en"] as const).map((k) => (
            <Field
              key={k}
              label={
                l("Güvenlik mimarisi", "Security architecture") +
                " · " +
                k.toUpperCase()
              }
            >
              <textarea
                maxLength={4000}
                value={c[k]}
                onChange={(e) => set({ ...c, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="ex-grid">
          {(["policies", "frameworks", "documents"] as const).map((k) => {
            const opts =
              k === "frameworks"
                ? v.options.frameworks.map((x) => ({ id: x, title: x }))
                : v.options[k];
            return (
              <fieldset key={k}>
                <legend>
                  {
                    {
                      policies: l(
                        "Yayındaki politikalar",
                        "Published policies",
                      ),
                      documents: l(
                        "Onaylı kısıtlı PDF belgeleri",
                        "Approved restricted PDFs",
                      ),
                      frameworks: l("Aktif çerçeveler", "Active frameworks"),
                    }[k]
                  }
                </legend>
                {!opts.length && (
                  <small>
                    {l("Uygun kayıt bulunmuyor.", "No eligible records.")}
                  </small>
                )}
                {opts.map((o) => (
                  <label key={o.id}>
                    <input
                      type="checkbox"
                      checked={c[k].includes(o.id)}
                      onChange={(e) =>
                        set({
                          ...c,
                          [k]: e.target.checked
                            ? [...c[k], o.id]
                            : c[k].filter((x) => x !== o.id),
                        })
                      }
                    />{" "}
                    {o.title}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
        <button className="ex-primary" disabled={a.busy}>
          {l("Seçimi yayımla", "Publish selection")}
        </button>
      </form>
      <h3>{l("Belge erişim talepleri", "Document access requests")}</h3>
      {!v.requests.length && <p>{l("Henüz talep yok.", "No requests yet.")}</p>}
      {v.requests.map((r) => (
        <article className="ex-card" key={r.id}>
          <strong>
            {r.name} · {r.company}
          </strong>
          <p>
            {r.email} ·{" "}
            {v.options.documents.find((d) => d.id === r.version_id)?.title ||
              "—"}{" "}
            ·{" "}
            {
              {
                pending: l("Bekliyor", "Pending"),
                approved: l("Onaylı", "Approved"),
                revoked: l("İptal", "Revoked"),
              }[r.status]
            }
          </p>
          <div className="ex-actions">
            {(r.status === "pending"
              ? ["approve", "revoke"]
              : r.status === "approved"
                ? ["revoke"]
                : []
            ).map((action) => (
              <button
                disabled={a.busy}
                key={action}
                onClick={() =>
                  a.act(async () => {
                    const res = await api<{ url?: string; sent?: boolean }>(
                      "exchange",
                      { action, id: r.id },
                    );
                    if (res.url) {
                      url(new URL(res.url, location.origin).href);
                      a.say(
                        l(
                          "E-posta gönderilemedi. Erişim bağlantısını alıcıyla paylaşın.",
                          "Email was not delivered. Share the access link with the recipient.",
                        ),
                      );
                    } else reload();
                  })
                }
              >
                {action === "approve"
                  ? l("Filigranlı erişimi onayla", "Approve watermarked access")
                  : l("Erişimi iptal et", "Revoke access")}
              </button>
            ))}
          </div>
        </article>
      ))}
      {link && (
        <button
          onClick={() =>
            a.act(async () => {
              await navigator.clipboard.writeText(link);
              url("");
              reload();
            })
          }
        >
          {l("Erişim bağlantısını kopyala", "Copy access link")}
        </button>
      )}
      <p role="status">{a.note}</p>
    </section>
  );
}
export default function TrustAdmin({ lang }: { lang: Locale }) {
  const { v, err, reload } = useLoad<View>("exchange?area=trust");
  return v ? (
    <Settings v={v} reload={reload} lang={lang} />
  ) : (
    <State error={err} lang={lang} />
  );
}
