import { getCatalogStatus } from "./framework-catalog-status";
export function FrameworkCatalogNotice({ framework, lang }: { framework: string; lang: "tr" | "en" }) {
  if (!framework) return null;
  const status = getCatalogStatus(framework);
  return <aside className="wide audit-picker-note" aria-label={lang === "tr" ? "Katalog kapsamı" : "Catalog coverage"}>
    <strong>{framework}</strong><p>{status[lang]}</p>
    {status.reviewed && <small>{lang === "tr" ? "Kaynak kontrolü: " : "Source reviewed: "}{status.reviewed} · </small>}
    {status.source && <a href={status.source} target="_blank" rel="noreferrer">{lang === "tr" ? "Resmî kaynak" : "Official source"}</a>}
    <p><small>{lang === "tr" ? "Mevcut denetimler oluşturuldukları katalogla korunur. Yeni katalog için yeni denetim oluşturun." : "Existing audits retain their original catalog. Create a new audit to use the updated catalog."}</small></p>
  </aside>;
}
