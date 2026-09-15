"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
const modules = [
    "ai-basics",
    "acceptable-use",
    "security-privacy",
    "human-oversight",
    "incident-reporting",
    "secure-ai-lifecycle",
    "high-risk-controls",
  ],
  initial = {
    modelId: "",
    principal: "",
    displayName: "",
    role: "reviewer",
    manager: "",
    completedModules: [] as string[],
    score: 80,
    attested: false,
    limitationsAcknowledged: false,
    incidentDutyAcknowledged: false,
    trainedAt: "",
    validUntil: "",
  };
type Rec = {
  id: string;
  modelId: string;
  principal: string;
  displayName: string;
  role: string;
  manager: string;
  requiredModules: string[];
  completedModules: string[];
  missing: string[];
  score: number;
  validUntil: string;
  status: string;
  attention: string;
};
export default function FornostAiLiteracy() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      records: Rec[];
      summary: Record<string, number>;
    }>({ models: [], records: [], summary: {} }),
    [form, setForm] = useState(initial),
    [notice, setNotice] = useState(""),
    [decision, setDecision] = useState<{
      id: string;
      status: string;
      note: string;
      confirmation: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(withBasePath("/api/ai/literacy"), {
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
    const r = await fetch(withBasePath("/api/ai/literacy"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      b = await r.json().catch(() => ({}));
    setNotice(
      r.ok
        ? method === "POST"
          ? `Yetkinlik kaydedildi · ${b.missing?.length || 0} eksik`
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
      ? "YETKİNLİĞİ ONAYLA"
      : s === "rejected"
        ? "YETKİNLİĞİ REDDET"
        : "YETKİYİ GERİ ÇEK";
  return (
    <div className="ai-literacy">
      <header>
        <div>
          <small>AI LITERACY · HUMAN OVERSIGHT · ATTESTATION</small>
          <h3>AI Yetkinlik ve Operatör Yetkilendirme</h3>
          <p>
            AI kullanan, inceleyen, onaylayan ve yöneten kişilerin model bazlı
            yetkinliğini kanıtlayın.
          </p>
        </div>
        <a href={withBasePath("/api/ai/literacy?format=csv")}>
          Yetkinlik Kanıtı CSV
        </a>
      </header>
      <div className="stats">
        {[
          ["total", "Kayıt"],
          ["approved", "Onaylı"],
          ["gaps", "Eksikli"],
          ["expiring", "30 gün içinde"],
          ["expired", "Süresi geçmiş"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <form onSubmit={create}>
        <b>Yeni operatör yetkinliği</b>
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
            E-posta/kimlik
            <input
              required
              value={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.value })}
            />
          </label>
          <label>
            Ad soyad
            <input
              required
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </label>
          <label>
            Rol
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {[
                "user",
                "reviewer",
                "approver",
                "operator",
                "developer",
                "administrator",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Yönetici
            <input
              required
              value={form.manager}
              onChange={(e) => setForm({ ...form, manager: e.target.value })}
            />
          </label>
          <label>
            Sınav skoru
            <input
              type="number"
              min="0"
              max="100"
              value={form.score}
              onChange={(e) =>
                setForm({ ...form, score: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Eğitim tarihi
            <input
              required
              type="date"
              value={form.trainedAt}
              onChange={(e) => setForm({ ...form, trainedAt: e.target.value })}
            />
          </label>
          <label>
            Geçerlilik
            <input
              required
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            />
          </label>
        </div>
        <fieldset>
          <legend>Tamamlanan eğitimler</legend>
          {modules.map((x) => (
            <label key={x}>
              <input
                type="checkbox"
                checked={form.completedModules.includes(x)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    completedModules: e.target.checked
                      ? [...form.completedModules, x]
                      : form.completedModules.filter((m) => m !== x),
                  })
                }
              />
              {x}
            </label>
          ))}
        </fieldset>
        <div className="checks">
          {[
            ["attested", "Kişi doğrulaması"],
            ["limitationsAcknowledged", "Sınırlılıklar kabul edildi"],
            ["incidentDutyAcknowledged", "Olay bildirim görevi kabul edildi"],
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
        <button disabled={busy}>Yetkinliği Değerlendir</button>
      </form>
      {notice && <div className="notice">{notice}</div>}
      <div className="list">
        {data.records.map((x) => (
          <article key={x.id}>
            <header>
              <div>
                <b>
                  {x.displayName} · {x.role}
                </b>
                <small>
                  {x.id} · {x.modelId} · {x.principal}
                </small>
              </div>
              <span>
                {x.status} · {x.attention}
              </span>
            </header>
            <dl>
              <div>
                <dt>Yönetici</dt>
                <dd>{x.manager}</dd>
              </div>
              <div>
                <dt>Skor</dt>
                <dd>{x.score}/100</dd>
              </div>
              <div>
                <dt>Eğitim</dt>
                <dd>
                  {x.completedModules.length}/{x.requiredModules.length}
                </dd>
              </div>
              <div>
                <dt>Geçerlilik</dt>
                <dd>{x.validUntil}</dd>
              </div>
            </dl>
            <div className="modules">
              {x.requiredModules.map((m) => (
                <span
                  className={
                    x.completedModules.includes(m) ? "done" : "missing"
                  }
                  key={m}
                >
                  {x.completedModules.includes(m) ? "✓" : "!"} {m}
                </span>
              ))}
            </div>
            <footer>
              {x.status === "pending" && (
                <>
                  <button
                    disabled={x.missing.length > 0}
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
              {x.status === "approved" && (
                <button
                  className="danger"
                  onClick={() =>
                    setDecision({
                      id: x.id,
                      status: "revoked",
                      note: "",
                      confirmation: "",
                    })
                  }
                >
                  Geri Çek
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
