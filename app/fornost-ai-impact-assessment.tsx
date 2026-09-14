"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Role = "Admin" | "Editor" | "Viewer";
type Item = {
  id: string;
  modelId: string;
  riskId: string | null;
  type: string;
  title: string;
  context: string;
  affectedGroups: string;
  jurisdictions: string;
  necessity: string;
  proportionality: string;
  mitigations: string;
  monitoringPlan: string;
  consultation: string;
  owner: string;
  dpo: string;
  inherentScore: number;
  residualScore: number;
  impactTier: string;
  criticalGaps: string[];
  reviewDate: string;
  status: string;
  decisionNote: string | null;
  reviewState: string;
};
const initial = {
  modelId: "",
  riskId: "",
  type: "Combined",
  title: "",
  context: "",
  affectedGroups: "",
  jurisdictions: "TR, EU",
  necessity: "",
  proportionality: "",
  mitigations: "",
  monitoringPlan: "",
  consultation: "",
  owner: "",
  dpo: "",
  reviewDate: "",
  privacy: 3,
  fundamentalRights: 3,
  safety: 2,
  workforce: 2,
  vulnerableGroups: 2,
  autonomy: 2,
  scale: 3,
  controlMaturity: 3,
  personalData: false,
  specialCategoryData: false,
  automatedDecision: false,
  children: false,
  workers: false,
  publicServices: false,
  hasTransparency: false,
  hasHumanOversight: false,
  hasAppeal: false,
  dpoConsulted: false,
};
const ratings = [
    ["privacy", "Mahremiyet"],
    ["fundamentalRights", "Temel haklar"],
    ["safety", "Sağlık/güvenlik"],
    ["workforce", "Çalışan etkisi"],
    ["vulnerableGroups", "Hassas gruplar"],
    ["autonomy", "Otonomi"],
    ["scale", "Ölçek"],
    ["controlMaturity", "Kontrol olgunluğu"],
  ] as const,
  flags = [
    ["personalData", "Kişisel veri"],
    ["specialCategoryData", "Özel nitelikli veri"],
    ["automatedDecision", "Otomatik karar"],
    ["children", "Çocuklar"],
    ["workers", "Çalışanlar"],
    ["publicServices", "Kamu hizmeti"],
    ["hasTransparency", "Şeffaflık bildirimi"],
    ["hasHumanOversight", "İnsan gözetimi"],
    ["hasAppeal", "İtiraz kanalı"],
    ["dpoConsulted", "DPO görüşü"],
  ] as const;
