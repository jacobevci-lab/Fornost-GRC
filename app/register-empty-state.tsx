"use client";

import { registerExperience } from "./register-experience";
import "./register-empty-state.css";

export default function RegisterEmptyState({ module, lang, state, filtered, onClear, onRetry, onCreate }: {
  module: string; lang: "tr" | "en"; state: "loading" | "error" | "ready";
  filtered: boolean; onClear: () => void; onRetry: () => void; onCreate?: () => void;
}) {
  const tr = lang === "tr", copy = registerExperience(module, lang);
  const title = state === "loading" ? (tr ? "Kayıtlar yükleniyor…" : "Loading records…")
    : state === "error" ? (tr ? "Kayıtlar yüklenemedi" : "Records could not be loaded")
    : filtered ? (tr ? "Bu aramayla eşleşen kayıt yok" : "No records match this view")
    : onCreate ? copy.emptyTitle : (tr ? "Bu kapsamda kayıt yok" : "No records in this scope");
  const body = state === "loading" ? (tr ? "Sonuçlar hazır olduğunda bu alan güncellenecek." : "This view will update when the results are ready.")
    : state === "error" ? (tr ? "Liste doğrulanamadı. Arama ve filtreleriniz korundu; yeniden deneyin." : "The list could not be verified. Your search and filters are preserved; retry loading.")
    : filtered ? (tr ? "Arama veya filtreleri değiştirin. Görünümü sıfırlamak kayıtlarınızı ve kaydettiğiniz görünümleri silmez." : "Change your search or filters. Clearing them does not delete records or saved views.")
    : onCreate ? copy.emptyBody : (tr ? "Bu kapsamda görüntüleyebileceğiniz kayıt yok. Kapsamı kontrol edin veya kayıt sorumlusuyla iletişime geçin." : "There are no records available in this scope. Check the scope or contact the record owner.");
  return <section className="register-empty-state" data-state={state === "ready" ? filtered ? "filtered" : "empty" : state} aria-busy={state === "loading"}>
    <div role={state === "error" ? "alert" : "status"}><h3>{title}</h3><p>{body}</p></div>
    {state === "error" ? <button type="button" onClick={onRetry}>{tr ? "Yeniden yükle" : "Reload records"}</button>
      : state === "ready" && filtered ? <button type="button" onClick={onClear}>{tr ? "Arama ve filtreleri temizle" : "Clear search and filters"}</button>
      : state === "ready" && onCreate ? <button type="button" className="primary" onClick={onCreate}>{copy.create}</button> : null}
  </section>;
}
