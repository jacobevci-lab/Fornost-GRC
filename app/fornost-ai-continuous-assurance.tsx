"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
const initial = {
  modelId: "",
  owner: "",
  minAccuracy: 85,
  maxErrorRate: 5,
  maxDriftScore: 15,
  maxBiasScore: 10,
  maxP95LatencyMs: 10000,
  minSampleSize: 100,
  frequencyDays: 30,
  evidencePlan: "Monthly validated production sample and evaluation evidence",
  breachAction:
    "Suspend affected capability, notify owner and open incident review",
  reviewDate: "",
};
type Policy = typeof initial & {
  id: string;
  status: string;
  createdBy: string;
  assurance: { state: string; breaches: string[]; stale: boolean };
  snapshot: null | {
    accuracy: number;
    errorRate: number;
    driftScore: number;
    biasScore: number;
    p95LatencyMs: number;
    sampleSize: number;
    recordedAt: string;
  };
};
export default function FornostAiContinuousAssurance() {
  const [data, setData] = useState<{
      models: {
        id: string;
        system_name: string;
        model_name: string;
        risk_tier: string;
      }[];
      policies: Policy[];
      summary: Record<string, number>;
    }>({ models: [], policies: [], summary: {} }),
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
    const response = await fetch(withBasePath("/api/ai/continuous-assurance"), {
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
    const response = await fetch(withBasePath("/api/ai/continuous-assurance"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      result = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? method === "POST"
          ? "Güvence baseline'ı kaydedildi."
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
      ? "BASELINE'I ONAYLA"
      : status === "rejected"
        ? "BASELINE'I REDDET"
        : "BASELINE'I EMEKLİ ET";
  return (
    <div className="ai-assurance">
      <header>
        <div>
          <small>SLO · KRI · DRIFT · BIAS · CONTINUOUS CONTROL</small>
          <h3>AI Sürekli Güvence Merkezi</h3>
          <p>
            Model bazında ölçüm baseline’larını tanımlayın ve üretim sağlığını
            sürekli kanıtlayın.
          </p>
        </div>
        <a href={withBasePath("/api/ai/continuous-assurance?format=csv")}>
          Güvence Kanıt CSV
        </a>
      </header>
      <div className="stats">
        {[
          ["total", "Baseline"],
          ["approved", "Onaylı"],
          ["healthy", "Sağlıklı"],
          ["breached", "İhlalli"],
          ["missing", "Ölçümsüz"],
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
        <b>Yeni model güvence baseline’ı</b>
        <div className="grid">
          <label>
            AI modeli
            <select
              required
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
            >
              <option value="">Seçin</option>
              {data.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.system_name} · {model.model_name} · {model.risk_tier}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kontrol sahibi
            <input
              required
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </label>
          {[
            ["minAccuracy", "Minimum doğruluk (%)"],
            ["maxErrorRate", "Maks. hata (%)"],
            ["maxDriftScore", "Maks. drift"],
            ["maxBiasScore", "Maks. bias"],
            ["maxP95LatencyMs", "Maks. P95 (ms)"],
            ["minSampleSize", "Min. örneklem"],
            ["frequencyDays", "Ölçüm sıklığı (gün)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                type="number"
                min="0"
                value={Number(form[key as keyof typeof form])}
                onChange={(e) =>
                  setForm({ ...form, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label>
            Review tarihi
            <input
              required
              type="date"
              value={form.reviewDate}
              onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
            />
          </label>
        </div>
        <label>
          Kanıt ve ölçüm planı
          <textarea
            required
            rows={3}
            value={form.evidencePlan}
            onChange={(e) => setForm({ ...form, evidencePlan: e.target.value })}
          />
        </label>
        <label>
          İhlal aksiyonu
          <textarea
            required
            rows={3}
            value={form.breachAction}
            onChange={(e) => setForm({ ...form, breachAction: e.target.value })}
          />
        </label>
        <button disabled={busy}>Baseline’ı Kaydet</button>
      </form>
      {notice && <div className="notice">{notice}</div>}
      <div className="list">
        {data.policies.map((item) => (
          <article key={item.id} className={item.assurance.state}>
            <header>
              <div>
                <b>
                  {item.modelId} · {item.owner}
                </b>
                <small>{item.id}</small>
              </div>
              <span>
                {item.status} · {item.assurance.state}
              </span>
            </header>
            <div className="thresholds">
              <span>Doğruluk ≥ %{item.minAccuracy}</span>
              <span>Hata ≤ %{item.maxErrorRate}</span>
              <span>Drift ≤ {item.maxDriftScore}</span>
              <span>Bias ≤ {item.maxBiasScore}</span>
              <span>P95 ≤ {item.maxP95LatencyMs} ms</span>
              <span>Örneklem ≥ {item.minSampleSize}</span>
            </div>
            {item.snapshot ? (
              <dl>
                <div>
                  <dt>Son doğruluk</dt>
                  <dd>%{item.snapshot.accuracy}</dd>
                </div>
                <div>
                  <dt>Hata</dt>
                  <dd>%{item.snapshot.errorRate}</dd>
                </div>
                <div>
                  <dt>Drift / Bias</dt>
                  <dd>
                    {item.snapshot.driftScore} / {item.snapshot.biasScore}
                  </dd>
                </div>
                <div>
                  <dt>Ölçüm</dt>
                  <dd>
                    {new Date(item.snapshot.recordedAt).toLocaleString("tr-TR")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>Bu model için henüz izleme snapshot’ı yok.</p>
            )}
            {item.assurance.breaches.length > 0 && (
              <div className="breaches">
                {item.assurance.breaches.map((breach) => (
                  <span key={breach}>{breach}</span>
                ))}
              </div>
            )}
            <p>
              <b>İhlal aksiyonu:</b> {item.breachAction}
            </p>
            <footer>
              {item.status === "draft" && (
                <>
                  <button
                    onClick={() =>
                      setDecision({
                        id: item.id,
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
                        id: item.id,
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
              {item.status !== "retired" && (
                <button
                  className="danger"
                  onClick={() =>
                    setDecision({
                      id: item.id,
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
            {decision?.id === item.id && (
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
