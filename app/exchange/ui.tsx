"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { withBasePath } from "../base-path";
export type Locale = "tr" | "en";
export const t = (lang: Locale, tr: string, en: string) =>
  lang === "tr" ? tr : en;
const errors: Record<string, [string, string]> = {
  link: [
    "Bağlantı kullanılmış veya süresi dolmuş.",
    "The link has expired or has been used.",
  ],
  scope: [
    "Konsolide kapsam ve uygun rol gerekli.",
    "Consolidated scope and an authorized role are required.",
  ],
  config: [
    "Önce sağlayıcı ayarlarını tamamlayın.",
    "Complete the provider configuration first.",
  ],
  contact: [
    "Bağımsız inceleyen ve geçerli bir dış iletişim adresi gerekli.",
    "A valid external contact and an independent reviewer are required.",
  ],
  "vendor-cycle": [
    "Tedarikçinin açık değerlendirmesini tamamlayın veya durumunu kontrol edin.",
    "Complete the existing assessment or check the supplier lifecycle.",
  ],
  closure: [
    "Güncel kapanış kanıtı veya bağımsız inceleyen eksik.",
    "Current closure evidence or an independent reviewer is missing.",
  ],
  provider: [
    "Sağlayıcı isteği başarısız. Bağlantı ve izinleri kontrol edin.",
    "Provider request failed. Check connectivity and permissions.",
  ],
  reconcile: [
    "Bilet gönderimi teyit bekliyor. Sağlayıcıdaki kaydı kontrol edin.",
    "Ticket delivery needs reconciliation. Check the provider record.",
  ],
  file: [
    "Belge türünü ve boyutunu kontrol edin.",
    "Check the document type and size.",
  ],
  rate: [
    "İstek sınırına ulaşıldı. Daha sonra deneyin.",
    "Request limit reached. Try again later.",
  ],
  nda: [
    "Kurumsal e-posta, kimlik bilgileri ve gizlilik kabulü gerekli.",
    "Provide a business email, contact details and confidentiality acceptance.",
  ],
};
export async function api<T>(
  path: string,
  body?: unknown,
  token?: string,
  signal?: AbortSignal,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(withBasePath("/api/" + path), {
    cache: "no-store",
    method: body ? "POST" : "GET",
    signal,
    headers: {
      ...(body && !form ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok)
    throw new Error((await res.json().catch(() => ({}))).code || "input");
  return res.json();
}
export function message(lang: Locale, error: unknown) {
  const key = error instanceof Error ? error.message : "";
  return (errors[key] || [
    "İşlem tamamlanamadı. Girdileri ve erişim yetkisini kontrol edin.",
    "Request failed. Check the inputs and your access.",
  ])[lang === "tr" ? 0 : 1];
}
export function useLoad<T>(path: string, token?: string) {
  const [state, set] = useState<{
      path?: string;
      rev?: number;
      token?: string;
      v?: T;
      err?: unknown;
    }>({}),
    [rev, bump] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    api<T>(path, undefined, token, c.signal).then(
      (v) => {
        if (!c.signal.aborted) set({ path, rev, token, v });
      },
      (err) => {
        if (!c.signal.aborted) set({ path, rev, token, err });
      },
    );
    return () => c.abort();
  }, [path, rev, token]);
  return {
    v:
      state.path === path && state.rev === rev && state.token === token
        ? state.v
        : undefined,
    err:
      state.path === path && state.rev === rev && state.token === token
        ? state.err
        : undefined,
    reload: useCallback(() => bump((n) => n + 1), []),
  };
}
export function useAction(lang: Locale) {
  const [busy, set] = useState(false),
    [note, say] = useState("");
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    set(true);
    say("");
    try {
      await fn();
    } catch (e) {
      say(message(lang, e));
    } finally {
      set(false);
    }
  }
  return { busy, note, say, act };
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="ex-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function State({ lang, error }: { lang: Locale; error?: unknown }) {
  return (
    <p role="status">
      {error ? message(lang, error) : t(lang, "Yükleniyor…", "Loading…")}
    </p>
  );
}
export function RecordAction({
  kind,
  id,
  lang,
}: {
  kind: "invite" | "ticket";
  id: string;
  lang: Locale;
}) {
  const a = useAction(lang),
    [url, link] = useState(""),
    [recovery, showRecovery] = useState(false),
    [reference, setReference] = useState("");
  return (
    <div className="exchange ex-inline">
      <button
        type="button"
        disabled={a.busy}
        onClick={() =>
          a.act(async () => {
            link("");
            const r = await api<{
              sent?: boolean;
              url?: string;
              ticket?: string;
            }>("exchange", { action: kind, id }).catch((e) => {
              if (kind === "ticket" && e.message === "reconcile")
                showRecovery(true);
              throw e;
            });
            if (r.url) link(new URL(r.url, location.origin).href);
            a.say(
              r.ticket ||
                (r.sent
                  ? t(lang, "Davet gönderildi.", "Invitation sent.")
                  : t(
                      lang,
                      "E-posta gönderilemedi. Bağlantıyı yetkili alıcıyla paylaşın.",
                      "Email was not delivered. Share the link with the authorized recipient.",
                    )),
            );
          })
        }
      >
        {kind === "invite"
          ? t(
              lang,
              "Güvenlik Değerlendirmesi Gönder",
              "Send security assessment",
            )
          : t(
              lang,
              "Jira / ServiceNow bileti oluştur",
              "Create Jira / ServiceNow ticket",
            )}
      </button>
      {recovery && (
        <div className="ex-actions">
          <Field
            label={t(
              lang,
              "Oluşturulan biletin kodu",
              "Created ticket reference",
            )}
          >
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <button
            type="button"
            disabled={a.busy || !reference}
            onClick={() =>
              a.act(async () => {
                const r = await api<{ url: string; ticket: string }>(
                  "exchange",
                  { action: "recover-ticket", id, reference },
                );
                link(r.url);
                showRecovery(false);
                a.say(r.ticket);
              })
            }
          >
            {t(
              lang,
              "Sağlayıcıdan doğrula ve bağla",
              "Verify with provider and link",
            )}
          </button>
        </div>
      )}
      {url &&
        (kind === "invite" ? (
          <button
            onClick={() =>
              a.act(async () => {
                await navigator.clipboard.writeText(url);
                a.say(t(lang, "Bağlantı kopyalandı.", "Link copied."));
              })
            }
          >
            {t(lang, "Davet bağlantısını kopyala", "Copy invitation link")}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noreferrer">
            {t(lang, "Bileti aç", "Open ticket")}
          </a>
        ))}
      <span role="status">{a.note}</span>
    </div>
  );
}
