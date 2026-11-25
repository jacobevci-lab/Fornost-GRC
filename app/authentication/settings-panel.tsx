"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { withBasePath } from "../base-path";
import {
  emptyLoginConfig,
  providerNames,
  ssoProviders,
  loginErrorText,
  type LoginConfig,
  type SsoConfig,
  type DirectoryConfig,
} from "./model";
import type { ProfileSummary } from "../identity-profile-panel";
import "./settings.css";
type Snapshot = {
  config: LoginConfig;
  revision: string;
  hasSsoSecret: boolean;
  hasBindPassword: boolean;
  bridgeReady: boolean;
  admins: { id: string; name: string; email: string }[];
};
type Draft = { config: LoginConfig; ssoSecret: string; bindPassword: string };
export default function AuthenticationSettings({
  lang,
  onSummary,
}: {
  lang: "tr" | "en";
  onSummary: (value: ProfileSummary) => void;
}) {
  const tr = lang === "tr",
    [tab, setTab] = useState<"sso" | "directory" | "policy">("sso"),
    [stored, setStored] = useState<Snapshot | null>(null),
    [draft, setDraft] = useState<Draft>({
      config: emptyLoginConfig(),
      ssoSecret: "",
      bindPassword: "",
    }),
    [initial, setInitial] = useState("");
  const [loading, setLoading] = useState(true),
    [readError, setReadError] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [discard, setDiscard] = useState(false);
  const sequence = useRef(0),
    operation = useRef(false),
    dirty = !!initial && JSON.stringify(draft) !== initial;
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    setReadError(false);
    onSummary({ status: "loading" });
    try {
      const response = await fetch(withBasePath("/api/auth/settings"), {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
        body = await response.json();
      if (
        !response.ok ||
        typeof body.revision !== "string" ||
        !body.config?.sso ||
        !body.config.directory ||
        !Array.isArray(body.config.policy?.breakGlassUserIds) ||
        !Array.isArray(body.admins)
      )
        throw Error("Invalid settings");
      if (sequence.current !== id) return;
      if (!body.revision) {
        body.config.sso.redirectUri ||=
          location.origin + withBasePath("/api/auth/callback");
        body.config.sso.acsUrl ||=
          location.origin + withBasePath("/api/auth/saml");
        body.config.sso.entityId ||= location.origin + withBasePath("/");
      }
      const next = { config: body.config, ssoSecret: "", bindPassword: "" };
      setStored(body);
      setDraft(next);
      setInitial(JSON.stringify(next));
      onSummary({
        status: body.revision ? "saved" : "empty",
        provider:
          body.config.sso.displayName ||
          providerNames[body.config.sso.provider as SsoConfig["provider"]],
      });
    } catch {
      if (sequence.current === id) {
        setReadError(true);
        onSummary({ status: "error" });
      }
    } finally {
      if (sequence.current === id) setLoading(false);
    }
  }, [onSummary]);
  useEffect(() => {
    let active = true;
    const guard = sequence;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      guard.current++;
    };
  }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const blocked = loading || readError || busy || discard;
  function sso<K extends keyof SsoConfig>(key: K, value: SsoConfig[K]) {
    setDraft((d) => ({
      ...d,
      config: { ...d.config, sso: { ...d.config.sso, [key]: value } },
    }));
    setMessage("");
  }
  function directory<K extends keyof DirectoryConfig>(
    key: K,
    value: DirectoryConfig[K],
  ) {
    setDraft((d) => ({
      ...d,
      config: {
        ...d.config,
        directory: { ...d.config.directory, [key]: value },
      },
    }));
    setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (blocked || operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withBasePath("/api/auth/settings"), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...draft, revision: stored?.revision || "" }),
          signal: AbortSignal.timeout(15000),
        }),
        body = await response.json();
      if (!response.ok || body.ok !== true) {
        setMessage(loginErrorText(body.code, lang));
        if (response.status === 409) setReadError(true);
        return;
      }
      await load();
      setMessage(
        tr
          ? "Giriş yöntemleri ve erişim politikası kaydedildi."
          : "Sign-in methods and access policy saved.",
      );
    } catch {
      setReadError(true);
      setMessage(
        tr
          ? "Kaydetme sonucu doğrulanamadı. Yeniden göndermeden önce ayarları yenileyin."
          : "The save result could not be verified. Reload settings before resubmitting.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function test() {
    if (
      blocked ||
      dirty ||
      !stored?.revision ||
      tab === "policy" ||
      operation.current
    )
      return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withBasePath("/api/auth/settings"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: tab, revision: stored.revision }),
          signal: AbortSignal.timeout(15000),
        }),
        body = await response.json();
      if (!response.ok || body.ok !== true) {
        setMessage(loginErrorText(body.code, lang));
        if (response.status === 409) setReadError(true);
        return;
      }
      setMessage(
        `${tr ? "Bağlantı kontrolü geçti" : "Connection check passed"} · ${body.latencyMs} ms. ${tab === "directory" ? (tr ? "TLS, servis bind ve Base DN doğrulandı; kullanıcı girişi ayrıca test edilmelidir." : "TLS, service bind and Base DN verified; test a user sign-in separately.") : tr ? "Sağlayıcı yapılandırması doğrulandı; kullanıcı oturumu henüz doğrulanmadı." : "Provider configuration verified; user sign-in is not yet verified."}`,
      );
    } catch {
      setMessage(loginErrorText("provider_unavailable", lang));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function field(
    key: keyof SsoConfig,
    trLabel: string,
    enLabel: string,
    type = "text",
  ) {
    return (
      <label key={key}>
        {tr ? trLabel : enLabel}
        <input
          type={type}
          autoComplete="off"
          maxLength={2048}
          value={String(draft.config.sso[key])}
          onChange={(e) => sso(key, e.target.value)}
        />
      </label>
    );
  }
  function dirField(
    key: keyof DirectoryConfig,
    trLabel: string,
    enLabel: string,
  ) {
    return (
      <label key={key}>
        {tr ? trLabel : enLabel}
        <input
          autoComplete="off"
          maxLength={2048}
          value={String(draft.config.directory[key])}
          onChange={(e) => directory(key, e.target.value)}
        />
      </label>
    );
  }
  return (
    <section className="iad-profile iad-surface enterprise-auth-settings">
      <header className="iad-profile-header">
        <div>
          <h3>
            {tr ? "Kurumsal giriş yöntemleri" : "Enterprise sign-in methods"}
          </h3>
          <p>
            {tr
              ? "Mevcut kullanıcı, rol ve iştirak izinleri tüm giriş yöntemlerinde uygulanır."
              : "Existing account, role and entity permissions apply to every sign-in method."}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => (dirty ? setDiscard(true) : void load())}
        >
          {tr ? "Ayarları yenile" : "Reload settings"}
        </button>
      </header>
      <div
        className="iad-tabs"
        role="group"
        aria-label={
          tr ? "Kimlik doğrulama ayarları" : "Authentication settings"
        }
      >
        {(["sso", "directory", "policy"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={tab === value}
            disabled={busy}
            onClick={() => {
              setTab(value);
              setMessage("");
            }}
          >
            {value === "sso"
              ? "SSO · SAML / OIDC"
              : value === "directory"
                ? "Active Directory / LDAP"
                : tr
                  ? "Acil durum erişimi"
                  : "Emergency access"}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className="iad-notice">
          {message}
        </p>
      )}
      {readError && (
        <p role="alert" className="iad-notice error">
          {tr
            ? "Güncel ayarlar okunamadı. Kaydetmeden veya test etmeden önce yenileyin."
            : "Current settings could not be verified. Reload before saving or testing."}
        </p>
      )}
      {discard && (
        <div className="iad-notice">
          <p>
            {tr
              ? "Yenilemek kaydedilmemiş değişiklikleri bırakır."
              : "Reloading discards unsaved changes."}
          </p>
          <button type="button" onClick={() => setDiscard(false)}>
            {tr ? "Düzenlemeye dön" : "Keep editing"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDiscard(false);
              void load();
            }}
          >
            {tr ? "Değişiklikleri bırak ve yenile" : "Discard and reload"}
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">{tr ? "Ayarlar yükleniyor…" : "Loading settings…"}</p>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={blocked}>
            {tab === "sso" && (
              <>
                <label className="identity-toggle">
                  <input
                    type="checkbox"
                    checked={draft.config.sso.enabled}
                    onChange={(e) => sso("enabled", e.target.checked)}
                  />
                  {tr
                    ? "Kurumsal SSO girişini etkinleştir"
                    : "Enable enterprise SSO sign-in"}
                </label>
                <div className="iad-fields">
                  <label>
                    {tr ? "Sağlayıcı" : "Provider"}
                    <select
                      aria-label={tr ? "Sağlayıcı" : "Provider"}
                      value={draft.config.sso.provider}
                      onChange={(e) => {
                        const provider = e.target
                          .value as SsoConfig["provider"];
                        setDraft((d) => ({
                          ...d,
                          ssoSecret: "",
                          config: {
                            ...d.config,
                            sso: {
                              ...d.config.sso,
                              provider,
                              enabled: false,
                              issuer:
                                provider === "google-oidc"
                                  ? "https://accounts.google.com"
                                  : "",
                            },
                          },
                        }));
                      }}
                    >
                      {ssoProviders.map((p) => (
                        <option key={p} value={p}>
                          {providerNames[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {field(
                    "displayName",
                    "Girişte gösterilen sağlayıcı adı",
                    "Provider display name",
                  )}
                  {field(
                    "domains",
                    "Kurumsal alan adları (virgülle ayırın)",
                    "Corporate domains (comma separated)",
                  )}
                  {draft.config.sso.provider === "saml" ? (
                    <>
                      {field("entryPoint", "IdP SSO URL", "IdP SSO URL", "url")}
                      {field("idpIssuer", "IdP Entity ID", "IdP Entity ID")}
                      {field(
                        "entityId",
                        "Fornost SP Entity ID",
                        "Fornost SP Entity ID",
                      )}
                      {field(
                        "acsUrl",
                        "ACS dönüş URL",
                        "ACS callback URL",
                        "url",
                      )}
                      {field(
                        "bridgeUrl",
                        "Kimlik köprüsü HTTPS URL",
                        "Identity bridge HTTPS URL",
                        "url",
                      )}
                      <label className="identity-wide">
                        {tr
                          ? "IdP imzalama sertifikası (PEM)"
                          : "IdP signing certificate (PEM)"}
                        <textarea
                          rows={4}
                          maxLength={16000}
                          value={draft.config.sso.idpCertificate}
                          onChange={(e) =>
                            sso("idpCertificate", e.target.value)
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      {draft.config.sso.provider === "entra-oidc" && (
                        <label>
                          Tenant ID
                          <input
                            autoComplete="off"
                            value={draft.config.sso.tenantId}
                            onChange={(e) => {
                              const tenantId = e.target.value;
                              setDraft((d) => ({
                                ...d,
                                config: {
                                  ...d.config,
                                  sso: {
                                    ...d.config.sso,
                                    tenantId,
                                    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
                                  },
                                },
                              }));
                            }}
                          />
                        </label>
                      )}
                      {field(
                        "issuer",
                        "OIDC Issuer URL",
                        "OIDC issuer URL",
                        "url",
                      )}
                      {field(
                        "clientId",
                        "İstemci kimliği (Client ID)",
                        "Client ID",
                      )}
                      {field(
                        "redirectUri",
                        "Dönüş URL (Redirect URI)",
                        "Redirect URI",
                        "url",
                      )}
                      <label>
                        {tr ? "İstemci sırrı" : "Client secret"}
                        <input
                          type="password"
                          autoComplete="new-password"
                          maxLength={4096}
                          value={draft.ssoSecret}
                          placeholder={
                            stored?.hasSsoSecret
                              ? tr
                                ? "Kayıtlı sır korunur"
                                : "Saved secret retained"
                              : ""
                          }
                          onChange={(e) =>
                            setDraft({ ...draft, ssoSecret: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
                <p className="iad-footnote">
                  {draft.config.sso.provider === "saml"
                    ? tr
                      ? "SAML: imzalı yanıt ve assertion, kalıcı NameID ve e-posta özniteliği gerekir. Kurum içi kimlik köprüsünü yapılandırın."
                      : "SAML requires signed responses and assertions, a persistent NameID and email attribute. Configure the internal identity bridge."
                    : tr
                      ? "OIDC: authorization code + PKCE. Entra için tek kiracı; diğer sağlayıcılarda doğrulanmış e-posta gerekir."
                      : "OIDC: authorization code + PKCE. Entra requires a single tenant; other providers require a verified email."}
                </p>
              </>
            )}
            {tab === "directory" && (
              <>
                <label className="identity-toggle">
                  <input
                    type="checkbox"
                    checked={draft.config.directory.enabled}
                    onChange={(e) => directory("enabled", e.target.checked)}
                  />
                  {tr
                    ? "Dizin ile girişi etkinleştir"
                    : "Enable directory sign-in"}
                </label>
                <div className="iad-fields">
                  {dirField("host", "Sunucu host", "Server host")}
                  {dirField("port", "Port", "Port")}
                  <label>
                    {tr ? "Bağlantı güvenliği" : "Connection security"}
                    <select
                      aria-label={tr ? "Bağlantı güvenliği" : "Connection security"}
                      value={draft.config.directory.transport}
                      onChange={(e) => {
                        const transport = e.target
                          .value as DirectoryConfig["transport"];
                        setDraft((d) => ({
                          ...d,
                          config: {
                            ...d.config,
                            directory: {
                              ...d.config.directory,
                              transport,
                              port: transport === "ldaps" ? "636" : "389",
                            },
                          },
                        }));
                      }}
                    >
                      <option value="ldaps">LDAPS</option>
                      <option value="starttls">StartTLS</option>
                    </select>
                  </label>
                  {dirField("baseDn", "Base DN", "Base DN")}
                  {dirField("bindDn", "Bind DN", "Bind DN")}
                  <label>
                    {tr ? "Bind parolası" : "Bind password"}
                    <input
                      type="password"
                      autoComplete="new-password"
                      maxLength={4096}
                      value={draft.bindPassword}
                      placeholder={
                        stored?.hasBindPassword
                          ? tr
                            ? "Kayıtlı sır korunur"
                            : "Saved secret retained"
                          : ""
                      }
                      onChange={(e) =>
                        setDraft({ ...draft, bindPassword: e.target.value })
                      }
                    />
                  </label>
                  {dirField(
                    "bridgeUrl",
                    "Kimlik köprüsü HTTPS URL",
                    "Identity bridge HTTPS URL",
                  )}
                  <label>
                    {tr ? "Kullanıcı adı özniteliği" : "Username attribute"}
                    <select
                      value={draft.config.directory.usernameAttribute}
                      onChange={(e) =>
                        directory(
                          "usernameAttribute",
                          e.target
                            .value as DirectoryConfig["usernameAttribute"],
                        )
                      }
                    >
                      <option>sAMAccountName</option>
                      <option>uid</option>
                    </select>
                  </label>
                  <label>
                    {tr
                      ? "Kalıcı kimlik özniteliği"
                      : "Immutable identity attribute"}
                    <select
                      value={draft.config.directory.subjectAttribute}
                      onChange={(e) =>
                        directory(
                          "subjectAttribute",
                          e.target.value as DirectoryConfig["subjectAttribute"],
                        )
                      }
                    >
                      <option>objectGUID</option>
                      <option>entryUUID</option>
                    </select>
                  </label>
                </div>
                <p className="iad-footnote">
                  {tr
                    ? "Kullanıcının mail özniteliği, mevcut Fornost hesabıyla eşleşmelidir. TLS sertifikası doğrulaması zorunludur; parolalar saklanmaz."
                    : "The user’s mail attribute must match an existing Fornost account. TLS certificate verification is required; user passwords are never stored."}
                </p>
              </>
            )}
            {tab === "policy" && (
              <>
                <label className="identity-toggle">
                  <input
                    type="checkbox"
                    checked={draft.config.policy.requireSso}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        config: {
                          ...draft.config,
                          policy: {
                            ...draft.config.policy,
                            requireSso: e.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {tr
                    ? "Yerel giriş yerine kurumsal kimlik doğrulamasını zorunlu tut"
                    : "Require enterprise authentication instead of local sign-in"}
                </label>
                <p>
                  {tr
                    ? "Yerel parola yalnızca aşağıda seçilen aktif yönetici hesaplarında kabul edilir. LDAP etkinse ayrı bir kurumsal yöntem olarak kullanılabilir."
                    : "Local passwords are accepted only for the active administrator accounts selected below. If enabled, LDAP remains available as a separate enterprise method."}
                </p>
                <fieldset className="identity-emergency">
                  <legend>
                    {tr
                      ? "Yetkili Break-Glass hesapları"
                      : "Authorized Break-Glass accounts"}
                  </legend>
                  {stored?.admins.map((admin) => (
                    <label className="identity-toggle" key={admin.id}>
                      <input
                        type="checkbox"
                        checked={draft.config.policy.breakGlassUserIds.includes(
                          admin.id,
                        )}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            config: {
                              ...draft.config,
                              policy: {
                                ...draft.config.policy,
                                breakGlassUserIds: e.target.checked
                                  ? [
                                      ...draft.config.policy.breakGlassUserIds,
                                      admin.id,
                                    ]
                                  : draft.config.policy.breakGlassUserIds.filter(
                                      (id) => id !== admin.id,
                                    ),
                              },
                            },
                          })
                        }
                      />
                      <span>
                        {admin.name}
                        <small>{admin.email}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="iad-footnote">
                  {tr
                    ? "Zorunlu modu açarken kendi yönetici hesabınızı da seçin. İlk kayıttan sonra gerçek bir SSO oturumuyla doğrulayın."
                    : "Include your own administrator account when enabling required mode. Verify with a real SSO sign-in after saving."}
                </p>
              </>
            )}
            {(tab === "directory" ||
              (tab === "sso" && draft.config.sso.provider === "saml")) &&
              !stored?.bridgeReady && (
                <p className="iad-notice">
                  {tr
                    ? "Kurulumda FORNOST_IDENTITY_BRIDGE_TOKEN tanımlanmalı ve kurum içi kimlik köprüsü çalıştırılmalıdır."
                    : "Set FORNOST_IDENTITY_BRIDGE_TOKEN on this installation and run the internal identity bridge."}
                </p>
              )}
          </fieldset>
          <footer>
            <span>
              {dirty
                ? tr
                  ? "Kaydedilmemiş değişiklikler"
                  : "Unsaved changes"
                : tr
                  ? "Kayıtlı ayarlar"
                  : "Saved settings"}
            </span>
            <div>
              {tab !== "policy" && (
                <button
                  type="button"
                  disabled={blocked || dirty || !stored?.revision}
                  onClick={() => void test()}
                >
                  {tr ? "Bağlantıyı Test Et" : "Test Connection"}
                </button>
              )}
              <button
                className="primary"
                disabled={blocked || (!dirty && !!stored?.revision)}
              >
                {busy
                  ? tr
                    ? "İşleniyor…"
                    : "Working…"
                  : tr
                    ? "Giriş Ayarlarını Kaydet"
                    : "Save Sign-in Settings"}
              </button>
            </div>
          </footer>
        </form>
      )}
    </section>
  );
}
