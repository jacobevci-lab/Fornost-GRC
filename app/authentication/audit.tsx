"use client";
import { useEffect, useState } from "react";
import { withBasePath } from "../base-path";
import "./settings.css";
type Row = {
  id: string;
  method: string;
  outcome: string;
  actor: string;
  reason: string;
  created_at: string;
};
const reasons: Record<string, [string, string]> = {
  authenticated: ["Oturum açıldı", "Signed in"],
  authorization_started: ["SSO başlatıldı", "SSO started"],
  invalid_credentials: ["Kimlik bilgileri reddedildi", "Credentials rejected"],
  provider_unavailable: ["Sağlayıcı kullanılamıyor", "Provider unavailable"],
  provider_disabled: ["Yöntem etkin değil", "Method disabled"],
  callback_invalid: [
    "Geçersiz veya süresi dolmuş SSO yanıtı",
    "Invalid or expired SSO response",
  ],
  account_unavailable: [
    "Çalışma alanı erişimi reddedildi",
    "Workspace access denied",
  ],
  rate_limited: ["Deneme sınırı aşıldı", "Attempt limit reached"],
  settings_updated: ["Giriş ayarları güncellendi", "Sign-in settings updated"],
  directory_bind_test: [
    "Dizin bağlantısı doğrulandı",
    "Directory connection verified",
  ],
  sso_configuration_test: [
    "SSO yapılandırması kontrol edildi",
    "SSO configuration checked",
  ],
  connection_test_failed: [
    "Bağlantı testi başarısız",
    "Connection test failed",
  ],
  demo_authenticated: ["Demo oturumu açıldı", "Demo signed in"],
  bootstrap_authenticated: [
    "İlk yönetici oluşturuldu",
    "Initial administrator created",
  ],
};
export default function AuthenticationAudit({ lang }: { lang: "tr" | "en" }) {
  const tr = lang === "tr",
    [rows, setRows] = useState<Row[] | null>(null),
    [error, setError] = useState(false),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    fetch(withBasePath(`/api/auth/events?offset=${offset}`), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (
          !response.ok ||
          !Array.isArray(body.rows) ||
          typeof body.more !== "boolean"
        )
          throw Error("Invalid events");
        if (active) {
          setRows(body.rows);
          setMore(body.more);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [offset, attempt]);
  return (
    <section className="authentication-audit">
      <header>
        <h3>
          {tr
            ? "Giriş Denemeleri ve Kimlik Doğrulama"
            : "Sign-in Attempts and Authentication"}
        </h3>
        <button
          type="button"
          onClick={() => {
            setRows(null);
            setError(false);
            setAttempt((x) => x + 1);
          }}
        >
          {tr ? "Yenile" : "Refresh"}
        </button>
      </header>
      {error ? (
        <p role="alert">
          {tr
            ? "Giriş kayıtları okunamadı. Yenileyerek tekrar deneyin."
            : "Sign-in records could not be loaded. Refresh to retry."}
        </p>
      ) : !rows ? (
        <p role="status">{tr ? "Kayıtlar yükleniyor…" : "Loading events…"}</p>
      ) : (
        <>
          <div className="audit-scroll">
            <table>
              <thead>
                <tr>
                  {(tr
                    ? [
                        "Zaman",
                        "Yöntem",
                        "Kullanıcı / Kimlik",
                        "Sonuç",
                        "Ayrıntı",
                      ]
                    : ["Time", "Method", "User / Identity", "Outcome", "Detail"]
                  ).map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Date(row.created_at).toLocaleString(
                        tr ? "tr-TR" : "en-GB",
                      )}
                    </td>
                    <td>
                      {row.method === "sso"
                        ? "SSO"
                        : row.method === "directory"
                          ? "AD / LDAP"
                          : row.method === "local"
                            ? tr
                              ? "Yerel / Break-Glass"
                              : "Local / Break-Glass"
                            : tr
                              ? "Yapılandırma"
                              : "Configuration"}
                    </td>
                    <td>
                      {row.actor === "anonymous"
                        ? tr
                          ? "Anonim"
                          : "Anonymous"
                        : row.actor}
                    </td>
                    <td>
                      {row.outcome === "success"
                        ? tr
                          ? "Başarılı"
                          : "Success"
                        : row.outcome === "started"
                          ? tr
                            ? "Başlatıldı"
                            : "Started"
                          : tr
                            ? "Başarısız"
                            : "Failed"}
                    </td>
                    <td>{reasons[row.reason]?.[tr ? 0 : 1] || row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p>{tr ? "Henüz giriş kaydı yok." : "No sign-in events yet."}</p>
          )}
          <footer>
            <button
              disabled={!offset}
              onClick={() => {
                setRows(null);
                setError(false);
                setOffset((x) => x - 100);
              }}
            >
              {tr ? "Önceki" : "Previous"}
            </button>
            <button
              disabled={!more}
              onClick={() => {
                setRows(null);
                setError(false);
                setOffset((x) => x + 100);
              }}
            >
              {tr ? "Sonraki" : "Next"}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
