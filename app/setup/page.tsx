"use client";

import { FormEvent, useEffect, useState } from "react";
import { withBasePath } from "../base-path";

export default function SetupPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(withBasePath("/api/auth"), { cache: "no-store" })
      .then(async (response) => {
        const state = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && (!state.bootstrapRequired || state.authenticated)) {
          window.location.replace(withBasePath("/") || "/");
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(withBasePath("/api/auth"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "authorize_bootstrap", token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Kurulum kodu doğrulanamadı.");
        return;
      }
      window.location.replace(withBasePath("/") || "/");
    } catch {
      setError("Kimlik servisine ulaşılamadı.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <div className="auth-mark">F</div>
          <small>FORNOST GRC · SECURE SETUP</small>
          <h1>İlk kurulum doğrulanıyor</h1>
          <p>Kurulum durumu güvenli biçimde kontrol ediliyor.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={authorize}>
        <div className="auth-mark">F</div>
        <small>FORNOST GRC · SECURE SETUP</small>
        <h1>İlk Kurulum Yetkilendirmesi</h1>
        <p>
          İlk yönetici hesabını oluşturmadan önce sunucu üzerindeki kurulum
          kodunu doğrulayın. Bu adım, ağa ilk erişen kişinin yönetici hesabını
          ele geçirmesini engeller.
        </p>
        <div className="setup-progress" aria-label="İlk kurulum adımları">
          <span className="active"><b>1</b> Doğrulama</span>
          <span><b>2</b> Yönetici</span>
          <span><b>3</b> Ayarlar</span>
        </div>
        <label>
          Kurulum Kodu
          <input
            name="setupToken"
            type="password"
            required
            minLength={32}
            maxLength={512}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <em>
          On-prem kurulumda sunucuda <code>sudo bash scripts/linux/setup-token.sh</code>
          {" "}komutunu çalıştırarak kodu görüntüleyin.
        </em>
        {error && <div className="auth-error">{error}</div>}
        <button className="primary" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Doğrulanıyor…" : "Kurulumu Yetkilendir"}
        </button>
      </form>
    </main>
  );
}
