"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Check = { key: string; label: string; passed: boolean; detail: string };
type Gate = {
  id: string;
  modelId: string;
  changeId: string;
  version: string;
  environment: string;
  releaseOwner: string;
  rollbackOwner: string;
  rollbackPlan: string;
  plannedAt: string;
  readinessScore: number;
  checks: Check[];
  blockers: string[];
  status: string;
  decisionNote: string | null;
  validUntil: string | null;
  createdBy: string;
  decidedBy: string | null;
  createdAt: string;
  expired: boolean;
};
const initial = {
  modelId: "",
  changeId: "",
  version: "",
  environment: "production",
  releaseOwner: "",
  rollbackOwner: "",
  rollbackPlan: "",
  plannedAt: "",
  confirmation: "",
};
export default function FornostAiReleaseGate() {
  const [data, setData] = useState<{
      models: {
        id: string;
        systemName: string;
        modelName: string;
        status: string;
      }[];
      changes: Record<string, unknown>[];
      gates: Gate[];
      summary: Record<string, number>;
    }>({ models: [], changes: [], gates: [], summary: {} }),
    [form, setForm] = useState(initial),
    [decision, setDecision] = useState<{
      id: string;
      status: "approved" | "rejected" | "revoked";
      note: string;
      validUntil: string;
      confirmation: string;
    } | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/release-gate"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const changes = data.changes.filter(
    (x) =>
      String(x.model_id) === form.modelId && String(x.status) === "approved",
  );
  async function evaluate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/release-gate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Yayın kapısı hazır · ${body.score}/100`
        : `${body.error || "Kapı geçilemedi."}${Array.isArray(body.blockers) ? ` · ${body.blockers.join(", ")}` : ""}`,
    );
    setForm({ ...form, confirmation: "" });
    await load();
    setBusy(false);
  }
  async function decide() {
    if (!decision) return;
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/release-gate"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Yayın kararı kaydedildi."
        : `${body.error || "Karar uygulanamadı."}${Array.isArray(body.blockers) ? ` · ${body.blockers.join(", ")}` : ""}`,
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const phrase = (s: string) =>
    s === "approved"
      ? "YAYINA ALMAYI ONAYLA"
      : s === "rejected"
        ? "YAYINI REDDET"
        : "ONAYI GERİ ÇEK";
  return (
    <div className="ai-release-gate">
      <header>
        <div>
          <small>AI PRODUCTION ASSURANCE</small>
          <h3>AI Yayına Alma Güvenlik Kapısı</h3>
          <p>
            Production kararı sekiz bağımsız yönetişim kapısının güncel durumuna
            ve değiştirilemez karar snapshot’ına dayanır.
          </p>
        </div>
        <div>
          <a href={withBasePath("/api/ai/release-gate?format=csv")}>
            Karar CSV
          </a>
          <a href={withBasePath("/api/ai/release-gate?format=manifest")}>
            JSON Manifest
          </a>
        </div>
      </header>
      <div className="ai-release-stats">
        {[
          ["total", "Toplam"],
          ["approved", "Geçerli onay"],
          ["pending", "Karar bekleyen"],
          ["blocked", "Engelli"],
          ["expired", "Süresi biten"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <form className="ai-release-form" onSubmit={evaluate}>
        <b>Yeni production gate değerlendirmesi</b>
        <div>
          <label>
            <span>AI sistemi</span>
            <select
              required
              value={form.modelId}
              onChange={(e) =>
                setForm({
                  ...form,
                  modelId: e.target.value,
                  changeId: "",
                  version: "",
                })
              }
            >
              <option value="">Seçin</option>
              {data.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.systemName} · {m.modelName} · {m.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Onaylı değişiklik</span>
            <select
              required
              value={form.changeId}
              onChange={(e) => {
                const c = changes.find((x) => String(x.id) === e.target.value);
                setForm({
                  ...form,
                  changeId: e.target.value,
                  version: String(c?.to_version || ""),
                });
              }}
            >
              <option value="">Seçin</option>
              {changes.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.from_version)} → {String(c.to_version)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Release sürümü</span>
            <input
              required
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
          </label>
          <label>
            <span>Ortam</span>
            <select
              value={form.environment}
              onChange={(e) =>
                setForm({ ...form, environment: e.target.value })
              }
            >
              <option>production</option>
              <option>restricted-production</option>
            </select>
          </label>
          <label>
            <span>Release sahibi</span>
            <input
              required
              value={form.releaseOwner}
              onChange={(e) =>
                setForm({ ...form, releaseOwner: e.target.value })
              }
            />
          </label>
          <label>
            <span>Rollback sahibi</span>
            <input
              required
              value={form.rollbackOwner}
              onChange={(e) =>
                setForm({ ...form, rollbackOwner: e.target.value })
              }
            />
          </label>
          <label>
            <span>Planlanan tarih</span>
            <input
              required
              type="date"
              value={form.plannedAt}
              onChange={(e) => setForm({ ...form, plannedAt: e.target.value })}
            />
          </label>
        </div>
        <label>
          <span>Rollback planı</span>
          <textarea
            required
            rows={2}
            value={form.rollbackPlan}
            onChange={(e) => setForm({ ...form, rollbackPlan: e.target.value })}
          />
        </label>
        <label>
          <span>Değerlendirme onayı</span>
          <input
            required
            value={form.confirmation}
            onChange={(e) => setForm({ ...form, confirmation: e.target.value })}
            placeholder="KAPIYI DEĞERLENDİR"
          />
        </label>
        <button disabled={busy}>Sekiz güvenlik kapısını değerlendir</button>
      </form>
      {notice && <p className="ai-release-notice">{notice}</p>}
      <div className="ai-release-list">
        {data.gates.map((g) => (
          <article
            key={g.id}
            className={`${g.status} ${g.expired ? "expired" : ""}`}
          >
            <header>
              <div>
                <small>
                  {g.environment} · {g.version}
                </small>
                <b>{g.id}</b>
                <span>
                  {g.releaseOwner} · {g.plannedAt}
                </span>
              </div>
              <div>
                <em>{g.readinessScore}/100</em>
                <strong>{g.expired ? "expired" : g.status}</strong>
              </div>
            </header>
            <div className="ai-release-checks">
              {g.checks.map((c) => (
                <div className={c.passed ? "pass" : "fail"} key={c.key}>
                  <b>
                    {c.passed ? "✓" : "×"} {c.label}
                  </b>
                  <span>{c.detail}</span>
                </div>
              ))}
            </div>
            <details>
              <summary>Rollback ve karar ayrıntıları</summary>
              <p>
                <b>Rollback sahibi:</b> {g.rollbackOwner}
              </p>
              <p>{g.rollbackPlan}</p>
              <p>
                <b>Talep:</b> {g.createdBy} · <b>Karar:</b>{" "}
                {g.decidedBy || "Bekliyor"}
              </p>
            </details>
            {g.blockers.length > 0 && (
              <aside>Engeller: {g.blockers.join(", ")}</aside>
            )}
            {g.decisionNote && <aside>{g.decisionNote}</aside>}
            <footer>
              {g.status === "requested" && (
                <>
                  <button
                    onClick={() =>
                      setDecision({
                        id: g.id,
                        status: "approved",
                        note: "",
                        validUntil: "",
                        confirmation: "",
                      })
                    }
                  >
                    Production onayı
                  </button>
                  <button
                    onClick={() =>
                      setDecision({
                        id: g.id,
                        status: "rejected",
                        note: "",
                        validUntil: "",
                        confirmation: "",
                      })
                    }
                  >
                    Reddet
                  </button>
                </>
              )}
              {g.status === "approved" && !g.expired && (
                <button
                  onClick={() =>
                    setDecision({
                      id: g.id,
                      status: "revoked",
                      note: "",
                      validUntil: "",
                      confirmation: "",
                    })
                  }
                >
                  Onayı geri çek
                </button>
              )}
            </footer>
            {decision?.id === g.id && (
              <div className="ai-release-decision">
                <textarea
                  rows={2}
                  value={decision.note}
                  onChange={(e) =>
                    setDecision({ ...decision, note: e.target.value })
                  }
                  placeholder="Karar gerekçesi"
                />
                {decision.status === "approved" && (
                  <input
                    type="date"
                    value={decision.validUntil}
                    onChange={(e) =>
                      setDecision({ ...decision, validUntil: e.target.value })
                    }
                  />
                )}
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
