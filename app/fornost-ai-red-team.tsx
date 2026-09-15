"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AI_ATTACK_CATEGORIES } from "./ai/red-team";
import { withBasePath } from "./base-path";

const initial = {
  modelId: "",
  name: "",
  scope: "",
  methodology: "OWASP LLM Top 10 ve risk bazlı adversarial test",
  lead: "",
  independentTester: "",
  environment: "isolated-test",
  categories: [] as string[],
  plannedAt: "",
  completedAt: "",
  totalTests: 0,
  passedTests: 0,
  criticalFindings: 0,
  highFindings: 0,
  mediumFindings: 0,
  reportReference: "",
  remediationPlan: "",
  retestAt: "",
};
type Campaign = typeof initial & {
  id: string;
  passRate: number;
  blockers: string[];
  status: string;
  attention: string;
};

export default function FornostAiRedTeam() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      campaigns: Campaign[];
      summary: Record<string, number>;
    }>({ models: [], campaigns: [], summary: {} }),
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
    const response = await fetch(withBasePath("/api/ai/red-team"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function send(method: string, body: unknown) {
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/red-team"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      result = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? method === "POST"
          ? `Kampanya kaydedildi · %${result.passRate} başarı · ${result.blockers?.length || 0} engel`
          : "Karar kaydedildi."
        : String(result.error || "İşlem başarısız."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const phrase = (status: string) =>
    status === "approved"
      ? "RED TEAMİ ONAYLA"
      : status === "rejected"
        ? "RED TEAMİ REDDET"
        : "KAMPANYAYI EMEKLİ ET";
  return (
    <div className="ai-red-team">
      <header>
        <div>
          <small>ADVERSARIAL ASSURANCE · OWASP LLM · RETEST</small>
          <h3>AI Red-Team Kontrol Merkezi</h3>
          <p>
            Model saldırı yüzeyini test edin, bulguları yönetin ve üretim
            kararını kanıtla destekleyin.
          </p>
        </div>
        <a href={withBasePath("/api/ai/red-team?format=csv")}>
          Red-Team Kanıt CSV
        </a>
      </header>
      <div className="stats">
        {[
          ["total", "Kampanya"],
          ["approved", "Güncel onay"],
          ["blocked", "Engelli"],
          ["critical", "Kritik bulgu"],
          ["retest", "Yeniden test"],
        ].map(([key, label]) => (
          <article key={key}>
            <b>{data.summary[key] || 0}</b>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void send("POST", form);
        }}
      >
        <b>Yeni saldırı simülasyonu</b>
        <div className="grid">
          <label>
            AI modeli
            <select
              required
              value={form.modelId}
              onChange={(event) =>
                setForm({ ...form, modelId: event.target.value })
              }
            >
              <option value="">Seçin</option>
              {data.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.system_name} · {model.model_name}
                </option>
              ))}
            </select>
          </label>
          {[
            ["name", "Kampanya adı"],
            ["lead", "Red-team lideri"],
            ["independentTester", "Bağımsız doğrulayıcı"],
            ["reportReference", "Rapor/kanıt referansı"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                value={String(form[key as keyof typeof form])}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <label>
            Test ortamı
            <select
              value={form.environment}
              onChange={(event) =>
                setForm({ ...form, environment: event.target.value })
              }
            >
              {["isolated-test", "staging", "production-safe"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {[
            ["plannedAt", "Plan tarihi"],
            ["completedAt", "Tamamlanma"],
            ["retestAt", "Yeniden test"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                type="date"
                value={String(form[key as keyof typeof form])}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
              />
            </label>
          ))}
          {[
            ["totalTests", "Toplam test"],
            ["passedTests", "Başarılı test"],
            ["criticalFindings", "Kritik bulgu"],
            ["highFindings", "Yüksek bulgu"],
            ["mediumFindings", "Orta bulgu"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                type="number"
                min="0"
                value={Number(form[key as keyof typeof form])}
                onChange={(event) =>
                  setForm({ ...form, [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
        </div>
        {[
          ["scope", "Kapsam ve saldırı yüzeyi"],
          ["methodology", "Metodoloji"],
          ["remediationPlan", "Bulgu aksiyonları ve remediation planı"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              required
              rows={3}
              value={String(form[key as keyof typeof form])}
              onChange={(event) =>
                setForm({ ...form, [key]: event.target.value })
              }
            />
          </label>
        ))}
        <fieldset>
          <legend>OWASP LLM ve genişletilmiş tehdit kapsamı</legend>
          {AI_ATTACK_CATEGORIES.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={form.categories.includes(category)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    categories: event.target.checked
                      ? [...form.categories, category]
                      : form.categories.filter((item) => item !== category),
                  })
                }
              />
              {category}
            </label>
          ))}
        </fieldset>
        <button disabled={busy}>Kampanyayı Değerlendir</button>
      </form>
      {notice && <div className="notice">{notice}</div>}
      <div className="list">
        {data.campaigns.map((campaign) => (
          <article key={campaign.id}>
            <header>
              <div>
                <b>{campaign.name}</b>
                <small>
                  {campaign.id} · {campaign.modelId} · {campaign.environment}
                </small>
              </div>
              <span>
                {campaign.status} · {campaign.attention}
              </span>
            </header>
            <div className="score">
              <strong>%{campaign.passRate}</strong>
              <span>
                {campaign.passedTests}/{campaign.totalTests} saldırı testi geçti
              </span>
            </div>
            <dl>
              <div>
                <dt>Kapsam</dt>
                <dd>{campaign.categories.length} tehdit kategorisi</dd>
              </div>
              <div>
                <dt>Bulgular</dt>
                <dd>
                  {campaign.criticalFindings} kritik · {campaign.highFindings}{" "}
                  yüksek · {campaign.mediumFindings} orta
                </dd>
              </div>
              <div>
                <dt>Bağımsız test</dt>
                <dd>{campaign.independentTester}</dd>
              </div>
              <div>
                <dt>Yeniden test</dt>
                <dd>{campaign.retestAt}</dd>
              </div>
            </dl>
            {campaign.blockers.length > 0 && (
              <div className="blockers">
                {campaign.blockers.map((blocker) => (
                  <span key={blocker}>{blocker}</span>
                ))}
              </div>
            )}
            <p className="remediation">
              <b>Aksiyon:</b> {campaign.remediationPlan}
            </p>
            <footer>
              {campaign.status === "draft" && (
                <>
                  <button
                    disabled={campaign.blockers.length > 0}
                    onClick={() =>
                      setDecision({
                        id: campaign.id,
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
                        id: campaign.id,
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
              {campaign.status !== "retired" && (
                <button
                  className="danger"
                  onClick={() =>
                    setDecision({
                      id: campaign.id,
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
            {decision?.id === campaign.id && (
              <div className="decision">
                <textarea
                  placeholder="Karar gerekçesi"
                  value={decision.note}
                  onChange={(event) =>
                    setDecision({ ...decision, note: event.target.value })
                  }
                />
                <input
                  placeholder={phrase(decision.status)}
                  value={decision.confirmation}
                  onChange={(event) =>
                    setDecision({
                      ...decision,
                      confirmation: event.target.value,
                    })
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
    </div>
  );
}
