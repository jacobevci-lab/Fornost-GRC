"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Model = { id: string; systemName: string; modelName: string };
type Evidence = {
  id: string;
  modelId: string;
  controlId: string | null;
  changeId: string | null;
  incidentId: string | null;
  type: string;
  title: string;
  description: string;
  source: string;
  collectionMethod: string;
  classification: string;
  owner: string;
  expectedHash: string;
  integrityStatus: string;
  verifiedAt: string | null;
  collectedAt: string;
  validUntil: string;
  status: string;
  expiryState: string;
  decisionNote: string | null;
};
export default function FornostAiEvidence({
  role,
}: {
  role: "Admin" | "Editor" | "Viewer";
}) {
  const [data, setData] = useState<{
      models: Model[];
      controls: Record<string, unknown>[];
      changes: Record<string, unknown>[];
      incidents: Record<string, unknown>[];
      evidence: Evidence[];
      summary: {
        total: number;
        approved: number;
        expired: number;
        expiring: number;
        integrityMismatch: number;
      };
    }>({
      models: [],
      controls: [],
      changes: [],
      incidents: [],
      evidence: [],
      summary: {
        total: 0,
        approved: 0,
        expired: 0,
        expiring: 0,
        integrityMismatch: 0,
      },
    }),
    [form, setForm] = useState({
      modelId: "",
      controlId: "",
      changeId: "",
      incidentId: "",
      type: "test-result",
      title: "",
      description: "",
      source: "",
      collectionMethod: "API/manuel doğrulama",
      classification: "Internal",
      owner: "",
      expectedHash: "",
      collectedAt: "",
      validUntil: "",
    }),
    [verify, setVerify] = useState<{ id: string; hash: string } | null>(null),
    [decision, setDecision] = useState<{
      id: string;
      status: "approved" | "rejected";
      note: string;
      confirmation: string;
    } | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/evidence"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/evidence"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "AI kanıt taslağı oluşturuldu."
        : String(body.error || "Kanıt kaydedilemedi."),
    );
    if (response.ok) {
      setForm({
        ...form,
        title: "",
        description: "",
        source: "",
        expectedHash: "",
      });
      await load();
    }
    setBusy(false);
  }
  async function check() {
    if (!verify) return;
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/evidence"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: verify.id, observedHash: verify.hash }),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Kanıt bütünlüğü doğrulandı."
        : String(
            body.error || `Bütünlük sonucu: ${body.integrityStatus || "hata"}`,
          ),
    );
    setVerify(null);
    await load();
    setBusy(false);
  }
  async function decide() {
    if (!decision) return;
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/evidence"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Kanıt kararı kaydedildi."
        : String(body.error || "Karar uygulanamadı."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const modelRelations = (list: Record<string, unknown>[]) =>
    list.filter((x) => String(x.model_id || x.modelId) === form.modelId);
  return (
    <div className="ai-evidence-vault">
      <header>
        <div>
          <small>AI EVIDENCE VAULT</small>
          <h3>AI Kanıt Kasası ve Assurance Pack</h3>
          <p>
            Kanıt içeriği yerine güvenli referans, sınıflandırma, SHA-256
            bütünlüğü ve yaşam döngüsü tutulur.
          </p>
        </div>
        <div>
          <a href={withBasePath("/api/ai/evidence?format=csv")}>Kanıt CSV</a>
          <a href={withBasePath("/api/ai/evidence?format=manifest")}>
            JSON Manifest
          </a>
        </div>
      </header>
      <div className="ai-evidence-stats">
        {Object.entries(data.summary).map(([k, v]) => (
          <article key={k}>
            <b>{v}</b>
            <span>{k}</span>
          </article>
        ))}
      </div>
      {role !== "Viewer" && <form className="ai-evidence-form" onSubmit={create}>
        <b>Yeni güvenli kanıt kaydı</b>
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
                  controlId: "",
                  changeId: "",
                  incidentId: "",
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
            <span>Tür</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {[
                "test-result",
                "config-snapshot",
                "log-export",
                "policy",
                "approval",
                "screenshot",
                "report",
                "other",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Kontrol</span>
            <select
              value={form.controlId}
              onChange={(e) => setForm({ ...form, controlId: e.target.value })}
            >
              <option value="">Yok</option>
              {modelRelations(data.controls).map((x) => (
                <option key={String(x.id)} value={String(x.id)}>
                  {String(x.framework)} · {String(x.control_id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Değişiklik</span>
            <select
              value={form.changeId}
              onChange={(e) => setForm({ ...form, changeId: e.target.value })}
            >
              <option value="">Yok</option>
              {modelRelations(data.changes).map((x) => (
                <option key={String(x.id)} value={String(x.id)}>
                  {String(x.from_version)} → {String(x.to_version)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Olay</span>
            <select
              value={form.incidentId}
              onChange={(e) => setForm({ ...form, incidentId: e.target.value })}
            >
              <option value="">Yok</option>
              {modelRelations(data.incidents).map((x) => (
                <option key={String(x.id)} value={String(x.id)}>
                  {String(x.title)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Veri sınıfı</span>
            <select
              value={form.classification}
              onChange={(e) =>
                setForm({ ...form, classification: e.target.value })
              }
            >
              {["Public", "Internal", "Confidential", "Restricted"].map((v) => (
                <option key={v}>{v}</option>
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
            <span>SHA-256</span>
            <input
              required
              maxLength={64}
              value={form.expectedHash}
              onChange={(e) =>
                setForm({ ...form, expectedHash: e.target.value })
              }
            />
          </label>
          <label>
            <span>Toplama tarihi</span>
            <input
              required
              type="date"
              value={form.collectedAt}
              onChange={(e) =>
                setForm({ ...form, collectedAt: e.target.value })
              }
            />
          </label>
          <label>
            <span>Geçerlilik sonu</span>
            <input
              required
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
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
        <label>
          <span>Açıklama</span>
          <textarea
            required
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          <span>Kaynak / güvenli referans</span>
          <input
            required
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </label>
        <label>
          <span>Toplama yöntemi</span>
          <input
            required
            value={form.collectionMethod}
            onChange={(e) =>
              setForm({ ...form, collectionMethod: e.target.value })
            }
          />
        </label>
        <button disabled={busy}>Kanıt taslağı oluştur</button>
      </form>}
      {notice && <p className="ai-evidence-notice">{notice}</p>}
      <div className="ai-evidence-list">
        {data.evidence.map((e) => (
          <article key={e.id} className={e.expiryState}>
            <header>
              <div>
                <small>
                  {e.type} · {e.classification}
                </small>
                <b>{e.title}</b>
              </div>
              <div>
                <em>{e.integrityStatus}</em>
                <span>
                  {e.status} · {e.expiryState}
                </span>
              </div>
            </header>
            <p>{e.description}</p>
            <dl>
              <div>
                <dt>Kaynak</dt>
                <dd>{e.source}</dd>
              </div>
              <div>
                <dt>Sorumlu</dt>
                <dd>{e.owner}</dd>
              </div>
              <div>
                <dt>Geçerlilik</dt>
                <dd>
                  {e.collectedAt} → {e.validUntil}
                </dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code>{e.expectedHash.slice(0, 16)}…</code>
                </dd>
              </div>
            </dl>
            <footer>
              {e.integrityStatus !== "verified" && (
                <button onClick={() => setVerify({ id: e.id, hash: "" })}>
                  Bütünlüğü doğrula
                </button>
              )}
              {role === "Admin" && e.status === "draft" && (
                <>
                  <button
                    onClick={() =>
                      setDecision({
                        id: e.id,
                        status: "approved",
                        note: "",
                        confirmation: "",
                      })
                    }
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() =>
                      setDecision({
                        id: e.id,
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
            </footer>
            {verify?.id === e.id && (
              <div className="ai-evidence-action">
                <input
                  maxLength={64}
                  value={verify.hash}
                  onChange={(x) =>
                    setVerify({ ...verify, hash: x.target.value })
                  }
                  placeholder="Gözlenen SHA-256"
                />
                <button
                  disabled={busy || verify.hash.length !== 64}
                  onClick={() => void check()}
                >
                  Karşılaştır
                </button>
              </div>
            )}
            {decision?.id === e.id && (
              <div className="ai-evidence-action">
                <textarea
                  rows={2}
                  value={decision.note}
                  onChange={(x) =>
                    setDecision({ ...decision, note: x.target.value })
                  }
                  placeholder="Karar notu"
                />
                <input
                  value={decision.confirmation}
                  onChange={(x) =>
                    setDecision({ ...decision, confirmation: x.target.value })
                  }
                  placeholder={
                    decision.status === "approved" ? "KANITI ONAYLA" : "REDDET"
                  }
                />
                <button
                  disabled={busy || decision.note.length < 5}
                  onClick={() => void decide()}
                >
                  Uygula
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
