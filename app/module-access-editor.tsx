"use client";
import { ACCESS_MODULES, type ModuleAccess, type ModuleGrant } from "./module-access";
import "./module-access.css";

const english: Record<string, string> = { "Risk Assessment":"Risk Assessment", BIA:"BIA", "Varlık Envanteri":"Asset Inventory", Uyum:"Compliance", "Tedarikçiler":"Vendors", Kontroller:"Controls", "Kanıtlar":"Evidence Library", "Denetim Yönetimi":"Audit Management" };
export default function ModuleAccessEditor({ value, role, lang, onChange }: { value: ModuleAccess; role: string; lang: "tr" | "en"; onChange: (value: ModuleAccess) => void }) {
  const tr = lang === "tr";
  if (role === "Admin") return <small className="module-access-admin">{tr ? "Yönetici tüm modüllere erişir." : "Administrators can access all modules."}</small>;
  return <details className="module-access-editor">
    <summary>{tr ? "Modül erişimi" : "Module access"} · {value.mode === "full" ? (tr ? "Tüm çalışma alanı" : "Full workspace") : `${Object.keys(value.modules).length} ${tr ? "modül" : "modules"}`}</summary>
    <label><span>{tr ? "Erişim kapsamı" : "Access scope"}</span><select aria-label={tr ? "Erişim kapsamı" : "Access scope"} value={value.mode} onChange={event => onChange(event.target.value === "full" ? {mode:"full"} : {mode:"scoped",modules:{}})}><option value="full">{tr ? "Tüm çalışma alanı" : "Full workspace"}</option><option value="scoped">{tr ? "Seçili temel modüller" : "Selected core modules"}</option></select></label>
    {value.mode === "scoped" && <>
      <p>{tr ? "Yalnız seçilen modüllerdeki kayıtlara erişir. Ortak raporlar, gelişmiş iş akışları ve AI bilgi tabanı kapalıdır. Ask Fornost izinli kayıtlarla çalışır. Bir modül içindeki tüm kayıtlar görünür." : "Access is limited to records in the selected modules. Shared reports, advanced workflows and the AI knowledge base are unavailable. Ask Fornost uses permitted records. All records within a permitted module are visible."}</p>
      <div className="module-access-grid">{ACCESS_MODULES.map(module => <label key={module}><span>{tr ? module : english[module]}</span><select aria-label={`${tr ? "Erişim" : "Access"}: ${tr ? module : english[module]}`} value={value.modules[module] ? (role === "Viewer" ? "read" : value.modules[module]) : "none"} onChange={event => {const modules={...value.modules};if(event.target.value==="none")delete modules[module];else modules[module]=event.target.value as ModuleGrant;onChange({mode:"scoped",modules});}}><option value="none">{tr ? "Erişim yok" : "No access"}</option><option value="read">{tr ? "Okuma" : "Read"}</option>{role === "Editor" && <option value="write">{tr ? "Okuma ve düzenleme" : "Read and edit"}</option>}</select></label>)}</div>
      <small>{tr ? "Viewer rolü hiçbir modülde yazamaz. Silme yetkisi yalnız yöneticidedir." : "Viewers cannot write in any module. Deletion remains administrator-only."}</small>
    </>}
    <small>{tr ? "Kaydettiğinizde bu kullanıcının açık oturumları sonlandırılır." : "Saving an access change ends this user's active sessions."}</small>
  </details>;
}
