import { getCatalogStatus } from "./framework-catalog-status";
export type CatalogSnapshot = {revision:string;count:number;imported:boolean;source:string};
export function FrameworkCatalogNotice({ framework, lang, snapshot }: { framework: string; lang: "tr" | "en"; snapshot?:CatalogSnapshot|null }) {
  if (!framework) return null;
  const status = snapshot?.imported ? {tr:"Kurum tarafından yüklenen katalog. İçerik ve kapsamı yükleyen kuruluş tarafından doğrulanır; Fornost tarafından tamlık onayı verilmez.",en:"Organization-imported catalog. Content and coverage are verified by the importing organization, not certified complete by Fornost.",source:snapshot.source,reviewed:undefined} : getCatalogStatus(framework);
  return <aside className="wide audit-picker-note" aria-label={lang === "tr" ? "Katalog kapsamı" : "Catalog coverage"}>
    <strong>{framework}</strong>
    {snapshot && <p>{snapshot.count} {lang === "tr" ? "başlangıç maddesi · Katalog sürümü:" : "initial requirements · Catalog revision:"} {snapshot.revision}</p>}<p>{status[lang]}</p>
    {status.reviewed && <small>{lang === "tr" ? "Kaynak kontrolü: " : "Source reviewed: "}{status.reviewed} · </small>}
    {status.source && <a href={status.source} target="_blank" rel="noreferrer">{lang === "tr" ? "Resmî kaynak" : "Official source"}</a>}
    <p><small>{lang === "tr" ? "Mevcut denetimler oluşturuldukları katalogla korunur. Yeni katalog için yeni denetim oluşturun." : "Existing audits retain their original catalog. Create a new audit to use the updated catalog."}</small></p>
  </aside>;
}
