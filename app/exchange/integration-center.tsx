"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { api, Field, State, t, useAction, type Locale } from "./ui";
import IntegrationConnectionDesk from "../integration-connection-desk";
import {connectorNames,type ConnectorRegister,type ConnectorRow} from "../integrations/connector-register";
import { withBasePath } from "../base-path";
type Opt = { id: string; code: string; title: string; module?: string };
type MapRow = { metric: string; control: string; kri: string };
type Resource = {
  provider: string;
  resource: string;
  asset: string;
  risk: string;
};
type Config = {
  tenant: string;
  client: string;
  provider: string;
  mappings: MapRow[];
  resources: Resource[];
};
type Card = ConnectorRow & {
  kind: string;
  enabled?: number;
  hasSecret?: number;
  config: Config;
};
type View = Omit<ConnectorRegister,"cards"> & {
  cards: Card[];
  options: Opt[];
  kris: Opt[];
  tickets:{id:string;code:string;title:string;ticket:string}[];
  signals: { kind: string; observed_at: string; summary: string }[];
};
const names=connectorNames;
const metricNames: Record<string, [string, string]> = {
  mfaCoverage: ["MFA kayıt kapsamı (%)", "MFA registration coverage (%)"],
  pimGlobalAdmins: [
    "PIM ile etkin Global Admin",
    "PIM-activated Global Admins",
  ],
  highRiskSignIns: [
    "Yüksek riskli oturumlar (24 sa.)",
    "High-risk sign-ins (24h)",
  ],
};
const signalLabels: Record<string, [string, string]> = {
  provider: ["Sağlayıcı", "Provider"],
  category: ["Bulgu türü", "Finding category"],
  severity: ["Önem", "Severity"],
  resource: ["Kaynak", "Resource"],
  ticket: ["Bilet", "Ticket"],
  status: ["Durum", "Status"],
};
const signalValues: Record<string, string> = {
  encryption: "Şifreleme",
  "public-storage": "Herkese açık depolama",
  iam: "IAM",
  high: "Yüksek",
  critical: "Kritik",
  medium: "Orta",
  low: "Düşük",
  resolved: "Giderildi",
  done: "Tamamlandı",
  closed: "Kapalı",
};
type SimulationView={mode:string;mutated:boolean;effects:{metric?:string;value?:number;control?:string;kri?:string;finding?:string;from?:string;to?:string}[];result?:{summary?:Record<string,unknown>}};
function SimulationResult({value,kind,lang}:{value:SimulationView;kind:string;lang:Locale}){
 const l=(tr:string,en:string)=>t(lang,tr,en);
 return <section className="ex-simulation"><h4>{l('Simülasyon sonucu — canlı telemetri değildir','Simulation result — not live telemetry')}</h4><p>{l('Bu sonuç yalnızca önizlemedir. Kontrol/KRI değerleri ve CAPA durumu değişmedi; dış bildirim gönderilmedi.','Preview only. Control/KRI values and CAPA status are unchanged; no external notification was sent.')}</p>{value.effects.length>0?<ul>{value.effects.map((e,i)=><li key={i}>{e.finding?`${e.finding} → ${l('Doğrulamada · bağımsız insan onayı gerekir','In verification · independent human approval required')}`:`${metricNames[e.metric||'']?.[lang==='tr'?0:1]||e.metric}: ${e.value} → ${[e.control,e.kri].filter(Boolean).join(' · ')}`}</li>)}</ul>:<p>{kind==='chat'?l('Yapılandırılmış Slack/Teams bildirim örneği hazırlandı.','A structured Slack/Teams notification sample was prepared.'):l('Kaynak ve kayıt eşlemeleri doğrulandı.','Resource and record mappings were validated.')}</p>}</section>;
}
function Select({
  options,
  value,
  onChange,
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.code} · {o.title}
        </option>
      ))}
    </select>
  );
}
function Connector({
  card,
  view,
  lang,
  reload,
  onTicketConfigure,
}: {
  card: Card;
  view: View;
  lang: Locale;
  reload: () => void;
  onTicketConfigure:()=>void;
}) {
  const k = card.kind,
    [editing, edit] = useState(false),
    [c, config] = useState(card.config),
    [enabled, enable] = useState(!!card.enabled),
    [secret, setSecret] = useState(""),
    [hook, setHook] = useState(""),
    [simulation,setSimulation]=useState<SimulationView|null>(null),[finding,setFinding]=useState(""),
    a = useAction(lang),
    l = (x: string, y: string) => t(lang, x, y);
  const set = (key: keyof Config, value: unknown) =>
    config({ ...c, [key]: value });
  const save = async (rotate = false) => {
    const r = await api<{ hook: string | null }>("exchange", {
      action: "configure",
      kind: k,
      enabled,
      config: c,
      secret,
      rotate,
    });
    setHook(r.hook || "");
    setSecret("");
    a.say(l("Ayarlar kaydedildi.", "Settings saved."));
    reload();
  };
  return (
    <article className="ex-card">
      <div className="ex-head">
        <h3>{names[k][lang === "tr" ? 0 : 1]}</h3>
        <small>
          {enabled ? l("Etkin", "Enabled") : l("Kapalı", "Disabled")}
        </small>
      </div>
      <p>
        {
          {
            entra: l(
              "MFA, PIM ve riskli oturumların kontrol ve KRI eşlemesi.",
              "Map MFA, PIM and risky sign-ins to controls and KRIs.",
            ),
            cloud: l(
              "AWS, Azure ve GCP kaynaklarının varlık ve risk eşlemesi.",
              "Map AWS, Azure and GCP resources to assets and risks.",
            ),
            tickets: l(
              "CAPA bileti ve kanıta bağlı doğrulama geçişi.",
              "CAPA tickets and evidence-gated verification.",
            ),
            chat: l(
              "Beyan kampanyaları, CAPA terminleri, PBC ve Trust Center erişim talepleri.",
              "Attestation campaigns, CAPA deadlines, PBC and Trust Center access requests.",
            ),
          }[k]
        }
      </p>
      <div className="ex-actions">
        <button onClick={() => edit(!editing)} aria-expanded={editing}>
          {l("Yapılandır", "Configure")}
        </button>
        <button
          disabled={a.busy || !enabled}
          onClick={() =>
            a.act(async () => {
              const r = await api<{
                summary?: Record<string, number>;
                mode?: string;
              }>("exchange", { action: "test", kind: k });
              a.say(
                r.summary
                  ? Object.entries(r.summary)
                      .map(
                        ([m, v]) =>
                          metricNames[m][lang === "tr" ? 0 : 1] +
                          " " +
                          (v ?? "—"),
                      )
                      .join(" · ")
                  : r.mode === "cloud-probe"
                    ? l(
                        "Test sinyali varlık ve risk eşlemelerinden geçti.",
                        "The test signal passed the asset and risk mappings.",
                      )
                    : l("Test başarılı.", "Test succeeded."),
              );
              reload();
            })
          }
        >
          {l("Canlı bağlantıyı test et", "Test live connection")}
        </button>
        {["entra", "chat"].includes(k) && (
          <button
            disabled={a.busy || !enabled}
            onClick={() =>
              a.act(async () => {
                await api("exchange", { action: "sync", kind: k });
                a.say(l("Senkronizasyon tamamlandı.", "Sync completed."));
                reload();
              })
            }
          >
            {l("Senkronize et", "Sync now")}
          </button>
        )}
      </div>
      <div className="ex-actions">{k==='tickets'&&<Field label={l('Simülasyon için bağlı CAPA','Linked CAPA for simulation')}><select value={finding} onChange={e=>setFinding(e.target.value)}><option value="">—</option>{view.tickets.map(f=><option key={f.id} value={f.id}>{f.code} · {f.ticket}</option>)}</select></Field>}<button disabled={a.busy||!card.enabled||k==='tickets'&&!finding} onClick={()=>a.act(async()=>{setSimulation(await api<SimulationView>('exchange',{action:'simulate',kind:k,finding}));a.say(l('Simülasyon tamamlandı. Canlı kayıtlar değiştirilmedi ve bildirim gönderilmedi.','Simulation completed. No live records changed and no notification was sent.'));reload();})}>{l('Test Sinyali Simüle Et','Simulate test signal')}</button></div>
      {simulation&&<SimulationResult value={simulation} kind={k} lang={lang}/>}
      {editing && (
        <form
          className="ex-form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.act(() => save());
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => enable(e.target.checked)}
            />{" "}
            {l("Bağlayıcıyı etkinleştir", "Enable connector")}
          </label>
          {k !== "chat" && (
            <Field
              label={l(
                "Gelen webhook · Bearer + X-Event-ID",
                "Incoming webhook · Bearer + X-Event-ID",
              )}
            >
              <code>{withBasePath("/api/public-exchange/hook-" + k)}</code>
            </Field>
          )}
          {k === "entra" && (
            <>
              <Field label="Tenant ID">
                <input
                  value={c.tenant}
                  onChange={(e) => set("tenant", e.target.value)}
                />
              </Field>
              <Field label="Client ID">
                <input
                  value={c.client}
                  onChange={(e) => set("client", e.target.value)}
                />
              </Field>
              {Object.keys(metricNames).map((metric) => {
                const m = c.mappings.find((x) => x.metric === metric) || {
                  metric,
                  control: "",
                  kri: "",
                };
                const change = (key: string, v: string) => {
                  const row = { ...m, [key]: v };
                  set("mappings", [
                    ...c.mappings.filter((x) => x.metric !== metric),
                    ...(row.control || row.kri ? [row] : []),
                  ]);
                };
                return (
                  <fieldset key={metric}>
                    <legend>
                      {metricNames[metric][lang === "tr" ? 0 : 1]}
                    </legend>
                    <Field label={l("Kontrol", "Control")}>
                      <Select
                        value={m.control}
                        options={view.options.filter(
                          (x) => x.module === "Kontroller",
                        )}
                        onChange={(v) => change("control", v)}
                      />
                    </Field>
                    <Field label="KRI">
                      <Select
                        value={m.kri}
                        options={view.kris}
                        onChange={(v) => change("kri", v)}
                      />
                    </Field>
                  </fieldset>
                );
              })}
            </>
          )}
          {k === "cloud" && (
            <>
              {c.resources.map((r, i) => {
                const change = (key: string, v: string) =>
                  set(
                    "resources",
                    c.resources.map((x, j) =>
                      i === j ? { ...x, [key]: v } : x,
                    ),
                  );
                return (
                  <fieldset key={i}>
                    <legend>{l("Kaynak eşlemesi", "Resource mapping")}</legend>
                    <Field label={l("Sağlayıcı", "Provider")}>
                      <select
                        value={r.provider}
                        onChange={(e) => change("provider", e.target.value)}
                      >
                        {["AWS", "Azure", "GCP"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={l("Bulut kaynak kimliği", "Cloud resource ID")}
                    >
                      <input
                        required
                        value={r.resource}
                        onChange={(e) => change("resource", e.target.value)}
                      />
                    </Field>
                    <Field label={l("Varlık", "Asset")}>
                      <Select
                        value={r.asset}
                        options={view.options.filter(
                          (x) => x.module === "Varlık Envanteri",
                        )}
                        onChange={(v) => change("asset", v)}
                      />
                    </Field>
                    <Field label="Risk">
                      <Select
                        value={r.risk}
                        options={view.options.filter(
                          (x) => x.module === "Risk Assessment",
                        )}
                        onChange={(v) => change("risk", v)}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "resources",
                          c.resources.filter((_, j) => j !== i),
                        )
                      }
                    >
                      {l("Kaldır", "Remove")}
                    </button>
                  </fieldset>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  set("resources", [
                    ...c.resources,
                    { provider: "AWS", resource: "", asset: "", risk: "" },
                  ])
                }
              >
                {l("+ Kaynak eşle", "+ Map resource")}
              </button>
            </>
          )}
          {k === "tickets" && (
            <button type="button" onClick={onTicketConfigure}>{l("Bilet sağlayıcısını düzenle","Edit ticket provider")}</button>
          )}
          {k === "chat" && (
            <Field label={l("Bildirim kanalı", "Notification channel")}>
              <select
                value={c.provider}
                onChange={(e) => set("provider", e.target.value)}
              >
                <option value="">—</option>
                <option value="slack">Slack</option>
                <option value="teams">Microsoft Teams</option>
              </select>
            </Field>
          )}
          {["chat", "entra"].includes(k) && (
            <Field
              label={
                k === "chat"
                  ? "Webhook URL"
                  : l("İstemci sırrı", "Client secret")
              }
            >
              <input
                type="password"
                autoComplete="new-password"
                placeholder={card.hasSecret ? "••••••••" : ""}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </Field>
          )}
          <div className="ex-actions">
            <button className="ex-primary" disabled={a.busy}>
              {l("Kaydet", "Save")}
            </button>
            {k !== "chat" && card.enabled && (
              <button
                type="button"
                disabled={a.busy}
                onClick={() => a.act(() => save(true))}
              >
                {l("Webhook anahtarını yenile", "Rotate webhook token")}
              </button>
            )}
          </div>
        </form>
      )}
      {hook && (
        <Field
          label={l(
            "Webhook anahtarı · yalnızca bu kez gösterilir",
            "Webhook token · shown once",
          )}
        >
          <input readOnly value={hook} onFocus={(e) => e.target.select()} />
        </Field>
      )}
      <small role="status">{a.note}</small>
    </article>
  );
}
export default function IntegrationCenter({ lang }: { lang: Locale }) {
  const [v,setView]=useState<View>(),[err,setError]=useState<unknown>(),[ticketEdit,setTicketEdit]=useState(0);
  const controller=useRef<AbortController|null>(null);
  const reload=useCallback(async()=>{controller.current?.abort();const c=new AbortController();controller.current=c;try{const value=await api<View>('exchange?area=connectors',undefined,undefined,c.signal);if(!c.signal.aborted){setView(value);setError(undefined);}}catch(error){if(!c.signal.aborted)setError(error)}},[]);
  useEffect(()=>{const timer=setTimeout(()=>void reload(),0);return()=>{clearTimeout(timer);controller.current?.abort()}},[reload]);
  if (!v) return <State lang={lang} error={err} />;
  return (
    <section className="exchange">
      {!!err&&<p role="alert">{t(lang,"Bağlantı listesi yenilenemedi. Son okunan bilgiler gösteriliyor.","Could not refresh connections. Showing the last loaded information.")} <button onClick={()=>void reload()}>{t(lang,"Yeniden dene","Retry")}</button></p>}
      <h2>{t(lang, "Kurumsal bağlayıcılar", "Enterprise connectors")}</h2>
      <div className="ex-grid">
        {v.cards.map((card) => (
          <Connector
            key={card.kind}
            card={card}
            view={v}
            lang={lang}
            reload={reload}
            onTicketConfigure={()=>setTicketEdit(n=>n+1)}
          />
        ))}
      </div>
      <IntegrationConnectionDesk lang={lang} register={v} onChange={reload} editRequest={ticketEdit}/>
      {v.signals.length > 0 && (
        <details>
          <summary>{t(lang, "Alınan sinyaller", "Received signals")}</summary>
          {v.signals.map((s, i) => (
            <p key={i}>
              {names[s.kind]?.[lang === "tr" ? 0 : 1]} ·{" "}
              {new Date(s.observed_at).toLocaleString(lang)} ·{" "}
              {Object.entries(JSON.parse(s.summary))
                .map(
                  ([k, v]) =>
                    ((metricNames[k] || signalLabels[k])?.[
                      lang === "tr" ? 0 : 1
                    ] || k) +
                    " " +
                    (lang === "tr" ? (signalValues[String(v)] ?? v) : v),
                )
                .join(" · ")}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
