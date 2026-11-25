"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { withBasePath } from "../base-path";
import { discoverSso, loginErrorText, type LoginOptions } from "./model";
import { type LocalAuthInput } from "../local-auth-submit";
import "./login.css";
type Snapshot = {
  loadFailed?: boolean;
  bootstrapRequired?: boolean;
  demoAccount?: { email: string } | null;
  loginOptions?: LoginOptions;
};
export default function EnterpriseLogin({
  state,
  error,
  busy,
  onAuthenticate,
  onCheck,
  onRetry,
}: {
  state: Snapshot | null;
  error: string;
  busy: boolean;
  onAuthenticate: (input: LocalAuthInput) => Promise<void>;
  onCheck: () => void;
  onRetry: () => void;
}) {
  const [lang, setLang] = useState<"tr" | "en">("tr"),
    [theme, setTheme] = useState<"light" | "dark">("light"),
    [ready, setReady] = useState(false),
    [showLogin, setShowLogin] = useState(false);
  const [method, setMethod] = useState<"local" | "directory">("local"),
    [email, setEmail] = useState(""),
    [ssoBusy, setSsoBusy] = useState(false),
    [ssoError, setSsoError] = useState("");
  const pending = useRef(false),
    controller = useRef<AbortController | null>(null),
    form = useRef<HTMLFormElement | null>(null);
  const tr = lang === "tr",
    setup = !!state?.bootstrapRequired && !showLogin,
    disabled = busy || ssoBusy,
    options = state?.loginOptions;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        setLang(
          localStorage.getItem("fornost-grc-language") === "en" ? "en" : "tr",
        );
        setTheme(
          localStorage.getItem("fornost-grc-theme-v5") === "dark"
            ? "dark"
            : "light",
        );
      } catch {}
      setReady(true);
      const code = new URLSearchParams(location.search).get("auth_error");
      if (code) {
        setSsoError(code);
        const url = new URL(location.href);
        url.searchParams.delete("auth_error");
        history.replaceState(null, "", url);
      }
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("fornost-grc-language", lang);
      localStorage.setItem("fornost-grc-theme-v5", theme);
    } catch {}
  }, [lang, theme, ready]);
  const errorCode = error.includes("|") ? error.split("|")[0] : "";
  const message = ssoError
    ? loginErrorText(ssoError, lang)
    : errorCode
      ? loginErrorText(errorCode, lang)
      : error
        ? tr
          ? error
          : error.includes("zaman aşım")
            ? "The request timed out. Check your session before trying again."
            : loginErrorText("session_check", lang)
        : "";
  async function sso() {
    if (disabled || pending.current || !options?.sso.enabled) return;
    pending.current = true;
    setSsoBusy(true);
    setSsoError("");
    const c = new AbortController();
    controller.current = c;
    const timer = setTimeout(() => c.abort(), 15000);
    try {
      const response = await fetch(withBasePath("/api/auth/start"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          signal: c.signal,
        }),
        body = await response.json();
      if (!response.ok || body.ok !== true || typeof body.url !== "string") {
        setSsoError(body.code || "provider_unavailable");
        return;
      }
      const url = new URL(body.url);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        throw Error("Invalid redirect");
      window.location.assign(url.href);
    } catch {
      if (controller.current === c) setSsoError("provider_unavailable");
    } finally {
      clearTimeout(timer);
      pending.current = false;
      setSsoBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setSsoError("");
    const data = new FormData(e.currentTarget);
    await onAuthenticate({
      action: setup
        ? "bootstrap"
        : method === "directory"
          ? "directory_login"
          : "login",
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      username: String(data.get("username") || ""),
      password: String(data.get("password") || ""),
    });
  }
  const tools = (
    <div className="login-preferences">
      <div
        className="language-switch"
        role="group"
        aria-label={tr ? "Dil" : "Language"}
      >
        {(["tr", "en"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={lang === value}
            onClick={() => setLang(value)}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="theme-toggle"
        aria-label={
          tr
            ? theme === "dark"
              ? "Açık tema"
              : "Koyu tema"
            : theme === "dark"
              ? "Light mode"
              : "Dark mode"
        }
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      </button>
    </div>
  );
  return (
    <main className="auth-screen enterprise-login">
      {tools}
      {!state || state.loadFailed ? (
        <section className="auth-card">
          <div className="auth-mark" aria-hidden="true">
            F
          </div>
          <small>FORNOST GRC</small>
          <h1>
            {state?.loadFailed
              ? tr
                ? "Oturum hazırlanamadı"
                : "Session unavailable"
              : tr
                ? "Güvenli oturum hazırlanıyor…"
                : "Preparing your secure session…"}
          </h1>
          {state?.loadFailed && (
            <>
              <p role="alert">
                {tr
                  ? "Kimlik servisi geçici olarak yanıt veremedi. Tekrar deneyin."
                  : "The identity service is temporarily unavailable. Try again."}
              </p>
              <button type="button" className="primary" onClick={onRetry}>
                {tr ? "Tekrar Dene" : "Retry"}
              </button>
            </>
          )}
        </section>
      ) : (
        <form
          ref={form}
          className="auth-card"
          onSubmit={submit}
          aria-busy={disabled}
        >
          <header className="login-brand">
            <div className="auth-mark" aria-hidden="true">
              F
            </div>
            <div>
              <small>FORNOST GRC</small>
              <h1>
                {setup
                  ? tr
                    ? "Fornost GRC İlk Kurulum"
                    : "Fornost GRC Initial Setup"
                  : tr
                    ? "Kurumsal Çalışma Alanı Girişi"
                    : "Enterprise Workspace Sign-in"}
              </h1>
            </div>
          </header>
          {setup ? (
            <p>
              {tr
                ? "Kurulumu tamamlamak için ilk yönetici hesabını oluşturun."
                : "Create the first administrator account to complete setup."}
            </p>
          ) : (
            <>
              <div className="login-sso">
                <button
                  className="primary"
                  type="button"
                  disabled={disabled || !options?.sso.enabled}
                  onClick={() => void sso()}
                >
                  {ssoBusy
                    ? tr
                      ? "Yönlendiriliyor…"
                      : "Redirecting…"
                    : tr
                      ? "Kurumsal SSO ile Devam Et"
                      : "Continue with Enterprise SSO"}
                </button>
                <small>
                  {options?.sso.enabled
                    ? `${options.sso.name} · ${options.sso.protocol}`
                    : tr
                      ? "Kurumsal SSO henüz yapılandırılmadı."
                      : "Enterprise SSO has not been configured yet."}
                </small>
              </div>
              <div className="login-divider">
                <span>
                  {tr ? "Diğer giriş yöntemleri" : "Other sign-in methods"}
                </span>
              </div>
              <div
                className="login-methods"
                role="tablist"
                aria-label={tr ? "Giriş yöntemi" : "Sign-in method"}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      e.key,
                    ) &&
                    !disabled
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? "directory"
                        : e.key === "End"
                          ? "local"
                          : method === "local"
                            ? "directory"
                            : "local";
                    setMethod(next);
                    document.getElementById(`login-tab-${next}`)?.focus();
                  }
                }}
              >
                {(["directory", "local"] as const).map((value) => (
                  <button
                    id={`login-tab-${value}`}
                    type="button"
                    role="tab"
                    key={value}
                    aria-selected={method === value}
                    aria-controls="login-fields"
                    tabIndex={method === value ? 0 : -1}
                    disabled={disabled}
                    onClick={() => {
                      setMethod(value);
                      setSsoError("");
                      const input =
                        form.current?.querySelector<HTMLInputElement>(
                          "input[name=password]",
                        );
                      if (input) input.value = "";
                    }}
                  >
                    {value === "directory"
                      ? "Active Directory / LDAP"
                      : tr
                        ? "Yerel Hesap (Break-Glass)"
                        : "Local Account (Break-Glass)"}
                  </button>
                ))}
              </div>
            </>
          )}
          <div
            id="login-fields"
            role={setup ? undefined : "tabpanel"}
            aria-labelledby={setup ? undefined : `login-tab-${method}`}
            className="login-fields"
          >
            {setup && (
              <label>
                {tr ? "Ad Soyad" : "Full name"}
                <input
                  name="name"
                  autoComplete="name"
                  required
                  disabled={disabled}
                />
              </label>
            )}
            {!setup && method === "directory" ? (
              <>
                <p>
                  {tr
                    ? "Dizin kullanıcı adınızı (sAMAccountName veya UPN) ve AD parolanızı kullanın."
                    : "Use your directory username (sAMAccountName or UPN) and AD password."}
                </p>
                {!options?.directory.enabled && (
                  <p className="login-note">
                    {tr
                      ? "Active Directory / LDAP bağlantısı henüz etkinleştirilmedi. Yerel hesap veya etkin SSO yöntemini kullanın."
                      : "Active Directory / LDAP has not been enabled. Use a local account or an enabled SSO method."}
                  </p>
                )}
                <label>
                  {tr ? "Dizin kullanıcı adı" : "Directory username"}
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    maxLength={320}
                    disabled={disabled || !options?.directory.enabled}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  {tr ? "E-posta" : "Email"}
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={320}
                    disabled={disabled}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {!setup && options?.requireSso && (
                  <p className="login-note">
                    {tr
                      ? "Yalnızca yetkili acil durum (Break-Glass) yerel hesapları içindir."
                      : "For authorized emergency (Break-Glass) local accounts only."}
                  </p>
                )}
                {!setup && discoverSso(email, options) && (
                  <div className="login-discovery" role="status">
                    <span>
                      {tr
                        ? `${options?.sso.name} ile kurumsal giriş kullanabilirsiniz.`
                        : `You can use enterprise sign-in with ${options?.sso.name}.`}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void sso()}
                    >
                      {tr ? "SSO ile devam et" : "Continue with SSO"} →
                    </button>
                  </div>
                )}
              </>
            )}
            <label>
              {!setup && method === "directory"
                ? tr
                  ? "AD parolası"
                  : "AD password"
                : tr
                  ? "Parola"
                  : "Password"}
              <input
                key={setup ? "setup" : method}
                name="password"
                type="password"
                required
                minLength={setup ? 12 : 1}
                maxLength={setup ? 128 : 4096}
                autoComplete={setup ? "new-password" : "current-password"}
                disabled={
                  disabled ||
                  (!setup &&
                    method === "directory" &&
                    !options?.directory.enabled)
                }
              />
            </label>
            {setup && (
              <small>
                {tr
                  ? "En az 12 karakter; büyük/küçük harf, sayı ve özel karakter."
                  : "At least 12 characters, including upper/lowercase letters, a number and a symbol."}
              </small>
            )}
          </div>
          {message && (
            <div className="auth-error" role="alert">
              {message}
              <button
                type="button"
                className="ghost"
                disabled={disabled}
                onClick={onCheck}
              >
                {tr ? "Oturum Durumunu Kontrol Et" : "Check Session Status"}
              </button>
            </div>
          )}
          <button
            className={setup ? "primary" : "login-submit"}
            disabled={
              disabled ||
              (!setup && method === "directory" && !options?.directory.enabled)
            }
          >
            {busy
              ? tr
                ? "İşlem sürüyor…"
                : "Signing in…"
              : setup
                ? tr
                  ? "Yönetici Hesabını Oluştur"
                  : "Create Administrator Account"
                : tr
                  ? "Giriş Yap"
                  : "Sign In"}
          </button>
          {state.demoAccount && !options?.requireSso && (
            <div className="demo-login-box">
              <b>{tr ? "Demo Editor Hesabı" : "Demo Editor Account"}</b>
              <span>{state.demoAccount.email}</span>
              <button
                type="button"
                className="ghost"
                disabled={disabled}
                onClick={() => void onAuthenticate({ action: "demo_login" })}
              >
                {tr ? "Demo Hesapla Giriş Yap" : "Sign In with Demo Account"}
              </button>
            </div>
          )}
          {state.bootstrapRequired && (
            <button
              type="button"
              className="auth-switch"
              disabled={disabled}
              onClick={() => setShowLogin(!showLogin)}
            >
              {showLogin
                ? tr
                  ? "İlk yönetici oluşturma ekranına dön"
                  : "Return to initial setup"
                : tr
                  ? "Mevcut yerel hesapla giriş yap"
                  : "Sign in with an existing local account"}
            </button>
          )}
          <footer className="login-trust">
            <a href={withBasePath("/trust-center")}>
              {tr
                ? "Kurumsal Güvenlik ve Uyum Merkezi (Trust Center)"
                : "Corporate Security and Compliance Center (Trust Center)"}{" "}
              →
            </a>
          </footer>
        </form>
      )}
    </main>
  );
}
