"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
const initial = {
  modelId: "",
  name: "",
  version: "1.0",
  purpose: "rag",
  sourceType: "internal",
  sourceOwner: "",
  provenance: "",
  license: "Internal authorized use",
  legalBasis: "Legitimate business purpose",
  dataClassification: "Internal",
  personalData: false,
  specialCategory: false,
  consentRequired: false,
  consentVerified: false,
  retentionDays: 365,
  records: 0,
  qualityScore: 80,
  biasScore: 20,
  documentation: "",
  reviewDate: "",
};
type Item = {
  id: string;
  modelId: string;
  name: string;
  version: string;
  purpose: string;
  sourceType: string;
  sourceOwner: string;
  dataClassification: string;
  personalData: boolean;
  retentionDays: number;
  qualityScore: number;
  biasScore: number;
  reviewDate: string;
  status: string;
  attention: string;
  blockers: string[];
  provenance: string;
  license: string;
  legalBasis: string;
};
export default function FornostAiDatasets() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      datasets: Item[];
      summary: Record<string, number>;
    }>({ models: [], datasets: [], summary: {} }),
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
    const r = await fetch(withBasePath("/api/ai/datasets"), {
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
    const r = await fetch(withBasePath("/api/ai/datasets"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      b = await r.json().catch(() => ({}));
    setNotice(
      r.ok
        ? method === "POST"
          ? `Veri seti kaydedildi${b.blockers?.length ? ` · ${b.blockers.length} engel` : ""}`
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
      ? "VERİ SETİNİ ONAYLA"
      : s === "rejected"
        ? "VERİ SETİNİ REDDET"
        : "VERİ SETİNİ EMEKLİ ET";
  return (
    <div className="ai-datasets">
      <header>
        <div>
          <small>LINEAGE · PRIVACY · QUALITY · BIAS</small>
          <h3>AI Veri Seti ve Lineage Merkezi</h3>
          <p>
            Eğitim, RAG, değerlendirme ve izleme verilerinin kaynağını, kullanım
            hakkını ve kalitesini yönetin.
          </p>
        </div>
        <a href={withBasePath("/api/ai/datasets?format=csv")}>
          Veri Kanıtı CSV
        </a>
      </header>
      <div className="ai-dataset-stats">
        {[
          ["total", "Toplam"],
          ["approved", "Onaylı"],
          ["blocked", "Engelli"],
          ["overdue", "Geciken"],
          ["personal", "Kişisel veri"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <form onSubmit={create} className="ai-dataset-form">
        <b>Yeni veri seti kaydı</b>
        <div className="grid">
          <label>
            AI modeli
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
            Ad
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Sürüm
            <input
              required
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
          </label>
          <label>
            Amaç
            <select
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            >
              {[
                "training",
                "fine-tuning",
                "evaluation",
                "rag",
                "monitoring",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Kaynak türü
            <select
              value={form.sourceType}
              onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
            >
              {["internal", "customer", "vendor", "public", "synthetic"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Kaynak sahibi
            <input
              required
              value={form.sourceOwner}
              onChange={(e) =>
                setForm({ ...form, sourceOwner: e.target.value })
              }
            />
          </label>
          <label>
            Veri sınıfı
            <select
              value={form.dataClassification}
              onChange={(e) =>
                setForm({ ...form, dataClassification: e.target.value })
              }
            >
              {["Public", "Internal", "Confidential", "Restricted"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
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
            Retention (gün)
            <input
              type="number"
              min="1"
              max="3650"
              value={form.retentionDays}
              onChange={(e) =>
                setForm({ ...form, retentionDays: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Kayıt sayısı
            <input
              type="number"
              min="0"
              value={form.records}
              onChange={(e) =>
                setForm({ ...form, records: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Kalite (0–100)
            <input
              type="number"
              min="0"
              max="100"
              value={form.qualityScore}
              onChange={(e) =>
                setForm({ ...form, qualityScore: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Bias riski (0–100)
            <input
              type="number"
              min="0"
              max="100"
              value={form.biasScore}
              onChange={(e) =>
                setForm({ ...form, biasScore: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {[
          ["provenance", "Kaynak ve dönüşüm zinciri"],
          ["license", "Lisans/kullanım hakkı"],
          ["legalBasis", "Hukuki dayanak"],
          ["documentation", "Kalite, temsil ve sınırlılık dokümantasyonu"],
        ].map(([k, l]) => (
          <label key={k}>
            {l}
            <textarea
              required
              rows={2}
              value={String(form[k as keyof typeof form])}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </label>
        ))}
        <div className="checks">
          {[
            ["personalData", "Kişisel veri"],
            ["specialCategory", "Özel nitelikli veri"],
            ["consentRequired", "Açık rıza gerekli"],
            ["consentVerified", "Açık rıza doğrulandı"],
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
        <button disabled={busy}>Taslak Kaydet</button>
      </form>
      {notice && <div className="ai-dataset-notice">{notice}</div>}
      <div className="ai-dataset-list">
        {data.datasets.map((x) => (
          <article key={x.id}>
            <header>
              <div>
                <b>
                  {x.name} · {x.version}
                </b>
                <small>
                  {x.id} · {x.modelId} · {x.purpose}
                </small>
              </div>
              <span className={x.attention}>
                {x.status} · {x.attention}
              </span>
            </header>
            <dl>
              <div>
                <dt>Kaynak</dt>
                <dd>
                  {x.sourceType} · {x.sourceOwner}
                </dd>
              </div>
              <div>
                <dt>Kalite / Bias</dt>
                <dd>
                  {x.qualityScore} / {x.biasScore}
                </dd>
              </div>
              <div>
                <dt>Sınıf</dt>
                <dd>
                  {x.dataClassification}
                  {x.personalData ? " · kişisel veri" : ""}
                </dd>
              </div>
              <div>
                <dt>İnceleme</dt>
                <dd>{x.reviewDate}</dd>
              </div>
            </dl>
            <p>{x.provenance}</p>
            {x.blockers.length > 0 && (
              <div className="blockers">
                {x.blockers.map((b) => (
                  <span key={b}>{b}</span>
                ))}
              </div>
            )}
            <footer>
              {x.status === "draft" && (
                <>
                  <button
                    disabled={x.blockers.length > 0}
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
                  placeholder="Karar gerekçesi"
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
    </div>
  );
}
