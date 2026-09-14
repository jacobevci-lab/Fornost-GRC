"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Role = "Admin" | "Editor" | "Viewer";
type Row = {
  id: string;
  modelId: string;
  serviceName: string;
  legalEntity: string;
  serviceOwner: string;
  dataLocations: string;
  subprocessors: string;
  certifications: string;
  sla: string;
  exitPlan: string;
  contractEnd: string;
  reviewDate: string;
  breachHours: number;
  assuranceScore: number;
  assuranceTier: string;
  gaps: string[];
  criticalGaps: string[];
  status: string;
  decisionNote: string | null;
  reviewState: string;
};
const controls = [
  ["dpa", "DPA / veri işleme eki"],
  ["trainingOptOut", "Veri eğitimde kullanılmıyor"],
  ["deletionCommitment", "Silme taahhüdü"],
  ["auditRights", "Denetim hakkı"],
  ["securityExhibit", "Güvenlik eki"],
  ["bcdr", "BC/DR güvence kanıtı"],
  ["subprocessorNotice", "Alt işleyen bildirimi"],
  ["dataPortability", "Veri taşınabilirliği"],
] as const;
const initial = {
  modelId: "",
  riskId: "",
  serviceName: "",
  legalEntity: "",
  serviceOwner: "",
  dataLocations: "EU",
  subprocessors: "",
  certifications: "",
  sla: "",
  exitPlan: "",
  contractEnd: "",
  reviewDate: "",
  breachHours: 72,
  dpa: false,
  trainingOptOut: false,
  deletionCommitment: false,
  auditRights: false,
  securityExhibit: false,
  bcdr: false,
  subprocessorNotice: false,
  dataPortability: false,
};
export default function FornostAiVendorAssurance({ role }: { role: Role }) {
  const [data, setData] = useState<{
      models: {
        id: string;
        systemName: string;
        modelName: string;
        vendor: string;
      }[];
      risks: Record<string, unknown>[];
      assessments: Row[];
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
    const response = await fetch(withBasePath("/api/ai/vendor-assurance"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const risks = data.risks.filter((x) => String(x.model_id) === form.modelId);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/vendor-assurance"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Değerlendirme oluşturuldu · ${body.score}/100 ${body.tier}`
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
    const response = await fetch(withBasePath("/api/ai/vendor-assurance"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Tedarikçi kararı kaydedildi."
        : String(body.error || "Karar uygulanamadı."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const phrase = (status: string) =>
    status === "approved"
      ? "TEDARİKÇİYİ ONAYLA"
      : status === "conditional"
        ? "ŞARTLI ONAYLA"
        : "ASKIYA AL";
  return (
    <div className="ai-vendor-assurance">
      <header>
        <div>
          <small>AI THIRD-PARTY ASSURANCE</small>
          <h3>AI Sağlayıcı Güvence Merkezi</h3>
          <p>
            DPA, veri kullanımı, alt işleyen, SLA, BCDR ve çıkış hazırlığını
            model bazında yönetin.
          </p>
        </div>
        {role === "Admin" && (
          <a href={withBasePath("/api/ai/vendor-assurance?format=csv")}>
            Güvence CSV
          </a>
        )}
      </header>
      <div className="ai-vendor-stats">
        {[
          ["total", "Toplam"],
          ["approved", "Onaylı"],
          ["conditional", "Şartlı"],
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
        <form className="ai-vendor-form" onSubmit={create}>
          <b>Yeni AI sağlayıcı değerlendirmesi</b>
          <div>
            <label>
              <span>AI sistemi</span>
              <select
                required
                value={form.modelId}
                onChange={(e) => {
                  const model = data.models.find(
                    (m) => m.id === e.target.value,
                  );
                  setForm({
                    ...form,
                    modelId: e.target.value,
                    riskId: "",
                    serviceName: model?.vendor || "",
                  });
                }}
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
              <span>Kabul edilmiş risk istisnası</span>
              <select
                value={form.riskId}
                onChange={(e) => setForm({ ...form, riskId: e.target.value })}
              >
                <option value="">Yok</option>
                {risks.map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {String(r.title)} · {String(r.acceptance_expiry || "")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Hizmet adı</span>
              <input
                required
                value={form.serviceName}
                onChange={(e) =>
                  setForm({ ...form, serviceName: e.target.value })
                }
              />
            </label>
            <label>
              <span>Tüzel kişi</span>
              <input
                required
                value={form.legalEntity}
                onChange={(e) =>
                  setForm({ ...form, legalEntity: e.target.value })
                }
              />
            </label>
            <label>
              <span>Hizmet sahibi</span>
              <input
                required
                value={form.serviceOwner}
                onChange={(e) =>
                  setForm({ ...form, serviceOwner: e.target.value })
                }
              />
            </label>
            <label>
              <span>Veri lokasyonları</span>
              <input
                required
                value={form.dataLocations}
                onChange={(e) =>
                  setForm({ ...form, dataLocations: e.target.value })
                }
              />
            </label>
            <label>
              <span>Sözleşme sonu</span>
              <input
                required
                type="date"
                value={form.contractEnd}
                onChange={(e) =>
                  setForm({ ...form, contractEnd: e.target.value })
                }
              />
            </label>
            <label>
              <span>Sonraki değerlendirme</span>
              <input
                required
                type="date"
                value={form.reviewDate}
                onChange={(e) =>
                  setForm({ ...form, reviewDate: e.target.value })
                }
              />
            </label>
            <label>
              <span>İhlal bildirim süresi</span>
              <input
                required
                type="number"
                min="1"
                max="168"
                value={form.breachHours}
                onChange={(e) =>
                  setForm({ ...form, breachHours: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="ai-vendor-checks">
            {controls.map(([key, label]) => (
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
          <label>
            <span>Alt işleyenler</span>
            <textarea
              rows={2}
              value={form.subprocessors}
              onChange={(e) =>
                setForm({ ...form, subprocessors: e.target.value })
              }
            />
          </label>
          <label>
            <span>Sertifikalar / attestasyonlar</span>
            <textarea
              rows={2}
              value={form.certifications}
              onChange={(e) =>
                setForm({ ...form, certifications: e.target.value })
              }
            />
          </label>
          <label>
            <span>SLA ve destek koşulları</span>
            <textarea
              required
              rows={2}
              value={form.sla}
              onChange={(e) => setForm({ ...form, sla: e.target.value })}
            />
          </label>
          <label>
            <span>Çıkış ve veri taşıma planı</span>
            <textarea
              required
              rows={2}
              value={form.exitPlan}
              onChange={(e) => setForm({ ...form, exitPlan: e.target.value })}
            />
          </label>
          <button disabled={busy}>Değerlendirme taslağı oluştur</button>
        </form>
      )}
      {notice && <p className="ai-vendor-notice">{notice}</p>}
      <div className="ai-vendor-list">
        {data.assessments.map((r) => (
          <article key={r.id} className={r.reviewState}>
            <header>
              <div>
                <small>{r.legalEntity}</small>
                <b>{r.serviceName}</b>
                <span>
                  {r.dataLocations} · ihlal bildirimi {r.breachHours}s
                </span>
              </div>
              <div>
                <em className={r.assuranceTier.toLowerCase()}>
                  {r.assuranceScore}/100 · {r.assuranceTier}
                </em>
                <strong>{r.status}</strong>
              </div>
            </header>
            <dl>
              <div>
                <dt>Hizmet sahibi</dt>
                <dd>{r.serviceOwner}</dd>
              </div>
              <div>
                <dt>İnceleme</dt>
                <dd>
                  {r.reviewDate} · {r.reviewState}
                </dd>
              </div>
              <div>
                <dt>Sözleşme sonu</dt>
                <dd>{r.contractEnd}</dd>
              </div>
              <div>
                <dt>Kritik açıklar</dt>
                <dd>{r.criticalGaps.join(", ") || "Yok"}</dd>
              </div>
            </dl>
            <details>
              <summary>Güvence detayları</summary>
              <p>
                <b>Sertifikalar:</b> {r.certifications || "Belirtilmedi"}
              </p>
              <p>
                <b>Alt işleyenler:</b> {r.subprocessors || "Belirtilmedi"}
              </p>
              <p>
                <b>SLA:</b> {r.sla}
              </p>
              <p>
                <b>Çıkış planı:</b> {r.exitPlan}
              </p>
              <p>
                <b>Tüm açıklar:</b> {r.gaps.join(", ") || "Yok"}
              </p>
            </details>
            {r.decisionNote && <aside>{r.decisionNote}</aside>}
            {role === "Admin" && (
              <footer>
                {[
                  ["approved", "Onayla"],
                  ["conditional", "Şartlı onay"],
                  ["suspended", "Askıya al"],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    onClick={() =>
                      setDecision({
                        id: r.id,
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
            {decision?.id === r.id && (
              <div className="ai-vendor-decision">
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
