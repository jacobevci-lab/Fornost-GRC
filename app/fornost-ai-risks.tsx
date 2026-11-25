"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";

type Role = "Admin" | "Editor" | "Viewer";
type Relation = Record<string, unknown>;
type Risk = {
  id: string;
  modelId: string;
  category: string;
  title: string;
  description: string;
  cause: string;
  consequence: string;
  owner: string;
  inherentScore: number;
  residualScore: number;
  riskTier: string;
  treatment: string;
  treatmentPlan: string;
  treatmentOwner: string;
  dueDate: string;
  status: string;
  acceptanceExpiry: string | null;
  decisionNote: string | null;
  attention: string;
};
const initial = {
  modelId: "",
  incidentId: "",
  changeId: "",
  category: "security",
  title: "",
  description: "",
  cause: "",
  consequence: "",
  owner: "",
  likelihood: 3,
  impact: 3,
  controlEffectiveness: 3,
  treatment: "mitigate",
  treatmentPlan: "",
  treatmentOwner: "",
  dueDate: "",
};

export default function FornostAiRisks({ role }: { role: Role }) {
  const [data, setData] = useState<{
    models: { id: string; systemName: string; modelName: string }[];
    incidents: Relation[];
    changes: Relation[];
    risks: Risk[];
    summary: Record<string, number>;
  }>({ models: [], incidents: [], changes: [], risks: [], summary: {} });
  const [form, setForm] = useState(initial),
    [decision, setDecision] = useState<{
      id: string;
      status: string;
      note: string;
      confirmation: string;
      acceptanceExpiry: string;
    } | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/risks"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const relations = (items: Relation[]) =>
    items.filter((item) => String(item.model_id) === form.modelId);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/risks"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Risk taslağı oluşturuldu · ${body.riskTier} (${body.residualScore})`
        : String(body.error || "Risk kaydedilemedi."),
    );
    if (response.ok) {
      setForm(initial);
      await load();
    }
    setBusy(false);
  }
  async function decide() {
    if (!decision) return;
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/risks"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Risk kararı kaydedildi."
        : String(body.error || "Karar uygulanamadı."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const confirmText = (status: string) =>
    status === "accepted"
      ? "RİSKİ KABUL ET"
      : status === "closed"
        ? "RİSKİ KAPAT"
        : status === "treatment"
          ? "TEDAVİYE AL"
          : "RİSKİ AÇ";
  const visible = data.risks.filter(
    (r) =>
      filter === "all" ||
      r.attention === filter ||
      r.status === filter ||
      r.riskTier.toLowerCase() === filter,
  );
  return (
    <div className="ai-risk-center">
      <header>
        <div>
          <small>AI RISK GOVERNANCE</small>
          <h3>AI Risk ve İstisna Merkezi</h3>
          <p>
            Model risklerini olay ve değişikliklerle ilişkilendir; tedavi et,
            süreli kabul et ve kapanış kanıtını yönet.
          </p>
        </div>
        {role === "Admin" && (
          <a href={withBasePath("/api/ai/risks?format=csv")}>Risk kanıt CSV</a>
        )}
      </header>
      <div className="ai-risk-summary">
        {[
          ["total", "Toplam"],
          ["criticalHigh", "Yüksek/Kritik"],
          ["open", "Açık"],
          ["overdue", "Geciken"],
          ["expiredAcceptances", "Süresi biten kabul"],
        ].map(([key, label]) => (
          <article key={key}>
            <b>{data.summary[key] || 0}</b>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <nav>
        {[
          ["all", "Tümü"],
          ["critical", "Kritik"],
          ["high", "Yüksek"],
          ["overdue", "Geciken"],
          ["acceptance-expired", "Kabul süresi biten"],
          ["accepted", "Kabul edilen"],
          ["closed", "Kapalı"],
        ].map(([key, label]) => (
          <button
            className={filter === key ? "active" : ""}
            key={key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {role !== "Viewer" && (
        <form onSubmit={create} className="ai-risk-form">
          <b>Yeni AI risk taslağı</b>
          <div className="ai-risk-grid">
            <label>
              <span>AI sistemi</span>
              <select
                required
                value={form.modelId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    modelId: e.target.value,
                    incidentId: "",
                    changeId: "",
                  })
                }
              >
                <option value="">Seçin</option>
                {data.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.systemName} · {m.modelName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Kategori</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {[
                  "security",
                  "privacy",
                  "bias",
                  "reliability",
                  "compliance",
                  "third-party",
                  "operational",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Bağlı olay</span>
              <select
                value={form.incidentId}
                onChange={(e) =>
                  setForm({ ...form, incidentId: e.target.value })
                }
              >
                <option value="">Yok</option>
                {relations(data.incidents).map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    {String(x.title)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Bağlı değişiklik</span>
              <select
                value={form.changeId}
                onChange={(e) => setForm({ ...form, changeId: e.target.value })}
              >
                <option value="">Yok</option>
                {relations(data.changes).map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    {String(x.from_version)} → {String(x.to_version)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Risk sahibi</span>
              <input
                required
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </label>
            <label>
              <span>Aksiyon sahibi</span>
              <input
                required
                value={form.treatmentOwner}
                onChange={(e) =>
                  setForm({ ...form, treatmentOwner: e.target.value })
                }
              />
            </label>
            <label>
              <span>Tedavi</span>
              <select
                value={form.treatment}
                onChange={(e) =>
                  setForm({ ...form, treatment: e.target.value })
                }
              >
                {["mitigate", "accept", "avoid", "transfer"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Termin</span>
              <input
                required
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </label>
            {[
              ["likelihood", "Olasılık"],
              ["impact", "Etki"],
              ["controlEffectiveness", "Kontrol etkinliği"],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <select
                  value={String(form[key as keyof typeof form])}
                  onChange={(e) =>
                    setForm({ ...form, [key]: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            <span>Başlık</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            <span>Risk açıklaması</span>
            <textarea
              required
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div className="ai-risk-grid">
            <label>
              <span>Kök neden</span>
              <textarea
                required
                rows={2}
                value={form.cause}
                onChange={(e) => setForm({ ...form, cause: e.target.value })}
              />
            </label>
            <label>
              <span>Olası sonuç</span>
              <textarea
                required
                rows={2}
                value={form.consequence}
                onChange={(e) =>
                  setForm({ ...form, consequence: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            <span>Tedavi / istisna planı</span>
            <textarea
              required
              rows={2}
              value={form.treatmentPlan}
              onChange={(e) =>
                setForm({ ...form, treatmentPlan: e.target.value })
              }
            />
          </label>
          <button disabled={busy}>Risk taslağı oluştur</button>
        </form>
      )}
      {notice && <p className="ai-risk-notice">{notice}</p>}
      <div className="ai-risk-list">
        {visible.map((r) => (
          <article key={r.id} className={r.attention}>
            <header>
              <div>
                <small>
                  {r.category} · {r.treatment}
                </small>
                <b>{r.title}</b>
              </div>
              <div>
                <em className={r.riskTier.toLowerCase()}>
                  {r.riskTier} · {r.residualScore}
                </em>
                <span>{r.status}</span>
              </div>
            </header>
            <p>{r.description}</p>
            <dl>
              <div>
                <dt>Risk sahibi</dt>
                <dd>{r.owner}</dd>
              </div>
              <div>
                <dt>Skor</dt>
                <dd>
                  {r.inherentScore} → {r.residualScore}
                </dd>
              </div>
              <div>
                <dt>Aksiyon sahibi / termin</dt>
                <dd>
                  {r.treatmentOwner} · {r.dueDate}
                </dd>
              </div>
              <div>
                <dt>Kabul sonu</dt>
                <dd>{r.acceptanceExpiry || "—"}</dd>
              </div>
            </dl>
            <details>
              <summary>Neden, sonuç ve tedavi</summary>
              <p>
                <b>Neden:</b> {r.cause}
              </p>
              <p>
                <b>Sonuç:</b> {r.consequence}
              </p>
              <p>
                <b>Plan:</b> {r.treatmentPlan}
              </p>
            </details>
            {r.decisionNote && <aside>{r.decisionNote}</aside>}
            {role === "Admin" && (
              <footer>
                {[
                  ["open", "Aç"],
                  ["treatment", "Tedaviye al"],
                  ["accepted", "Kabul et"],
                  ["closed", "Kapat"],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    onClick={() =>
                      setDecision({
                        id: r.id,
                        status,
                        note: "",
                        confirmation: "",
                        acceptanceExpiry: "",
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </footer>
            )}
            {decision?.id === r.id && (
              <div className="ai-risk-decision">
                <textarea
                  rows={2}
                  value={decision.note}
                  onChange={(e) =>
                    setDecision({ ...decision, note: e.target.value })
                  }
                  placeholder="Zorunlu karar gerekçesi"
                />
                {decision.status === "accepted" && (
                  <input
                    type="date"
                    value={decision.acceptanceExpiry}
                    onChange={(e) =>
                      setDecision({
                        ...decision,
                        acceptanceExpiry: e.target.value,
                      })
                    }
                  />
                )}
                <input
                  value={decision.confirmation}
                  onChange={(e) =>
                    setDecision({ ...decision, confirmation: e.target.value })
                  }
                  placeholder={confirmText(decision.status)}
                />
                <button
                  disabled={busy || decision.note.length < 5}
                  onClick={() => void decide()}
                >
                  Kararı uygula
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
