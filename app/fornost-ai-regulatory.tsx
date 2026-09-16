"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import FornostAiObligations from "./fornost-ai-obligations";
const obligationKeys = [
    "inventory",
    "risk-management",
    "data-governance",
    "technical-documentation",
    "logging",
    "human-oversight",
    "transparency",
    "fundamental-rights",
    "privacy",
    "incident-reporting",
    "copyright",
  ],
  initial = {
    modelId: "",
    classification: "limited-risk",
    jurisdictions: "TR, EU",
    providerRole: false,
    deployerRole: true,
    importerRole: false,
    distributorRole: false,
    personalData: false,
    automatedDecision: false,
    publicInteraction: true,
    highImpact: false,
    owner: "",
    legalReviewer: "",
    classificationRationale: "",
    transparencyNotice: "",
    humanOversight: "",
    completedKeys: [] as string[],
    reviewDate: "",
  };
type Profile = {
  id: string;
  modelId: string;
  classification: string;
  jurisdictions: string;
  owner: string;
  legalReviewer: string;
  obligations: { key: string; label: string }[];
  completedKeys: string[];
  gaps: string[];
  reviewDate: string;
  status: string;
  attention: string;
  classificationRationale: string;
};
export default function FornostAiRegulatory() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      profiles: Profile[];
      summary: Record<string, number>;
    }>({ models: [], profiles: [], summary: {} }),
    [form, setForm] = useState(initial),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<{
      id: string;
      status: string;
      note: string;
      confirmation: string;
    } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(withBasePath("/api/ai/regulatory"), {
        cache: "no-store",
      }),
      b = await r.json().catch(() => ({}));
    if (r.ok) setData(b);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  async function send(method: string, body: unknown) {
    setBusy(true);
    const r = await fetch(withBasePath("/api/ai/regulatory"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      b = await r.json().catch(() => ({}));
    setNotice(
      r.ok
        ? method === "POST"
          ? `Profil oluşturuldu · ${b.obligations?.length || 0} yükümlülük, ${b.gaps?.length || 0} açık`
          : "Karar kaydedildi."
        : String(b.error || "İşlem başarısız."),
    );
    if (r.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await send("POST", form);
  }
  const phrase = (s: string) =>
    s === "approved"
      ? "SINIFLANDIRMAYI ONAYLA"
      : s === "rejected"
        ? "SINIFLANDIRMAYI REDDET"
        : "PROFİLİ EMEKLİ ET";
  return (
    <div className="ai-regulatory">
      <header>
        <div>
          <small>EU AI ACT · KVKK · GDPR · ACCOUNTABILITY</small>
          <h3>AI Regülasyon ve Yükümlülük Merkezi</h3>
          <p>
            AI Act sınıfını, ekonomik operatör rollerini, şeffaflığı ve hukuki
            yükümlülükleri yönetin.
          </p>
        </div>
        <a href={withBasePath("/api/ai/regulatory?format=csv")}>
          Hukuki Kanıt CSV
        </a>
      </header>
      <div className="stats">
        {[
          ["total", "Profil"],
          ["approved", "Onaylı"],
          ["highRisk", "High-risk/GPAI"],
          ["gaps", "Açık yükümlülük"],
          ["overdue", "Geciken"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <form onSubmit={create}>
        <b>Yeni hukuki sınıflandırma</b>
        <div className="grid">
          <label>
            AI sistemi
            <select
              required
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
            >
              <option value="">Seçin</option>
              {data.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.system_name} · {m.model_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            AI Act sınıfı
            <select
              value={form.classification}
              onChange={(e) =>
                setForm({ ...form, classification: e.target.value })
              }
            >
              {[
                "prohibited",
                "high-risk",
                "limited-risk",
                "minimal-risk",
                "gpai",
                "gpai-systemic",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Ülke kapsamı
            <input
              value={form.jurisdictions}
              onChange={(e) =>
                setForm({ ...form, jurisdictions: e.target.value })
              }
            />
          </label>
          <label>
            İnceleme tarihi
            <input
              required
              type="date"
              value={form.reviewDate}
              onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
            />
          </label>
          <label>
            İş sahibi
            <input
              required
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </label>
          <label>
            Hukuk/DPO inceleyen
            <input
              required
              value={form.legalReviewer}
              onChange={(e) =>
                setForm({ ...form, legalReviewer: e.target.value })
              }
            />
          </label>
        </div>
        <div className="checks">
          {[
            ["providerRole", "Provider"],
            ["deployerRole", "Deployer"],
            ["importerRole", "Importer"],
            ["distributorRole", "Distributor"],
            ["personalData", "Kişisel veri"],
            ["automatedDecision", "Otomatik karar"],
            ["publicInteraction", "Kullanıcı etkileşimi"],
            ["highImpact", "Yüksek etki"],
          ].map(([k, l]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={Boolean(form[k as keyof typeof form])}
                onChange={(e) => setForm({ ...form, [k]: e.target.checked })}
              />
              {l}
            </label>
          ))}
        </div>
        {[
          ["classificationRationale", "Sınıflandırma gerekçesi"],
          ["transparencyNotice", "Şeffaflık bildirimi"],
          ["humanOversight", "İnsan gözetimi ve override"],
        ].map(([k, l]) => (
          <label key={k}>
            {l}
            <textarea
              rows={2}
              value={String(form[k as keyof typeof form])}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
        <fieldset>
          <legend>Tamamlandığı kanıtlanan yükümlülükler</legend>
          {obligationKeys.map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={form.completedKeys.includes(k)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    completedKeys: e.target.checked
                      ? [...form.completedKeys, k]
                      : form.completedKeys.filter((x) => x !== k),
                  })
                }
              />
              {k}
            </label>
          ))}
        </fieldset>
        <button disabled={busy}>Taslak Sınıflandır</button>
      </form>
      {notice && <div className="notice">{notice}</div>}
      <div className="list">
        {data.profiles.map((x) => (
          <article key={x.id}>
            <header>
              <div>
                <b>{x.classification}</b>
                <small>
                  {x.id} · {x.modelId} · {x.jurisdictions}
                </small>
              </div>
              <span>
                {x.status} · {x.attention}
              </span>
            </header>
            <p>{x.classificationRationale}</p>
            <dl>
              <div>
                <dt>Sahip</dt>
                <dd>{x.owner}</dd>
              </div>
              <div>
                <dt>Hukuk/DPO</dt>
                <dd>{x.legalReviewer}</dd>
              </div>
              <div>
                <dt>Yükümlülük</dt>
                <dd>{x.obligations.length}</dd>
              </div>
              <div>
                <dt>İnceleme</dt>
                <dd>{x.reviewDate}</dd>
              </div>
            </dl>
            <div className="obligations">
              {x.obligations.map((o) => (
                <span
                  className={x.completedKeys.includes(o.key) ? "done" : "gap"}
                  key={o.key}
                >
                  {x.completedKeys.includes(o.key) ? "✓" : "!"} {o.label}
                </span>
              ))}
            </div>
            <footer>
              {x.status === "draft" && (
                <>
                  <button
                    disabled={x.gaps.length > 0}
                    onClick={() =>
                      setDecision({
                        id: x.id,
                        status: "approved",
                        note: "",
                        confirmation: "",
                      })
                    }
                  >
                    Onayla
                  </button>
                  <button
                    className="warn"
                    onClick={() =>
                      setDecision({
                        id: x.id,
                        status: "rejected",
                        note: "",
                        confirmation: "",
                      })
                    }
                  >
                    Reddet
                  </button>
                </>
              )}
              {x.status !== "retired" && (
                <button
                  className="danger"
                  onClick={() =>
                    setDecision({
                      id: x.id,
                      status: "retired",
                      note: "",
                      confirmation: "",
                    })
                  }
                >
                  Emekli Et
                </button>
              )}
            </footer>
            {decision?.id === x.id && (
              <div className="decision">
                <textarea
                  placeholder="Hukuki karar gerekçesi"
                  value={decision.note}
                  onChange={(e) =>
                    setDecision({ ...decision, note: e.target.value })
                  }
                />
                <input
                  placeholder={phrase(decision.status)}
                  value={decision.confirmation}
                  onChange={(e) =>
                    setDecision({ ...decision, confirmation: e.target.value })
                  }
                />
                <button
                  disabled={busy}
                  onClick={() => void send("PATCH", decision)}
                >
                  Kararı Uygula
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <FornostAiObligations />
    </div>
  );
}
