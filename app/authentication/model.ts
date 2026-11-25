export const ssoProviders = [
  "entra-oidc",
  "okta-oidc",
  "google-oidc",
  "generic-oidc",
  "saml",
] as const;
export type SsoProvider = (typeof ssoProviders)[number];
export type SignInMethod = "sso" | "directory" | "local";
export type SsoConfig = {
  enabled: boolean;
  provider: SsoProvider;
  displayName: string;
  domains: string;
  issuer: string;
  tenantId: string;
  clientId: string;
  redirectUri: string;
  bridgeUrl: string;
  entryPoint: string;
  idpIssuer: string;
  idpCertificate: string;
  entityId: string;
  acsUrl: string;
};
export type DirectoryConfig = {
  enabled: boolean;
  host: string;
  port: string;
  transport: "ldaps" | "starttls";
  baseDn: string;
  bindDn: string;
  bridgeUrl: string;
  usernameAttribute: "sAMAccountName" | "uid";
  subjectAttribute: "objectGUID" | "entryUUID";
};
export type LoginPolicy = { requireSso: boolean; breakGlassUserIds: string[] };
export type LoginConfig = {
  sso: SsoConfig;
  directory: DirectoryConfig;
  policy: LoginPolicy;
};
export type LoginOptions = {
  sso: {
    enabled: boolean;
    name: string;
    domains: string[];
    protocol: "OIDC" | "SAML 2.0";
  };
  directory: { enabled: boolean };
  requireSso: boolean;
};
export const providerNames: Record<SsoProvider, string> = {
  "entra-oidc": "Microsoft Entra ID",
  "okta-oidc": "Okta",
  "google-oidc": "Google Workspace",
  "generic-oidc": "OpenID Connect",
  saml: "SAML 2.0",
};
export const emptyLoginConfig = (): LoginConfig => ({
  sso: {
    enabled: false,
    provider: "entra-oidc",
    displayName: "",
    domains: "",
    issuer: "",
    tenantId: "",
    clientId: "",
    redirectUri: "",
    bridgeUrl: "",
    entryPoint: "",
    idpIssuer: "",
    idpCertificate: "",
    entityId: "",
    acsUrl: "",
  },
  directory: {
    enabled: false,
    host: "",
    port: "636",
    transport: "ldaps",
    baseDn: "",
    bindDn: "",
    bridgeUrl: "",
    usernameAttribute: "sAMAccountName",
    subjectAttribute: "objectGUID",
  },
  policy: { requireSso: false, breakGlassUserIds: [] },
});
export function domains(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(/[\s,;]+/)
        .filter(Boolean),
    ),
  ];
}
export function emailDomain(value: string) {
  const match = /^[^\s@]+@([^\s@]+)$/.exec(value.trim().toLowerCase());
  return match?.[1] || "";
}
export function discoverSso(email: string, options: LoginOptions | undefined) {
  return (
    !!options?.sso.enabled && options.sso.domains.includes(emailDomain(email))
  );
}
export function publicLoginOptions(config: LoginConfig): LoginOptions {
  return {
    sso: {
      enabled: config.sso.enabled,
      name: config.sso.displayName || providerNames[config.sso.provider],
      domains: domains(config.sso.domains),
      protocol: config.sso.provider === "saml" ? "SAML 2.0" : "OIDC",
    },
    directory: { enabled: config.directory.enabled },
    requireSso: config.policy.requireSso,
  };
}
export class AuthenticationError extends Error {
  constructor(
    public code: string,
    public status = 401,
  ) {
    super(code);
  }
}
export const loginMessages: Record<string, [string, string]> = {
  invalid_credentials: [
    "Kullanıcı bilgileri doğrulanamadı.",
    "The sign-in details could not be verified.",
  ],
  local_restricted: [
    "Yerel giriş yalnızca yetkili acil durum hesaplarına açıktır.",
    "Local sign-in is restricted to authorized emergency accounts.",
  ],
  rate_limited: [
    "Çok fazla giriş denemesi. Bir süre sonra tekrar deneyin.",
    "Too many sign-in attempts. Try again later.",
  ],
  provider_unavailable: [
    "Kimlik sağlayıcısına ulaşılamadı. Tekrar denemeden önce oturum durumunu kontrol edin.",
    "The identity provider is unavailable. Check your session before trying again.",
  ],
  provider_disabled: [
    "Bu giriş yöntemi henüz etkinleştirilmedi.",
    "This sign-in method has not been enabled.",
  ],
  callback_invalid: [
    "SSO yanıtı doğrulanamadı veya giriş isteğinin süresi doldu. Girişi yeniden başlatın.",
    "The SSO response could not be verified or the request expired. Start sign-in again.",
  ],
  account_unavailable: [
    "Kimlik doğrulandı ancak bu çalışma alanına erişim verilemedi. Yöneticinizle görüşün.",
    "Your identity was verified, but access to this workspace could not be granted. Contact your administrator.",
  ],
  configuration_changed: [
    "Ayarlar değişti. Güncel ayarları yenileyin.",
    "The settings changed. Reload the current settings.",
  ],
  invalid_configuration: [
    "Giriş yapılandırmasını ve zorunlu alanları kontrol edin.",
    "Check the sign-in configuration and required fields.",
  ],
  emergency_required: [
    "SSO zorunluluğu için kendiniz dahil en az bir aktif acil durum yöneticisi seçin.",
    "To require SSO, select active emergency administrators including yourself.",
  ],
  secret_required: [
    "Kurulum şifreleme anahtarı veya gerekli bağlantı sırrı eksik.",
    "The installation encryption key or a required connection secret is missing.",
  ],
  bridge_required: [
    "Kurum içi kimlik köprüsü ve bağlantı anahtarı yapılandırılmalı.",
    "Configure the internal identity bridge and its connection credential.",
  ],
  session_check: [
    "İşlem sonucu doğrulanamadı. Yeniden göndermeden önce oturum durumunu kontrol edin.",
    "The result could not be verified. Check your session before resubmitting.",
  ],
};
export function loginErrorText(code: string, lang: "tr" | "en") {
  return (loginMessages[code] || loginMessages.session_check)[
    lang === "tr" ? 0 : 1
  ];
}
