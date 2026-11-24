"use client";
import {
  useSyncExternalStore,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { withBasePath } from "../base-path";
import {portalQuestions} from "./vendor-questionnaire";
import { questions } from "../third-party-risk/survey";
import { api, Field, State, t, useAction, useLoad, type Locale } from "./ui";
function Vendor({ lang, token }: { lang: Locale; token: string }) {
  const { v, err } = useLoad<{ name: string;scope:string }>("public-exchange/vendor", token),
    a = useAction(lang),
    [done, set] = useState(false);
  if (done)
    return (
      <p role="status">
        {t(
          lang,
          "Değerlendirme alındı ve bağımsız incelemeye gönderildi.",
          "Assessment received and submitted for independent review.",
        )}
      </p>
    );
  if (!v) return <State lang={lang} error={err} />;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    for (const [k, val] of Array.from(fd.entries()))
      if (val instanceof File && !val.size) fd.delete(k);
    void a.act(async () => {
      await api("public-exchange/vendor", fd, token);
      set(true);
    });
  }
  return (
    <>
      <h1>{v.name}</h1>
      <h2>
        {t(
          lang,
          "Tedarikçi güvenlik değerlendirmesi",
          "Supplier security assessment",
        )}
      </h2>
      <p className="ex-prose">{v.scope}</p>
      <form onSubmit={submit} className="ex-form">
        {Object.entries(questions).map(([key, q]) => (
          <Field key={key} label={q[lang === "tr" ? 0 : 1]}>
            <select required name={key} defaultValue="">
              <option value="">—</option>
              <option value="yes">{t(lang, "Evet", "Yes")}</option>
              <option value="no">{t(lang, "Hayır", "No")}</option>
            </select>
          </Field>
        ))}
        <fieldset><legend>{t(lang,'MFA, yedekleme ve veri işleme','MFA, backup and data processing')}</legend>{Object.entries(portalQuestions).map(([key,q])=><Field key={key} label={q[lang==='tr'?0:1]}><select required name={key} defaultValue=""><option value="">—</option><option value="yes">{t(lang,'Evet','Yes')}</option><option value="no">{t(lang,'Hayır','No')}</option></select></Field>)}<Field label={t(lang,'Veri işleme ve yedekleme ülkeleri','Data processing and backup countries')}><textarea required maxLength={2000} name="dataLocation"/></Field><Field label={t(lang,'Alt yükleniciler / 4. taraflar (yoksa belirtin)','Subprocessors / fourth parties (state if none)')}><textarea required maxLength={2000} name="subprocessors"/></Field></fieldset>
        <h3>{t(lang, "Destekleyici belgeler", "Supporting documents")}</h3>
        <p>
          {t(
            lang,
            "PDF yükleyebilirsiniz. Her belge bağımsız incelemeye alınır.",
            "Upload PDFs. Each document is submitted for independent review.",
          )}
        </p>
        {["SOC 2 Type II", "ISO 27001", "Pentest", "DPA"].map((k) => (
          <Field key={k} label={k}>
            <input type="file" accept="application/pdf,.pdf" name={k} />
          </Field>
        ))}
        <button className="ex-primary" disabled={a.busy}>
          {t(lang, "Değerlendirmeyi gönder", "Submit assessment")}
        </button>
        <p role="status">{a.note}</p>
      </form>
    </>
  );
}
type Trust = {
  tr: string;
  en: string;
  titleTr:string;titleEn:string;
  policies: { title: string; code:string; version: number; content: string }[];
  documents: { id: string; title: string;ndaRequired:boolean }[];
  frameworks: string[];
};
function TrustPage({ lang }: { lang: Locale }) {
  const { v, err } = useLoad<Trust>("public-exchange/trust"),
    a = useAction(lang),
    [doc, select] = useState(""),
    [grant, setGrant] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("access") || "",
    ),
    l = (x: string, y: string) => t(lang, x, y);
  useEffect(() => {
    const captureGrant = () => {
      const value = new URLSearchParams(location.hash.slice(1)).get("access");
      if (value) {
        setGrant(value);
        history.replaceState(history.state, "", location.pathname + location.search);
      }
    };
    captureGrant();
    window.addEventListener("hashchange", captureGrant);
    window.addEventListener("popstate", captureGrant);
    return () => {
      window.removeEventListener("hashchange", captureGrant);
      window.removeEventListener("popstate", captureGrant);
    };
  }, []);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void a.act(async () => {
      await api("public-exchange/trust", {
        document: doc,
        name: form.get("name"),
        company: form.get("company"),
        email: form.get("email"),
        accepted: form.get("accepted") === "on",
        reason:form.get("reason"),
      });
      select("");
      a.say(l("Erişim talebiniz alındı.", "Your access request was received."));
    });
  }
  return (
    <>
      <h1>{(lang==="tr"?v?.titleTr:v?.titleEn)||l("Müşteri Güven Merkezi", "Customer Trust Center")}</h1>
      {grant && (
        <button
          className="ex-primary"
          disabled={a.busy}
          onClick={() =>
            a.act(async () => {
              const r = await fetch(
                withBasePath("/api/public-exchange/download"),
                {
                  headers: { authorization: "Bearer " + grant },
                  cache: "no-store",
                },
              );
              if (!r.ok) throw new Error("link");
              const url = URL.createObjectURL(await r.blob()),
                el = document.createElement("a");
              el.href = url;
              el.download = "Fornost-restricted.pdf";
              el.click();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            })
          }
        >
          {l("Filigranlı PDF indir", "Download watermarked PDF")}
        </button>
      )}
      {!v ? (
        <State lang={lang} error={err} />
      ) : (
        <>
          {v[lang] && (
            <section>
              <h2>{l("Güvenlik mimarisi", "Security architecture")}</h2>
              <p className="ex-prose">{v[lang]}</p>
            </section>
          )}
          {!!v.frameworks.length && (
            <section>
              <h2>
                {l(
                  "İzlenen uyum çerçeveleri",
                  "Enrolled compliance frameworks",
                )}
              </h2>
              <p>{l('Bu rozetler izlenen çerçeveleri gösterir; sertifikasyon veya tam uyum beyanı değildir.','These badges identify enrolled frameworks; they do not certify full compliance.')}</p>
              <div className="ex-actions">
                {v.frameworks.map((x) => (
                  <span className="ex-tag" key={x}>
                    {x}
                  </span>
                ))}
              </div>
            </section>
          )}
          {!!v.policies.length && (
            <section>
              <h2>{l("Yayındaki politikalar", "Published policies")}</h2>
              {v.policies.map((p, i) => (
                <details key={i}>
                  <summary>
                    {p.code} · {p.title} · v{p.version}
                  </summary>
                  <p className="ex-prose">{p.content}</p>
                </details>
              ))}
            </section>
          )}
          {!!v.documents.length && (
            <section>
              <h2>{l("Kısıtlı belgeler", "Restricted documents")}</h2>
              {v.documents.map((d) => (
                <div className="ex-head" key={d.id}>
                  <strong>{d.title}</strong>
                  <button onClick={() => select(d.id)}>
                    {d.ndaRequired?l("NDA ve erişim talebi", "NDA & access request"):l("Erişim talebi","Access request")}
                  </button>
                </div>
              ))}
            </section>
          )}
          {!v.policies.length &&
            !v.documents.length &&
            !v.frameworks.length &&
            !v[lang] && (
              <p>
                {l(
                  "Henüz yayımlanmış güven içeriği bulunmuyor.",
                  "No trust materials have been published yet.",
                )}
              </p>
            )}
        </>
      )}
      {doc && (
        <form className="ex-form" onSubmit={submit}>
          <h3>{v?.documents.find((x) => x.id === doc)?.title}</h3>
          {[
            ["name", l("Ad soyad", "Full name")],
            ["company", l("Şirket", "Company")],
            ["email", l("Kurumsal e-posta", "Business email")],
          ].map(([name, label]) => (
            <Field key={name} label={label}>
              <input
                required
                name={name}
                type={name === "email" ? "email" : "text"}
              />
            </Field>
          ))}
          <Field label={l('Talep nedeni','Request reason')}><textarea name="reason" required minLength={10} maxLength={2000}/></Field>
          {v?.documents.find(x=>x.id===doc)?.ndaRequired&&<label>
            <input type="checkbox" required name="accepted" />{" "}
            {l(
              "Belgeyi gizli tutmayı, yalnızca şirketimin değerlendirmesinde kullanmayı ve üçüncü kişilerle paylaşmamayı kabul ediyorum.",
              "I agree to keep the document confidential, use it only for my company’s evaluation and refrain from sharing it with third parties.",
            )}
          </label>}
          <div className="ex-actions">
            <button className="ex-primary" disabled={a.busy}>
              {l("Talebi gönder", "Submit request")}
            </button>
            <button type="button" onClick={() => select("")}>
              {l("Vazgeç", "Cancel")}
            </button>
          </div>
        </form>
      )}
      <p role="status">{a.note}</p>
    </>
  );
}
type ShellProps = { render: (lang: Locale) => ReactNode };
const subscribeToHydration = () => () => {};
export function PublicShell(props: ShellProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  return hydrated ? (
    <PortalContent {...props} />
  ) : (
    <main className="exchange ex-public" aria-busy="true">
      <strong>Fornost GRC</strong>
    </main>
  );
}
function PortalContent({ render }: ShellProps) {
  const [lang, set] = useState<Locale>(() =>
    localStorage.getItem("fornost-public-lang") === "en" ? "en" : "tr",
  );
  const [dark, theme] = useState(() =>
    localStorage.getItem("fornost-public-theme")
      ? localStorage.getItem("fornost-public-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [lang, dark]);
  return (
    <main className="exchange ex-public">
      <header className="ex-head">
        <strong>Fornost GRC</strong>
        <div className="ex-actions">
          <button
            onClick={() => {
              const v = lang === "tr" ? "en" : "tr";
              set(v);
              localStorage.setItem("fornost-public-lang", v);
            }}
          >
            {lang === "tr" ? "EN" : "TR"}
          </button>
          <button
            onClick={() => {
              theme(!dark);
              localStorage.setItem(
                "fornost-public-theme",
                dark ? "light" : "dark",
              );
            }}
          >
            {dark
              ? t(lang, "Açık tema", "Light mode")
              : t(lang, "Koyu tema", "Dark mode")}
          </button>
        </div>
      </header>
      {render(lang)}
    </main>
  );
}
export default function ExternalPage({ token }: { token?: string }) {
  return (
    <PublicShell
      render={(lang) =>
        token ? <Vendor lang={lang} token={token} /> : <TrustPage lang={lang} />
      }
    />
  );
}
