"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
const scenarios = [
  "provider-outage",
  "model-degradation",
  "data-disclosure",
  "prompt-injection",
  "credential-compromise",
  "regional-outage",
];
const empty = {
  modelId: "",
  scenario: "provider-outage",
  owner: "",
  technicalOwner: "",
  rtoMinutes: 60,
  rpoMinutes: 15,
  maxDegradedMinutes: 240,
  fallbackPlan: "",
  manualPlan: "",
  shutdownProcedure: "",
  communicationPlan: "",
  dependencies: "",
  nextExercise: "",
};
type Plan = {
  id: string;
  modelId: string;
  scenario: string;
  owner: string;
  technicalOwner: string;
  rtoMinutes: number;
  rpoMinutes: number;
  nextExercise: string;
  status: string;
  attention: string;
  decisionNote?: string;
};
type Exercise = {
  id: string;
  planId: string;
  score: number;
  result: string;
  exercisedAt: string;
  findings: string;
  criticalFailures: string[];
};
export default function FornostAiResilience() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      plans: Plan[];
      exercises: Exercise[];
      summary: Record<string, number>;
    }>({ models: [], plans: [], exercises: [], summary: {} }),
    [form, setForm] = useState(empty),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<{
      id: string;
      status: string;
      note: string;
      confirmation: string;
    } | null>(null),
    [drill, setDrill] = useState<Record<string, unknown> | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(withBasePath("/api/ai/resilience"), {
        cache: "no-store",
      }),
      b = await r.json().catch(() => ({}));
    if (r.ok) setData(b);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  async function request(method: string, body: unknown) {
    setBusy(true);
    const r = await fetch(withBasePath("/api/ai/resilience"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      b = await r.json().catch(() => ({}));
    setNotice(
      r.ok
        ? method === "PUT"
          ? `Tatbikat kaydedildi · ${b.result} (${b.score})`
          : "İşlem tamamlandı."
        : String(b.error || "İşlem başarısız."),
    );
    if (r.ok) {
      setDecision(null);
      setDrill(null);
      await load();
    }
    setBusy(false);
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await request("POST", form);
    setForm(empty);
  }
  return (
    <div className="ai-resilience">
      <header>
        <div>
          <small>CONTINUITY · KILL SWITCH · RECOVERY</small>
          <h3>AI Dayanıklılık ve Tatbikat Merkezi</h3>
          <p>
            Kesinti ve güvenlik olaylarında kontrollü durdurma, fallback, manuel
            çalışma ve kurtarmayı kanıtlayın.
          </p>
        </div>
        <a href={withBasePath("/api/ai/resilience?format=csv")}>
          Tatbikat Kanıtı CSV
        </a>
      </header>
      <div className="ai-resilience-stats">
        {[
          ["total", "Plan"],
          ["approved", "Onaylı"],
          ["overdue", "Geciken"],
          ["recentPassed", "180 gün başarılı"],
          ["failed", "Başarısız"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <form className="ai-resilience-form" onSubmit={create}>
        <b>Yeni dayanıklılık planı</b>
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
            Senaryo
            <select
              value={form.scenario}
              onChange={(e) => setForm({ ...form, scenario: e.target.value })}
            >
              {scenarios.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
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
            Teknik sahibi
            <input
              required
              value={form.technicalOwner}
              onChange={(e) =>
                setForm({ ...form, technicalOwner: e.target.value })
              }
            />
          </label>
          <label>
            RTO (dk)
            <input
              type="number"
              min="0"
              max="10080"
              value={form.rtoMinutes}
              onChange={(e) =>
                setForm({ ...form, rtoMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            RPO (dk)
            <input
              type="number"
              min="0"
              max="1440"
              value={form.rpoMinutes}
              onChange={(e) =>
                setForm({ ...form, rpoMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Azami bozuk çalışma (dk)
            <input
              type="number"
              min="0"
              max="10080"
              value={form.maxDegradedMinutes}
              onChange={(e) =>
                setForm({ ...form, maxDegradedMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Sonraki tatbikat
            <input
              required
              type="date"
              value={form.nextExercise}
              onChange={(e) =>
                setForm({ ...form, nextExercise: e.target.value })
              }
            />
          </label>
        </div>
        {[
          ["fallbackPlan", "Fallback planı"],
          ["manualPlan", "Manuel çalışma"],
          ["shutdownProcedure", "Acil durdurma"],
          ["communicationPlan", "İletişim planı"],
          ["dependencies", "Bağımlılıklar"],
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
        <button disabled={busy}>Taslak Plan Oluştur</button>
      </form>
      {notice && <div className="ai-resilience-notice">{notice}</div>}
      <div className="ai-resilience-list">
        {data.plans.map((p) => {
          const latest = data.exercises.find((e) => e.planId === p.id);
          return (
            <article key={p.id}>
              <header>
                <div>
                  <b>{p.scenario}</b>
                  <small>
                    {p.id} · {p.modelId}
                  </small>
                </div>
                <span className={p.attention}>
                  {p.status} · {p.attention}
                </span>
              </header>
              <dl>
                <div>
                  <dt>RTO / RPO</dt>
                  <dd>
                    {p.rtoMinutes} / {p.rpoMinutes} dk
                  </dd>
                </div>
                <div>
                  <dt>Sahipler</dt>
                  <dd>
                    {p.owner} · {p.technicalOwner}
                  </dd>
                </div>
                <div>
                  <dt>Tatbikat</dt>
                  <dd>{p.nextExercise}</dd>
                </div>
                <div>
                  <dt>Son sonuç</dt>
                  <dd>
                    {latest
                      ? `${latest.result} · ${latest.score}/100`
                      : "Henüz yok"}
                  </dd>
                </div>
              </dl>
              {latest && <p>{latest.findings}</p>}
              <footer>
                {p.status === "draft" && (
                  <>
                    <button
                      onClick={() =>
                        setDecision({
                          id: p.id,
                          status: "approved",
                          note: "",
                          confirmation: "",
                        })
                      }
                    >
                      Onayla
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        setDecision({
                          id: p.id,
                          status: "retired",
                          note: "",
                          confirmation: "",
                        })
                      }
                    >
                      Emekli Et
                    </button>
                  </>
                )}
                {p.status === "approved" && (
                  <button
                    onClick={() =>
                      setDrill({
                        planId: p.id,
                        actualRecoveryMinutes: p.rtoMinutes,
                        actualDataLossMinutes: p.rpoMinutes,
                        killSwitchPassed: true,
                        fallbackPassed: true,
                        manualModePassed: true,
                        communicationPassed: true,
                        findings: "",
                        correctiveActions: "",
                        exercisedAt: "",
                        nextRetest: "",
                      })
                    }
                  >
                    Tatbikat Kaydet
                  </button>
                )}
              </footer>
              {decision?.id === p.id && (
                <div className="action">
                  <textarea
                    placeholder="Karar gerekçesi"
                    value={decision.note}
                    onChange={(e) =>
                      setDecision({ ...decision, note: e.target.value })
                    }
                  />
                  <input
                    placeholder={
                      decision.status === "approved"
                        ? "PLANI ONAYLA"
                        : "PLANI EMEKLİ ET"
                    }
                    value={decision.confirmation}
                    onChange={(e) =>
                      setDecision({ ...decision, confirmation: e.target.value })
                    }
                  />
                  <button
                    disabled={busy}
                    onClick={() => void request("PATCH", decision)}
                  >
                    Kararı Uygula
                  </button>
                </div>
              )}
              {drill?.planId === p.id && (
                <div className="action drill">
                  <div className="grid">
                    <label>
                      Gerçek RTO
                      <input
                        type="number"
                        value={Number(drill.actualRecoveryMinutes)}
                        onChange={(e) =>
                          setDrill({
                            ...drill,
                            actualRecoveryMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Gerçek veri kaybı
                      <input
                        type="number"
                        value={Number(drill.actualDataLossMinutes)}
                        onChange={(e) =>
                          setDrill({
                            ...drill,
                            actualDataLossMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Tatbikat tarihi
                      <input
                        type="date"
                        onChange={(e) =>
                          setDrill({ ...drill, exercisedAt: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tekrar testi
                      <input
                        type="date"
                        onChange={(e) =>
                          setDrill({ ...drill, nextRetest: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  {[
                    ["killSwitchPassed", "Kill-switch"],
                    ["fallbackPassed", "Fallback"],
                    ["manualModePassed", "Manuel mod"],
                    ["communicationPassed", "İletişim"],
                  ].map(([k, l]) => (
                    <label className="check" key={k}>
                      <input
                        type="checkbox"
                        checked={Boolean(drill[k])}
                        onChange={(e) =>
                          setDrill({ ...drill, [k]: e.target.checked })
                        }
                      />
                      {l}
                    </label>
                  ))}
                  <textarea
                    placeholder="Bulgular"
                    onChange={(e) =>
                      setDrill({ ...drill, findings: e.target.value })
                    }
                  />
                  <textarea
                    placeholder="Düzeltici aksiyonlar"
                    onChange={(e) =>
                      setDrill({ ...drill, correctiveActions: e.target.value })
                    }
                  />
                  <button
                    disabled={busy}
                    onClick={() => void request("PUT", drill)}
                  >
                    Sonucu Kaydet
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