export default function FornostAiImpactAssessment({ role }: { role: Role }) {
  const [data, setData] = useState<{
      models: { id: string; systemName: string; modelName: string }[];
      risks: Record<string, unknown>[];
      assessments: Item[];
      summary: Record<string, number>;
    }>({ models: [], risks: [], assessments: [], summary: {} }),
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
    const response = await fetch(withBasePath("/api/ai/impact-assessment"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);
  const risks = data.risks.filter((r) => String(r.model_id) === form.modelId);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/impact-assessment"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Etki değerlendirmesi oluşturuldu · ${body.impactTier} (${body.residualScore})`
        : String(body.error || "Değerlendirme kaydedilemedi."),
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
    const response = await fetch(withBasePath("/api/ai/impact-assessment"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Etki kararı kaydedildi."
        : String(body.error || "Karar uygulanamadı."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const phrase = (s: string) =>
    s === "approved"
      ? "ETKİYİ ONAYLA"
      : s === "conditional"
        ? "ŞARTLI ONAYLA"
        : s === "rejected"
          ? "ETKİYİ REDDET"
          : "ASKIYA AL";
  return (
    <div className="ai-impact-center">
      <header>
        <div>
          <small>AI DPIA · FRIA · TRANSPARENCY</small>
          <h3>AI Etki Değerlendirmesi Merkezi</h3>
          <p>
            Mahremiyet, temel haklar, güvenlik, çalışan ve hassas grup
            etkilerini insan gözetimiyle yönetin.
          </p>
        </div>
        {role === "Admin" && (
          <div>
            <a href={withBasePath("/api/ai/impact-assessment?format=csv")}>
              Etki CSV
            </a>
            <a href={withBasePath("/api/ai/impact-assessment?format=manifest")}>
              JSON Manifest
            </a>
          </div>
        )}
      </header>
      <div className="ai-impact-stats">
        {[
          ["total", "Toplam"],
          ["approved", "Onaylı"],
          ["highImpact", "Yüksek/Kritik"],
          ["criticalGaps", "Kritik açık"],
          ["overdue", "Geciken"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      {role !== "Viewer" && (
        <form className="ai-impact-form" onSubmit={create}>
          <b>Yeni DPIA / FRIA değerlendirmesi</b>
          <div className="ai-impact-grid">
            <label>
              <span>AI sistemi</span>
              <select
                required
                value={form.modelId}
                onChange={(e) =>
                  setForm({ ...form, modelId: e.target.value, riskId: "" })
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
              <span>Tür</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {["Combined", "DPIA", "FRIA"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Risk istisnası</span>
              <select
                value={form.riskId}
                onChange={(e) => setForm({ ...form, riskId: e.target.value })}
              >
                <option value="">Yok</option>
                {risks.map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {String(r.title)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sorumlu</span>
              <input
                required
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </label>
            <label>
              <span>DPO / Privacy</span>
              <input
                value={form.dpo}
                onChange={(e) => setForm({ ...form, dpo: e.target.value })}
              />
            </label>
            <label>
              <span>İnceleme tarihi</span>
              <input
                required
                type="date"
                value={form.reviewDate}
                onChange={(e) =>
                  setForm({ ...form, reviewDate: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            <span>Başlık</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="ai-impact-grid">
            <label>
              <span>Kullanım bağlamı</span>
              <textarea
                required
                rows={3}
                value={form.context}
                onChange={(e) => setForm({ ...form, context: e.target.value })}
              />
            </label>
            <label>
              <span>Etkilenen gruplar</span>
              <textarea
                required
                rows={3}
                value={form.affectedGroups}
                onChange={(e) =>
                  setForm({ ...form, affectedGroups: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            <span>Yargı bölgeleri</span>
            <input
              required
              value={form.jurisdictions}
              onChange={(e) =>
                setForm({ ...form, jurisdictions: e.target.value })
              }
            />
          </label>
          <div className="ai-impact-ratings">
            {ratings.map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <select
                  value={String(form[key])}
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
          <div className="ai-impact-flags">
            {flags.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) =>
                    setForm({ ...form, [key]: e.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {[
            ["necessity", "Gereklilik"],
            ["proportionality", "Orantılılık"],
            ["mitigations", "Azaltıcı kontroller"],
            ["monitoringPlan", "Sürekli izleme planı"],
            ["consultation", "Paydaş görüşleri"],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <textarea
                required={key !== "consultation"}
                rows={2}
                value={String(form[key as keyof typeof form])}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <button disabled={busy}>Etki taslağı oluştur</button>
        </form>
      )}
      {notice && <p className="ai-impact-notice">{notice}</p>}
      <div className="ai-impact-list">
        {data.assessments.map((a) => (
          <article key={a.id} className={a.reviewState}>
            <header>
              <div>
                <small>
                  {a.type} · {a.jurisdictions}
                </small>
                <b>{a.title}</b>
                <span>
                  {a.owner} · {a.reviewDate}
                </span>
              </div>
              <div>
                <em className={a.impactTier.toLowerCase()}>
                  {a.impactTier} · {a.residualScore}
                </em>
                <strong>{a.status}</strong>
              </div>
            </header>
            <p>{a.context}</p>
            <dl>
              <div>
                <dt>Etkilenen gruplar</dt>
                <dd>{a.affectedGroups}</dd>
              </div>
              <div>
                <dt>Skor</dt>
                <dd>
                  {a.inherentScore} → {a.residualScore}
                </dd>
              </div>
              <div>
                <dt>DPO</dt>
                <dd>{a.dpo || "—"}</dd>
              </div>
              <div>
                <dt>Kritik açıklar</dt>
                <dd>{a.criticalGaps.join(", ") || "Yok"}</dd>
              </div>
            </dl>
            <details>
              <summary>Gereklilik, orantılılık ve kontroller</summary>
              <p>
                <b>Gereklilik:</b> {a.necessity}
              </p>
              <p>
                <b>Orantılılık:</b> {a.proportionality}
              </p>
              <p>
                <b>Kontroller:</b> {a.mitigations}
              </p>
              <p>
                <b>İzleme:</b> {a.monitoringPlan}
              </p>
              <p>
                <b>Görüşler:</b> {a.consultation || "Belirtilmedi"}
              </p>
            </details>
            {a.decisionNote && <aside>{a.decisionNote}</aside>}
            {role === "Admin" && (
              <footer>
                {[
                  ["approved", "Onayla"],
                  ["conditional", "Şartlı onay"],
                  ["rejected", "Reddet"],
                  ["suspended", "Askıya al"],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    onClick={() =>
                      setDecision({
                        id: a.id,
                        status,
                        note: "",
                        confirmation: "",
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </footer>
            )}
            {decision?.id === a.id && (
              <div className="ai-impact-decision">
                <textarea
                  rows={2}
                  value={decision.note}
                  onChange={(e) =>
                    setDecision({ ...decision, note: e.target.value })
                  }
                  placeholder="Karar gerekçesi"
                />
                <input
                  value={decision.confirmation}
                  onChange={(e) =>
                    setDecision({ ...decision, confirmation: e.target.value })
                  }
                  placeholder={phrase(decision.status)}
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
