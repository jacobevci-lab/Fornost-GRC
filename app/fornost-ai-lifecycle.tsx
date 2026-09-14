"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Model = {
  id: string;
  systemName: string;
  modelName: string;
  status: string;
  riskTier: string;
  owner: string;
};
type Change = {
  id: string;
  changeType: string;
  fromVersion: string;
  toVersion: string;
  summary: string;
  riskImpact: string;
  rollbackPlan: string;
  testEvidence: string;
  plannedDate: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
};
type Snapshot = {
  id: string;
  accuracy: number;
  errorRate: number;
  driftScore: number;
  biasScore: number;
  p95LatencyMs: number;
  sampleSize: number;
  health: string;
  alerts: string[];
  note: string;
  recordedAt: string;
};
export default function FornostAiLifecycle() {
  const [models, setModels] = useState<Model[]>([]),
    [modelId, setModelId] = useState(""),
    [changes, setChanges] = useState<Change[]>([]),
    [snapshots, setSnapshots] = useState<Snapshot[]>([]),
    [summary, setSummary] = useState({
      openChanges: 0,
      deployed: 0,
      alerts: 0,
      health: "unknown",
    }),
    [view, setView] = useState<"changes" | "monitoring">("changes"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<{
      id: string;
      status: string;
      note: string;
      confirmation: string;
    } | null>(null),
    [change, setChange] = useState({
      changeType: "model",
      fromVersion: "",
      toVersion: "",
      summary: "",
      riskImpact: "",
      rollbackPlan: "",
      testEvidence: "",
      plannedDate: "",
    }),
    [metric, setMetric] = useState({
      accuracy: 90,
      errorRate: 2,
      driftScore: 5,
      biasScore: 5,
      p95LatencyMs: 3000,
      sampleSize: 100,
      note: "",
    });
  const load = useCallback(async (id: string) => {
    const response = await fetch(
        withBasePath(
          id
            ? `/api/ai/lifecycle?modelId=${encodeURIComponent(id)}`
            : "/api/ai/lifecycle",
        ),
        { cache: "no-store" },
      ),
      body = await response.json().catch(() => ({}));
    if (response.ok) {
      setModels(body.models || []);
      setChanges(body.changes || []);
      setSnapshots(body.snapshots || []);
      setSummary(
        body.summary || {
          openChanges: 0,
          deployed: 0,
          alerts: 0,
          health: "unknown",
        },
      );
      if (!id && body.models?.[0]) setModelId(body.models[0].id);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(modelId), 0);
    return () => window.clearTimeout(timer);
  }, [load, modelId]);
  async function createChange(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/lifecycle"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...change, modelId, kind: "change" }),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Model değişikliği insan onay kuyruğuna alındı."
        : String(body.error || "Değişiklik açılamadı."),
    );
    if (response.ok) {
      setChange({
        ...change,
        fromVersion: "",
        toVersion: "",
        summary: "",
        riskImpact: "",
        rollbackPlan: "",
        testEvidence: "",
        plannedDate: "",
      });
      await load(modelId);
    }
    setBusy(false);
  }
  async function createMetric(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/lifecycle"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...metric, modelId, kind: "monitoring" }),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `İzleme kaydı oluşturuldu · ${body.health}`
        : String(body.error || "Metrik kaydedilemedi."),
    );
    if (response.ok) await load(modelId);
    setBusy(false);
  }
  async function decide() {
    if (!decision) return;
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/lifecycle"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Değişiklik yaşam döngüsü güncellendi."
        : String(body.error || "Karar uygulanamadı."),
    );
    if (response.ok) {
      setDecision(null);
      await load(modelId);
    }
    setBusy(false);
  }
  const action = (
    c: Change,
    status: string,
    label: string,
  ) => (
    <button
      onClick={() =>
        setDecision({ id: c.id, status, note: "", confirmation: "" })
      }
    >
      {label}
    </button>
  );
  return (
    <div className="ai-lifecycle">
      <header>
        <div>
          <small>MODEL OPS · CHANGE & DRIFT</small>
          <h3>AI Değişiklik ve Sürekli İzleme</h3>
          <p>
            Model değişikliklerini test–onay–devreye alma–rollback zinciriyle,
            üretim sağlığını eşiklerle yönetin.
          </p>
        </div>
        {modelId && (
          <a
            href={withBasePath(
              `/api/ai/lifecycle?modelId=${encodeURIComponent(modelId)}&format=csv`,
            )}
          >
            Kanıt CSV
          </a>
        )}
      </header>
      <label className="ai-lifecycle-model">
        <span>Onaylı AI sistemi</span>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="">Model seçin</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.systemName} · {m.modelName} · {m.riskTier}
            </option>
          ))}
        </select>
      </label>
      <div className="ai-lifecycle-stats">
        <article>
          <b>{summary.openChanges}</b>
          <span>Açık değişiklik</span>
        </article>
        <article>
          <b>{summary.deployed}</b>
          <span>Devreye alınan</span>
        </article>
        <article>
          <b>{summary.alerts}</b>
          <span>Aktif eşik</span>
        </article>
        <article>
          <b>{summary.health}</b>
          <span>Son sağlık</span>
        </article>
      </div>
      <nav>
        <button
          className={view === "changes" ? "active" : ""}
          onClick={() => setView("changes")}
        >
          Değişiklikler
        </button>
        <button
          className={view === "monitoring" ? "active" : ""}
          onClick={() => setView("monitoring")}
        >
          Monitoring & Drift
        </button>
      </nav>
      {notice && <p className="ai-lifecycle-notice">{notice}</p>}
      {view === "changes" ? (
        <>
          <form className="ai-lifecycle-form" onSubmit={createChange}>
            <b>Yeni kontrollü değişiklik</b>
            <div>
              <label>
                <span>Tür</span>
                <select
                  value={change.changeType}
                  onChange={(e) =>
                    setChange({ ...change, changeType: e.target.value })
                  }
                >
                  {["model", "prompt", "data", "provider", "configuration"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>Mevcut sürüm</span>
                <input
                  value={change.fromVersion}
                  onChange={(e) =>
                    setChange({ ...change, fromVersion: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Hedef sürüm</span>
                <input
                  value={change.toVersion}
                  onChange={(e) =>
                    setChange({ ...change, toVersion: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Planlanan tarih</span>
                <input
                  type="date"
                  value={change.plannedDate}
                  onChange={(e) =>
                    setChange({ ...change, plannedDate: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              <span>Değişiklik özeti</span>
              <textarea
                rows={2}
                value={change.summary}
                onChange={(e) =>
                  setChange({ ...change, summary: e.target.value })
                }
              />
            </label>
            <label>
              <span>Risk etkisi</span>
              <textarea
                rows={2}
                value={change.riskImpact}
                onChange={(e) =>
                  setChange({ ...change, riskImpact: e.target.value })
                }
              />
            </label>
            <label>
              <span>Rollback planı</span>
              <textarea
                rows={2}
                value={change.rollbackPlan}
                onChange={(e) =>
                  setChange({ ...change, rollbackPlan: e.target.value })
                }
              />
            </label>
            <label>
              <span>Test kanıtı</span>
              <textarea
                rows={2}
                value={change.testEvidence}
                onChange={(e) =>
                  setChange({ ...change, testEvidence: e.target.value })
                }
              />
            </label>
            <button disabled={busy || !modelId}>Onay kuyruğuna al</button>
          </form>
          <div className="ai-change-list">
            {changes.map((c) => (
              <article key={c.id}>
                <header>
                  <div>
                    <small>
                      {c.changeType} · {c.plannedDate}
                    </small>
                    <b>
                      {c.fromVersion} → {c.toVersion}
                    </b>
                  </div>
                  <span>{c.status}</span>
                </header>
                <p>{c.summary}</p>
                <dl>
                  <div>
                    <dt>Risk etkisi</dt>
                    <dd>{c.riskImpact}</dd>
                  </div>
                  <div>
                    <dt>Rollback</dt>
                    <dd>{c.rollbackPlan}</dd>
                  </div>
                  <div>
                    <dt>Test kanıtı</dt>
                    <dd>{c.testEvidence || "Eksik"}</dd>
                  </div>
                </dl>
                <footer>
                  {c.status === "draft" && (
                    <>
                      {action(c, "approved", "Onayla")}
                      {action(c, "rejected", "Reddet")}
                    </>
                  )}
                  {c.status === "approved" &&
                    action(c, "deployed", "Devreye al")}
                  {c.status === "deployed" &&
                    action(c, "rolled-back", "Geri al")}
                </footer>
                {decision?.id === c.id && (
                  <div className="ai-change-decision">
                    <textarea
                      rows={2}
                      value={decision.note}
                      onChange={(e) =>
                        setDecision({ ...decision, note: e.target.value })
                      }
                      placeholder="Zorunlu karar notu"
                    />
                    <input
                      value={decision.confirmation}
                      onChange={(e) =>
                        setDecision({
                          ...decision,
                          confirmation: e.target.value,
                        })
                      }
                      placeholder={
                        decision.status === "approved"
                          ? "DEĞİŞİKLİĞİ ONAYLA"
                          : decision.status === "rejected"
                            ? "REDDET"
                            : decision.status === "deployed"
                              ? "DEVREYE AL"
                              : "GERİ AL"
                      }
                    />
                    <button
                      disabled={busy || decision.note.trim().length < 5}
                      onClick={() => void decide()}
                    >
                      Uygula
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <form className="ai-lifecycle-form" onSubmit={createMetric}>
            <b>Üretim sağlık ölçümü</b>
            <div>
              {Object.entries(metric)
                .filter(([k]) => k !== "note")
                .map(([key, value]) => (
                  <label key={key}>
                    <span>{key}</span>
                    <input
                      type="number"
                      min="0"
                      value={value}
                      onChange={(e) =>
                        setMetric({ ...metric, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
            </div>
            <label>
              <span>Ölçüm notu</span>
              <textarea
                rows={2}
                value={metric.note}
                onChange={(e) => setMetric({ ...metric, note: e.target.value })}
              />
            </label>
            <button disabled={busy || !modelId}>Sağlık kaydı oluştur</button>
          </form>
          <div className="ai-snapshot-list">
            {snapshots.map((s) => (
              <article key={s.id}>
                <header>
                  <b>{s.health}</b>
                  <time>{new Date(s.recordedAt).toLocaleString("tr-TR")}</time>
                </header>
                <div>
                  <span>
                    Accuracy <b>%{s.accuracy}</b>
                  </span>
                  <span>
                    Error <b>%{s.errorRate}</b>
                  </span>
                  <span>
                    Drift <b>{s.driftScore}</b>
                  </span>
                  <span>
                    Bias <b>{s.biasScore}</b>
                  </span>
                  <span>
                    P95 <b>{s.p95LatencyMs} ms</b>
                  </span>
                  <span>
                    Sample <b>{s.sampleSize}</b>
                  </span>
                </div>
                {s.alerts.length > 0 && (
                  <footer>
                    {s.alerts.map((a) => (
                      <em key={a}>{a}</em>
                    ))}
                  </footer>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
