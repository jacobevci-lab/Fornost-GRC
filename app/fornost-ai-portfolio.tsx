"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "./base-path";
type Row = {
  id: string;
  systemName: string;
  modelName: string;
  owner: string;
  status: string;
  riskTier: string;
  reviewDate: string;
  highRisks: number;
  criticalIncidents: number;
  openControls: number;
  totalControls: number;
  evidenceCurrent: number;
  redTeamCurrent: boolean;
  transparencyCurrent: boolean;
  assuranceCurrent: boolean;
  unresolvedExceptions: number;
  retirementInProgress: boolean;
  blockingFindings: number;
  releaseStatus: string;
  releaseScore: number;
  actions: string[];
  readiness: number;
};
export default function FornostAiPortfolio({ lang = "tr", onCreate }: { lang?: "tr" | "en"; onCreate?: () => void }) {
  const t = (tr: string, en: string) => lang === "tr" ? tr : en;
  const request = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<{
      generatedAt: string;
      portfolio: Row[];
      actions: {
        modelId: string;
        systemName: string;
        riskTier: string;
        owner: string;
        action: string;
      }[];
      summary: Record<string, number>;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [dossierModel, setDossierModel] = useState(""),
    [dossierDays, setDossierDays] = useState<30 | 90 | 365>(90),
    [packageBusy, setPackageBusy] = useState(false),
    [packageNotice, setPackageNotice] = useState(""),
    [sealedPackage, setSealedPackage] = useState<{id:string;digest:string;keyId:string}|null>(null),
    [sealedHistory, setSealedHistory] = useState<{id:string;manifest_sha256:string;signing_key_id:string;generated_by:string;generated_at:string;verification_count:number;last_verified_at:string|null}[]>([]);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setLoadError(false);
    try {
      const response = await fetch(withBasePath("/api/ai/portfolio"), { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.portfolio) || !Array.isArray(body?.actions) || !body?.summary) throw new Error("Portfolio unavailable");
      if (current === request.current) setData(body);
    } catch {
      if (current === request.current) { setData(null); setLoadError(true); }
    } finally { if (current === request.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const generation = request;
    const timer = setTimeout(() => void load(), 0);
    return () => { clearTimeout(timer); generation.current++; };
  }, [load]);
  const selectedDossierModel = dossierModel || data?.portfolio[0]?.id || "";
  const loadPackages=useCallback(async(modelId:string)=>{if(!modelId){setSealedHistory([]);return;}const response=await fetch(withBasePath(`/api/ai/dossier?modelId=${encodeURIComponent(modelId)}&list=1`),{cache:"no-store"}),body=await response.json().catch(()=>({}));if(response.ok)setSealedHistory(body.packages||[]);},[]);
  useEffect(()=>{const timer=setTimeout(()=>void loadPackages(selectedDossierModel),0);return()=>clearTimeout(timer);},[loadPackages,selectedDossierModel]);
  async function packageAction(action:"seal"|"verify", packageId?:string) {
    if (!selectedDossierModel || packageBusy) return;
    if (action === "seal" && !window.confirm(t("Bu işlem mevcut yönetişim görünümünü değişmez ve sunucu anahtarıyla mühürlü bir denetim paketi olarak kaydeder. Devam edilsin mi?", "This saves the current governance view as an immutable audit package sealed with the server key. Continue?"))) return;
    setPackageBusy(true);setPackageNotice("");
    const response=await fetch(withBasePath("/api/ai/dossier"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="seal"?{action,modelId:selectedDossierModel,days:dossierDays,confirmation:"DENETİM PAKETİNİ MÜHÜRLE"}:{action,packageId:packageId||sealedPackage?.id})}),
      body=await response.json().catch(()=>({}));
    if(response.ok&&action==="seal"){setSealedPackage({id:String(body.id),digest:String(body.digest),keyId:String(body.keyId)});setPackageNotice(t("Denetim paketi değişmez kayıt olarak mühürlendi.", "Audit package sealed as an immutable record."));await loadPackages(selectedDossierModel);}
    else if(response.ok)setPackageNotice(body.valid?t("Paket özeti ve sunucu mührü doğrulandı.", "Package digest and server seal verified."):t("Paket doğrulaması başarısız: içerik veya anahtar eşleşmiyor.", "Package verification failed: content or key does not match."));
    else setPackageNotice(String(body.error||t("Denetim paketi işlemi tamamlanamadı.", "The audit package operation could not be completed.")));
    setPackageBusy(false);
  }
  if (loading) return <div className="ai-portfolio empty" role="status">{t("AI portföyü hazırlanıyor…", "Loading AI portfolio…")}</div>;
  if (loadError || !data) return <div className="ai-portfolio empty" role="alert"><p>{t("AI portföyü yüklenemedi. Güvence değerlendirmesi kullanılamıyor.", "The AI portfolio could not be loaded. Assurance assessment is unavailable.")}</p><button onClick={() => void load()}>{t("Yeniden dene", "Retry")}</button></div>;
  return (
    <div className="ai-portfolio">
      <header>
        <div>
          <small>ENTERPRISE AI GOVERNANCE · EXECUTIVE ASSURANCE</small>
          <h3>{t("AI Yönetim Özeti", "AI Executive Overview")}</h3>
          <p>
            {t("Tüm AI sistemlerinin risk, kontrol, kanıt, red-team, şeffaflık, sürekli güvence ve yayın durumunu tek görünümde yönetin.", "Review risk, controls, evidence, red teaming, transparency, assurance and release status across all AI systems.")}
          </p>
        </div>
        <div>
          <button onClick={() => void load()}>{t("Yenile", "Refresh")}</button>
          <a href={withBasePath("/api/ai/portfolio?format=csv")}>{t("Yönetim CSV", "Executive CSV")}</a>
        </div>
      </header>
      <div className="stats">
        {[
          ["models", t("AI sistemi", "AI system")],
          ["approved", t("Onaylı envanter", "Approved inventory")],
          ["releaseReady", t("Release onaylı", "Release approved")],
          ["criticalAttention", t("Kritik dikkat", "Critical attention")],
          ["openActions", t("Açık aksiyon", "Open actions")],
          ["averageReadiness", t("Ort. hazırlık %", "Avg. readiness %")],
        ].map(([key, label]) => (
          <article key={key}>
            <b>{data?.summary[key] || 0}</b>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <section className="matrix">
        <header>
          <b>{t("Model güvence matrisi", "Model assurance matrix")}</b>
          <small>
            {data?.generatedAt
              ? new Date(data.generatedAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")
              : ""}
          </small>
        </header>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>{t("AI sistemi", "AI system")}</th>
                <th>Risk</th>
                <th>{t("Hazırlık", "Readiness")}</th>
                <th>{t("Risk/Olay", "Risk/Incident")}</th>
                <th>{t("Kontrol", "Control")}</th>
                <th>{t("Kanıt", "Evidence")}</th>
                <th>Red-team</th>
                <th>{t("Şeffaflık", "Transparency")}</th>
                <th>{t("Güvence", "Assurance")}</th>
                <th>{t("İstisna", "Exceptions")}</th>
                <th>{t("Emeklilik", "Retirement")}</th>
                <th>CAPA</th>
                <th>Release</th>
              </tr>
            </thead>
            <tbody>
              {data?.portfolio.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.systemName}</b>
                    <small>
                      {row.modelName} · {row.owner}
                    </small>
                  </td>
                  <td>
                    <span className={`risk ${row.riskTier.toLowerCase()}`}>
                      {row.riskTier}
                    </span>
                  </td>
                  <td>
                    <strong>{row.readiness}%</strong>
                  </td>
                  <td
                    className={
                      row.highRisks + row.criticalIncidents ? "bad" : "good"
                    }
                  >
                    {row.highRisks} / {row.criticalIncidents}
                  </td>
                  <td className={row.openControls ? "bad" : "good"}>
                    {row.totalControls - row.openControls}/{row.totalControls}
                  </td>
                  <td className={row.evidenceCurrent ? "good" : "bad"}>
                    {row.evidenceCurrent || "—"}
                  </td>
                  <td className={row.redTeamCurrent ? "good" : "bad"}>
                    {row.redTeamCurrent ? t("Hazır", "Ready") : t("Eksik", "Missing")}
                  </td>
                  <td className={row.transparencyCurrent ? "good" : "bad"}>
                    {row.transparencyCurrent ? t("Hazır", "Ready") : t("Eksik", "Missing")}
                  </td>
                  <td className={row.assuranceCurrent ? "good" : "bad"}>
                    {row.assuranceCurrent ? t("Hazır", "Ready") : t("Eksik", "Missing")}
                  </td>
                  <td className={row.unresolvedExceptions ? "bad" : "good"}>{row.unresolvedExceptions || t("Temiz", "Clear")}</td>
                  <td className={row.retirementInProgress ? "bad" : "good"}>{row.retirementInProgress ? t("Devam ediyor", "In progress") : t("Yok", "None")}</td>
                  <td className={row.blockingFindings ? "bad" : "good"}>{row.blockingFindings || t("Temiz", "Clear")}</td>
                  <td>
                    <span className={`release ${row.releaseStatus}`}>
                      {row.releaseStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="dossier">
        <header>
          <div>
            <b>{t("Denetim güvence dosyası", "Audit assurance dossier")}</b>
            <small>{t("Model kapsamı, kontrol durumu, kanıt hash manifesti ve son release kararını tek dosyada üretir.", "Generates model scope, control status, evidence hashes and the latest release decision in one dossier.")}</small>
          </div>
          <span>SHA-256 · HMAC</span>
        </header>
        <div className="dossier-controls">
          <label><span>{t("AI sistemi", "AI system")}</span><select value={selectedDossierModel} onChange={(event) => setDossierModel(event.target.value)}>{data?.portfolio.map((row) => <option key={row.id} value={row.id}>{row.systemName} · {row.modelName}</option>)}</select></label>
          <label><span>{t("Denetim dönemi", "Audit period")}</span><select value={dossierDays} onChange={(event) => setDossierDays(Number(event.target.value) as 30 | 90 | 365)}><option value={30}>{t("Son 30 gün", "Last 30 days")}</option><option value={90}>{t("Son 90 gün", "Last 90 days")}</option><option value={365}>{t("Son 365 gün", "Last 365 days")}</option></select></label>
          <div><button disabled={!selectedDossierModel||packageBusy} onClick={()=>void packageAction("seal")}>{t("Mühürlü paket oluştur", "Create sealed package")}</button><form className="dossier-download-form" method="get" action={withBasePath("/api/ai/dossier")}><input type="hidden" name="modelId" value={selectedDossierModel}/><input type="hidden" name="days" value={[30,90,365].includes(dossierDays)?dossierDays:30}/><button disabled={!selectedDossierModel} name="format" value="json">Hash JSON</button><button disabled={!selectedDossierModel} name="format" value="csv">{t("Kontrol CSV", "Control CSV")}</button></form></div>
        </div>
        {sealedPackage&&<div className="sealed-package"><div><b>{sealedPackage.id}</b><code>{sealedPackage.digest}</code><small>{t("Anahtar", "Key")}: {sealedPackage.keyId}</small></div><div><a href={withBasePath(`/api/ai/dossier?packageId=${encodeURIComponent(sealedPackage.id)}`)}>{t("Mühürlü JSON indir", "Download sealed JSON")}</a><button disabled={packageBusy} onClick={()=>void packageAction("verify")}>{t("Sunucuda doğrula", "Verify on server")}</button></div></div>}
        {!!sealedHistory.length&&<div className="sealed-history"><b>{t("Son mühürlü paketler", "Recent sealed packages")}</b>{sealedHistory.slice(0,5).map(item=><article key={item.id}><div><strong>{item.id}</strong><code>{item.manifest_sha256}</code><small>{new Date(item.generated_at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")} · {item.generated_by} · {item.verification_count} {t("doğrulama", "verifications")}</small></div><div><a href={withBasePath(`/api/ai/dossier?packageId=${encodeURIComponent(item.id)}`)}>{t("İndir", "Download")}</a><button disabled={packageBusy} onClick={()=>void packageAction("verify",item.id)}>{t("Doğrula", "Verify")}</button></div></article>)}</div>}
        {packageNotice&&<p className="package-notice">{packageNotice}</p>}
        <p>{t("Dosya yalnız yönetişim metadata’sı ve kayıt referanslarını içerir; prompt, model yanıtı, kanıt içeriği veya gizli değer içermez. HMAC mührü sunucu kaynaklı bütünlük ve özgünlük kontrolüdür, nitelikli elektronik imza değildir. Üretim ve doğrulama işlemleri audit izine yazılır.","The dossier contains governance metadata and record references only, with no prompts, model responses, evidence content or secrets. The server HMAC seal checks integrity and authenticity; it is not a qualified electronic signature. Generation and verification are recorded in the audit trail.")}</p>
      </section>
      <section className="queue">
        <header>
          <div>
            <b>{t("Öncelikli aksiyon kuyruğu", "Priority action queue")}</b>
            <small>{t("En fazla 100 güncel yönetim aksiyonu", "Up to 100 current management actions")}</small>
          </div>
          <span>{data?.actions.length || 0}</span>
        </header>
        {!data?.actions.length ? (
          <><p>{data.portfolio.length ? t("Açık yönetim aksiyonu yok.", "No open management actions.") : t("Henüz AI sistemi yok. AI Envanteri çalışma alanından ilk sistemi ekleyin.", "No AI systems yet. Add the first system from the AI Inventory workspace.")}</p>
          {!data.portfolio.length && onCreate && <button type="button" className="primary" onClick={onCreate}>{t("İlk AI sistemini ekle", "Add your first AI system")}</button>}</>
        ) : (
          data.actions.map((item, index) => (
            <article key={`${item.modelId}-${item.action}-${index}`}>
              <span>{item.riskTier}</span>
              <div>
                <b>{item.action}</b>
                <small>
                  {item.systemName} · {item.modelId}
                </small>
              </div>
              <em>{item.owner}</em>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
