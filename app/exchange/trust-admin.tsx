"use client";
import { useState } from "react";
import { api, t, Field, State, useLoad, useAction, type Locale } from "./ui";
import { withBasePath } from "../base-path";
type Config = {
  titleTr:string;titleEn:string;ndaRequired:string[];
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
    status: string;reason:string;ndaRequired:boolean;acceptedAt:string|null;expiresAt:string|null;
  }[];
};
function Settings({
  v,
  lang,
  reload,link,url,
}: {
  v: View;
  lang: Locale;
  reload: () => void;link:string;url:(v:string)=>void;
}) {
  const [c, set] = useState({
      ...v.config,
      ndaRequired:v.config.ndaRequired.filter(id=>v.options.documents.some(o=>o.id===id)&&v.config.documents.includes(id)),
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
    l = (x: string, y: string) => t(lang, x, y);
  return (
    <section className="exchange">
      <header className="ex-head">
        <h2>{l("Trust Center Yönetimi", "Trust Center management")}</h2>
<button type="button" onClick={reload}>{l("Yenile","Refresh")}</button><a
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
        <div className="ex-grid">{(['titleTr','titleEn'] as const).map((key,i)=><Field key={key} label={l('Portal başlığı','Portal title')+' · '+(i?'EN':'TR')}><input maxLength={160} value={c[key]} onChange={e=>set({...c,[key]:e.target.value})}/></Field>)}</div>
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
                  <div key={o.id}><label>
                    <input
                      type="checkbox"
                      checked={c[k].includes(o.id)}
                      onChange={(e) =>
                        set({
                          ...c,
                          ...(k==='documents'?{ndaRequired:e.target.checked?[...c.ndaRequired,o.id]:c.ndaRequired.filter(x=>x!==o.id)}:{}),
                          [k]: e.target.checked
                            ? [...c[k], o.id]
                            : c[k].filter((x) => x !== o.id),
                        })
                      }
                    />{" "}
                    {o.title}
                  </label>{k==='documents'&&c.documents.includes(o.id)&&<label><input type="checkbox" checked={c.ndaRequired.includes(o.id)} onChange={e=>set({...c,ndaRequired:e.target.checked?[...c.ndaRequired,o.id]:c.ndaRequired.filter(x=>x!==o.id)})}/>{l('NDA onayı zorunlu','NDA acceptance required')}</label>}</div>
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
                rejected:l("Reddedildi","Rejected"),
              }[r.status]
            }
          </p>
          {r.reason&&<p className="ex-prose">{l('Talep nedeni','Request reason')}: {r.reason}</p>}<small>{r.ndaRequired?(r.acceptedAt?l('NDA kabul edildi','NDA accepted'):l('NDA kabulü eksik','NDA acceptance missing')):l('NDA zorunlu değil; yönetici onayı gerekli','NDA not required; administrator approval required')}{r.expiresAt?' · '+l('Geçerlilik','Valid until')+': '+new Date(r.expiresAt).toLocaleDateString():''}</small>
          <div className="ex-actions">
            {(r.status === "pending"
              ? ["approve", "reject"]
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
                    }
                    reload();
                  })
                }
              >
                {action === "approve"
                  ? l("Filigranlı erişimi onayla", "Approve watermarked access")
                  : action==='reject'?l("Reddet","Reject"):l("Erişimi iptal et", "Revoke access")}
              </button>
            ))}
          </div>
        </article>
      ))}
      {link && (<div className="ex-actions"><input aria-label={l("Erişim bağlantısı","Access link")} readOnly value={link}/>
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
        </button></div>
      )}
      <p role="status">{a.note}</p>
    </section>
  );
}
export default function TrustAdmin({ lang }: { lang: Locale }) {
  const { v, err, reload } = useLoad<View>("exchange?area=trust"),[link,url]=useState("");
  return v ? (
    <Settings v={v} reload={reload} lang={lang} link={link} url={url} />
  ) : (
    <State error={err} lang={lang} />
  );
}
