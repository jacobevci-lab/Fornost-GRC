"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "./base-path";
import { aiDisplayStatus, portfolioGaps, sortPortfolioWork, systemReviewOverdue, type PortfolioSystem as Row } from "./ai-portfolio-work";
export default function FornostAiPortfolio({ lang = "tr", onCreate, onOpenModel, viewerEmail = "" }: { lang?: "tr" | "en"; onCreate?: () => void; onOpenModel?: (id: string) => void; viewerEmail?: string }) {
  const t = (tr: string, en: string) => lang === "tr" ? tr : en;
  const request = useRef(0);
  const [reports, setReports] = useState(false), [query, setQuery] = useState(""),
    [scope, setScope] = useState("all"), [filter, setFilter] = useState("attention"),
    [selectedId, setSelectedId] = useState(""), [page, setPage] = useState(0);
  const [historyError, setHistoryError] = useState(false), [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef(0);
  const detailRef = useRef<HTMLElement>(null);

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
  const loadPackages = useCallback(async (modelId: string) => {
    const ticket = ++historyRequest.current;
    setSealedHistory([]); setHistoryError(false); setHistoryLoading(true);
    try {
      const response = await fetch(withBasePath(`/api/ai/dossier?modelId=${encodeURIComponent(modelId)}&list=1`), {cache:"no-store", signal: AbortSignal.timeout(10000)});
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.packages)) throw new Error("Unavailable");
      if (ticket === historyRequest.current) setSealedHistory(body.packages);
    } catch { if (ticket === historyRequest.current) setHistoryError(true); }
    finally { if (ticket === historyRequest.current) setHistoryLoading(false); }
  }, []);
  useEffect(() => {
    if (!reports || !selectedDossierModel || loading || loadError) return;
    const generation = historyRequest;
    const timer = setTimeout(() => { setSealedPackage(null); setPackageNotice(""); void loadPackages(selectedDossierModel); }, 0);
    return () => { clearTimeout(timer); generation.current++; };
  }, [reports, loadPackages, selectedDossierModel, loading, loadError]);
  async function packageAction(action:"seal"|"verify", packageId?:string) {
    if (!selectedDossierModel || packageBusy) return;
    if (action === "seal" && !window.confirm(t("Bu işlem mevcut yönetişim görünümünü değişmez ve sunucu anahtarıyla mühürlü bir denetim paketi olarak kaydeder. Devam edilsin mi?", "This saves the current governance view as an immutable audit package sealed with the server key. Continue?"))) return;
    setPackageBusy(true);setPackageNotice("");
    try {
    const response=await fetch(withBasePath("/api/ai/dossier"),{method:"POST",signal:AbortSignal.timeout(15000),headers:{"content-type":"application/json"},body:JSON.stringify(action==="seal"?{action,modelId:selectedDossierModel,days:dossierDays,confirmation:"DENETİM PAKETİNİ MÜHÜRLE"}:{action,packageId:packageId||sealedPackage?.id})}),
      body=await response.json().catch(()=>({}));
    if(response.ok&&action==="seal"){setSealedPackage({id:String(body.id),digest:String(body.digest),keyId:String(body.keyId)});setPackageNotice(t("Denetim paketi değişmez kayıt olarak mühürlendi.", "Audit package sealed as an immutable record."));await loadPackages(selectedDossierModel);}
    else if(response.ok)setPackageNotice(body.valid?t("Paket özeti ve sunucu mührü doğrulandı.", "Package digest and server seal verified."):t("Paket doğrulaması başarısız: içerik veya anahtar eşleşmiyor.", "Package verification failed: content or key does not match."));
    else setPackageNotice(String(body.error||t("Denetim paketi işlemi tamamlanamadı.", "The audit package operation could not be completed.")));
    } catch { setPackageNotice(t("İşlem sonucu doğrulanamadı. Paket geçmişini yenileyip kontrol edin.", "The result could not be confirmed. Refresh package history before retrying.")); } finally { setPackageBusy(false); }
  }
  if (loading) return <div className="ai-portfolio empty" role="status">{t("AI portföyü hazırlanıyor…", "Loading AI portfolio…")}</div>;
  if (loadError || !data) return <div className="ai-portfolio empty" role="alert"><p>{t("AI portföyü yüklenemedi. Güvence değerlendirmesi kullanılamıyor.", "The AI portfolio could not be loaded. Assurance assessment is unavailable.")}</p><button onClick={() => void load()}>{t("Yeniden dene", "Retry")}</button></div>;
  const today = data.generatedAt.slice(0, 10);
  const all = data.portfolio;
  const gaps = (row: Row) => portfolioGaps(row, lang, today);
  const needle = query.trim().toLocaleLowerCase(lang);
  const filtered = sortPortfolioWork(all.filter(row =>
    (scope !== "mine" || (!!viewerEmail && row.owner.trim().toLowerCase() === viewerEmail.toLowerCase())) &&
    (filter === "all" || (filter === "overdue" ? systemReviewOverdue(row, today) : filter === "release" ? row.releaseStatus !== "approved" : gaps(row).length > 0)) &&
    (!needle || [row.systemName, row.modelName, row.owner, ...gaps(row)].join(" ").toLocaleLowerCase(lang).includes(needle))), today);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 10, currentPage * 10 + 10);
  const selected = visible.find(row => row.id === selectedId) || visible[0];
  const dateLabel = (date: string) => date ? new Date(date + "T12:00:00Z").toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB") : t("Belirlenmedi", "Not set");
  function chooseFilter(value: string) { setFilter(value); setQuery(""); setScope("all"); setPage(0); }
  return (
    <div className="ai-portfolio ai-decision-workspace">
      <header className="ai-decision-hero">
        <div><small>FORNOST · AI GOVERNANCE</small><h3>{reports ? t("AI Raporları", "AI Reports") : t("Karar Masası", "Decision Desk")}</h3>
        <p>{t("Öncelikli kararlar ve takip gerektiren AI sistemleri.", "Priority decisions and AI systems requiring follow-up.")}</p></div>
        <div><button className="primary" onClick={onCreate}>{t("+ AI sistemi", "+ AI system")}</button><button aria-pressed={reports} onClick={() => setReports(!reports)}>{reports ? t("İş listesine dön", "Back to worklist") : t("Raporlar", "Reports")}</button></div>
      </header>
      <div className="ai-decision-freshness"><small>{t("Son başarılı veri yenileme", "Last successful refresh")}: {new Date(data.generatedAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")}</small><button onClick={() => void load()}>{t("Yenile", "Refresh")}</button></div>
      {!all.length ? <section className="ai-decision-empty"><h4>{t("Aktif AI sistemi yok", "No active AI systems")}</h4><p>{t("Yeni bir sistemin kullanım amacını, sorumlusunu ve veri kapsamını kaydedin. Kullanımdan kaldırılan kayıtları AI Envanteri sekmesinde bulabilirsiniz.", "Record a new system’s purpose, owner and data scope. Retired records remain available in the AI Inventory tab.")}</p><button className="primary" onClick={onCreate}>{t("AI sistemi ekle", "Add AI system")}</button></section> : reports ? <>
      <a href={withBasePath("/api/ai/portfolio?format=csv")}>{t("Yönetim CSV", "Executive CSV")}</a>
      <section className="matrix">
        <header>
          <div><b>{t("Model güvence matrisi", "Model assurance matrix")}</b><small>{t("Hazırlık puanı bir uyum sertifikası veya yayın onayı değildir.", "Readiness is not a compliance certificate or release approval.")}</small></div>
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
                <th>{t("Yayın kararı", "Release decision")}</th>
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
                  <td><strong>{row.readiness}%</strong></td>
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
                    <span className={`release ${aiDisplayStatus(row.releaseStatus, lang)}`}>
                      {aiDisplayStatus(row.releaseStatus, lang)}
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
          <label><span>{t("AI sistemi", "AI system")}</span><select disabled={packageBusy} value={selectedDossierModel} onChange={(event) => {setDossierModel(event.target.value); setSealedPackage(null); setSealedHistory([]); setPackageNotice("");}}>{data?.portfolio.map((row) => <option key={row.id} value={row.id}>{row.systemName} · {row.modelName}</option>)}</select></label>
          <label><span>{t("Denetim dönemi", "Audit period")}</span><select value={dossierDays} onChange={(event) => setDossierDays(Number(event.target.value) as 30 | 90 | 365)}><option value={30}>{t("Son 30 gün", "Last 30 days")}</option><option value={90}>{t("Son 90 gün", "Last 90 days")}</option><option value={365}>{t("Son 365 gün", "Last 365 days")}</option></select></label>
          <div><button disabled={!selectedDossierModel||packageBusy} onClick={()=>void packageAction("seal")}>{t("Mühürlü paket oluştur", "Create sealed package")}</button><form className="dossier-download-form" method="get" action={withBasePath("/api/ai/dossier")}><input type="hidden" name="modelId" value={selectedDossierModel}/><input type="hidden" name="days" value={[30,90,365].includes(dossierDays)?dossierDays:30}/><button disabled={!selectedDossierModel} name="format" value="json">Hash JSON</button><button disabled={!selectedDossierModel} name="format" value="csv">{t("Kontrol CSV", "Control CSV")}</button></form></div>
        </div>
        {historyLoading && <p role="status">{t("Paket geçmişi yükleniyor…", "Loading package history…")}</p>}
        {historyError && <div role="alert"><p>{t("Paket geçmişi yüklenemedi.", "Package history could not be loaded.")}</p><button onClick={() => void loadPackages(selectedDossierModel)}>{t("Geçmişi yenile", "Refresh history")}</button></div>}
        {sealedPackage&&<div className="sealed-package"><div><b>{sealedPackage.id}</b><code>{sealedPackage.digest}</code><small>{t("Anahtar", "Key")}: {sealedPackage.keyId}</small></div><div><a href={withBasePath(`/api/ai/dossier?packageId=${encodeURIComponent(sealedPackage.id)}`)}>{t("Mühürlü JSON indir", "Download sealed JSON")}</a><button disabled={packageBusy} onClick={()=>void packageAction("verify")}>{t("Sunucuda doğrula", "Verify on server")}</button></div></div>}
        {!!sealedHistory.length&&<div className="sealed-history"><b>{t("Son mühürlü paketler", "Recent sealed packages")}</b>{sealedHistory.slice(0,5).map(item=><article key={item.id}><div><strong>{item.id}</strong><code>{item.manifest_sha256}</code><small>{new Date(item.generated_at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")} · {item.generated_by} · {item.verification_count} {t("doğrulama", "verifications")}</small></div><div><a href={withBasePath(`/api/ai/dossier?packageId=${encodeURIComponent(item.id)}`)}>{t("İndir", "Download")}</a><button disabled={packageBusy} onClick={()=>void packageAction("verify",item.id)}>{t("Doğrula", "Verify")}</button></div></article>)}</div>}
        {packageNotice&&<p className="package-notice">{packageNotice}</p>}
        <p>{t("Dosya yalnız yönetişim metadata’sı ve kayıt referanslarını içerir; prompt, model yanıtı, kanıt içeriği veya gizli değer içermez. HMAC mührü sunucu kaynaklı bütünlük ve özgünlük kontrolüdür, nitelikli elektronik imza değildir. Üretim ve doğrulama işlemleri audit izine yazılır.","The dossier contains governance metadata and record references only, with no prompts, model responses, evidence content or secrets. The server HMAC seal checks integrity and authenticity; it is not a qualified electronic signature. Generation and verification are recorded in the audit trail.")}</p>
      </section>
      </> : <>
        <div className="ai-decision-metrics">
          {([
            ["attention", all.filter(row => gaps(row).length > 0).length, t("Takip gereken sistem", "Systems needing attention")],
            ["overdue", all.filter(row => systemReviewOverdue(row, today)).length, t("İncelemesi geciken", "Overdue system reviews")],
            ["release", all.filter(row => row.releaseStatus !== "approved").length, t("Yayın onayı olmayan", "Without release approval")],
          ] as const).map(([key, count, label]) => <button key={key} aria-pressed={filter === key} onClick={() => chooseFilter(key)}><strong>{count}</strong><span>{label}</span></button>)}
        </div>
        {all.length >= 500 && <p role="status">{t("İlk 500 aktif sistem gösteriliyor. Emekli sistemler ve tüm kayıtlar için envanteri açın.", "Showing the first 500 active systems. Open inventory for retired systems and other records.")}</p>}
        <div className="ai-decision-grid">
          <section className="ai-decision-list" aria-label={t("Öncelikli aksiyon kuyruğu", "Priority action queue")}>
            <div className="ai-decision-filters">
              <label><span>{t("Kapsam", "Scope")}</span><select value={scope} onChange={e => {setScope(e.target.value); setPage(0);}}><option value="all">{t("Tüm sistemler", "All systems")}</option><option value="mine">{t("Sorumlusu olduklarım", "Owned by me")}</option></select></label>
              <label><span>{t("Sistem veya iş ara", "Search systems or work")}</span><input type="search" value={query} onChange={e => {setQuery(e.target.value); setPage(0);}} placeholder={t("Ad, model, sorumlu veya eksik…", "Name, model, owner or gap…")}/></label>
              <button onClick={() => chooseFilter("all")}>{t("Filtreleri temizle", "Clear filters")}</button>
            </div>
            <small>{filtered.length} / {all.length} {t("sistem · Tarihler sistem incelemesine aittir.", "systems · Dates refer to system reviews.")}</small>
            {!filtered.length ? <div className="ai-decision-empty"><h4>{t("Bu görünümde sistem yok", "No systems in this view")}</h4><p>{t("Arama ve kapsam filtrelerini temizleyerek diğer sistemleri görebilirsiniz.", "Clear search and scope filters to see other systems.")}</p></div> : <div className="ai-decision-table"><table><thead><tr><th scope="col">{t("AI sistemi", "AI system")}</th><th scope="col">{t("Sonraki iş", "Next step")}</th><th scope="col">{t("Sistem sorumlusu", "System owner")}</th><th scope="col">{t("İnceleme tarihi", "Review date")}</th></tr></thead><tbody>{visible.map(row => <tr key={row.id} className={selected?.id === row.id ? "selected" : ""}>
              <th scope="row"><button aria-pressed={selected?.id === row.id} onClick={() => {setSelectedId(row.id); detailRef.current?.focus();}}>{row.systemName}</button><small>{row.modelName}</small></th>
              <td>{gaps(row)[0] || t("Açık aksiyon yok", "No open action")}</td><td>{row.owner || t("Atanmadı", "Unassigned")}</td><td>{dateLabel(row.reviewDate)}{systemReviewOverdue(row, today) && <small className="ai-work-overdue">{t("Gecikmiş", "Overdue")}</small>}</td>
            </tr>)}</tbody></table></div>}
            {pages > 1 && <nav className="ai-decision-pager" aria-label={t("İş listesi sayfaları", "Worklist pages")}><button disabled={currentPage === 0} onClick={() => setPage(currentPage-1)}>{t("Önceki", "Previous")}</button><span>{currentPage+1} / {pages}</span><button disabled={currentPage+1 === pages} onClick={() => setPage(currentPage+1)}>{t("Sonraki", "Next")}</button></nav>}
          </section>
          {selected && <aside ref={detailRef} tabIndex={-1} className="ai-decision-detail" aria-label={t("Seçili AI sistemi", "Selected AI system")}>
            <small>{t("SİSTEM DOSYASI", "SYSTEM FILE")}</small><h4>{selected.systemName}</h4>
            <dl><div><dt>{t("Kurum riski", "Internal risk")}</dt><dd>{aiDisplayStatus(selected.riskTier, lang)}</dd></div><div><dt>{t("Envanter durumu", "Inventory status")}</dt><dd>{aiDisplayStatus(selected.status, lang)}</dd></div><div><dt>{t("Yayın kararı", "Release decision")}</dt><dd>{aiDisplayStatus(selected.releaseStatus, lang)}</dd></div></dl>
            <h5>{t("Takip gereken konular", "Follow-up needed")}</h5>{gaps(selected).length ? <ul>{gaps(selected).map(gap => <li key={gap}>{gap}</li>)}</ul> : <p>{t("Bu özette açık aksiyon yok.", "No open actions in this summary.")}</p>}
            <p>{t("Envanter onayı, üretimde kullanım onayı değildir. Bağlı kayıtları ve karar geçmişini sistem dosyasında inceleyin.", "Inventory approval is separate from production approval. Review linked records and decision history in the system file.")}</p>
            <button className="primary" onClick={() => onOpenModel?.(selected.id)}>{t("Sistem dosyasını aç", "Open system file")}</button>
            <button onClick={() => {setDossierModel(selected.id); setReports(true);}}>{t("Denetim raporları", "Audit reports")}</button>
          </aside>}
        </div>
        <p className="ai-decision-note">{t("Özet, kayıtlı yönetişim verilerine dayanır; canlı model telemetrisi değildir. Sayaçlar arama ve kapsam filtrelerinden bağımsızdır.", "This summary uses recorded governance data, not live model telemetry. Counters are independent of search and scope filters.")}</p>
      </>}
    </div>
  );
}
