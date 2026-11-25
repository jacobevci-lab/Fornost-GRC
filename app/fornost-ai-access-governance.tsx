"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Assignment = {
  id: string;
  modelId: string;
  principalType: string;
  principal: string;
  displayName: string;
  accessLevel: string;
  dataScope: string;
  purpose: string;
  owner: string;
  mfa: boolean;
  conditionalAccess: boolean;
  jit: boolean;
  managedIdentity: boolean;
  keyRotationDays: number;
  riskScore: number;
  riskTier: string;
  lastUsed: string;
  expiresAt: string;
  reviewDate: string;
  status: string;
  reviewNote: string | null;
  attention: string;
};
const initial = {
  modelId: "",
  principalType: "user",
  principal: "",
  displayName: "",
  accessLevel: "use",
  dataScope: "Internal",
  purpose: "",
  owner: "",
  mfa: true,
  conditionalAccess: true,
  jit: false,
  managedIdentity: false,
  keyRotationDays: 90,
  lastUsed: "",
  expiresAt: "",
  reviewDate: "",
};
export default function FornostAiAccessGovernance() {
  const [data, setData] = useState<{
      models: { id: string; systemName: string; modelName: string }[];
      assignments: Assignment[];
      summary: Record<string, number>;
    }>({ models: [], assignments: [], summary: {} }),
    [form, setForm] = useState(initial),
    [filter, setFilter] = useState("all"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<{
      id: string;
      action: "certify" | "revoke";
      note: string;
      confirmation: string;
    } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/access-governance"), {
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
    const response = await fetch(withBasePath("/api/ai/access-governance"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? `Erişim incelemeye alındı · ${body.riskTier} (${body.riskScore})`
        : String(body.error || "Erişim kaydedilemedi."),
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
    const response = await fetch(withBasePath("/api/ai/access-governance"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision),
      }),
      body = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? "Erişim kararı kaydedildi."
        : String(body.error || "Karar uygulanamadı."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const visible = data.assignments.filter(
      (a) =>
        filter === "all" ||
        a.attention === filter ||
        a.status === filter ||
        a.riskTier.toLowerCase() === filter,
    ),
    machine = ["service-account", "workload"].includes(form.principalType);
  return (
    <div className="ai-access-governance">
      <header>
        <div>
          <small>AI IDENTITY GOVERNANCE</small>
          <h3>AI Erişim ve Yetki İnceleme Merkezi</h3>
          <p>
            İnsan ve makine kimliklerini en az yetki, süre, MFA/CA, JIT ve
            anahtar yaşam döngüsüyle yönetin.
          </p>
        </div>
        <a href={withBasePath("/api/ai/access-governance?format=csv")}>
          Access Review CSV
        </a>
      </header>
      <div className="ai-access-stats">
        {[
          ["total", "Toplam"],
          ["active", "Aktif"],
          ["highRisk", "Yüksek/Kritik"],
          ["inactive", "90+ gün inaktif"],
          ["overdue", "Süresi geçen"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <nav>
        {[
          ["all", "Tümü"],
          ["pending", "Onay bekleyen"],
          ["critical", "Kritik"],
          ["high", "Yüksek"],
          ["inactive", "İnaktif"],
          ["review-overdue", "İnceleme geciken"],
          ["expired", "Süresi biten"],
          ["revoked", "Kaldırılan"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
          >
            {l}
          </button>
        ))}
      </nav>
      <form className="ai-access-form" onSubmit={create}>
        <b>Yeni AI erişim kaydı</b>
        <div>
          <label>
            <span>AI sistemi</span>
            <select
              required
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
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
            <span>Kimlik türü</span>
            <select
              value={form.principalType}
              onChange={(e) =>
                setForm({
                  ...form,
                  principalType: e.target.value,
                  mfa: !["service-account", "workload"].includes(
                    e.target.value,
                  ),
                  conditionalAccess: !["service-account", "workload"].includes(
                    e.target.value,
                  ),
                  managedIdentity: false,
                })
              }
            >
              {["user", "group", "service-account", "workload"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Kimlik / UPN / Object ID</span>
            <input
              required
              value={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.value })}
            />
          </label>
          <label>
            <span>Görünen ad</span>
            <input
              required
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </label>
          <label>
            <span>Erişim seviyesi</span>
            <select
              value={form.accessLevel}
              onChange={(e) =>
                setForm({ ...form, accessLevel: e.target.value })
              }
            >
              {["use", "read-data", "manage", "admin"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Veri kapsamı</span>
            <input
              required
              value={form.dataScope}
              onChange={(e) => setForm({ ...form, dataScope: e.target.value })}
            />
          </label>
          <label>
            <span>Erişim sahibi</span>
            <input
              required
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </label>
          <label>
            <span>Anahtar rotasyonu (gün)</span>
            <input
              type="number"
              min="1"
              max="365"
              value={form.keyRotationDays}
              onChange={(e) =>
                setForm({ ...form, keyRotationDays: Number(e.target.value) })
              }
            />
          </label>
          <label>
            <span>Son kullanım</span>
            <input
              required
              type="date"
              value={form.lastUsed}
              onChange={(e) => setForm({ ...form, lastUsed: e.target.value })}
            />
          </label>
          <label>
            <span>Erişim bitişi</span>
            <input
              required
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
          <label>
            <span>Sonraki inceleme</span>
            <input
              required
              type="date"
              value={form.reviewDate}
              onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
            />
          </label>
        </div>
        <label>
          <span>İş gerekçesi</span>
          <textarea
            required
            rows={2}
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </label>
        <div className="ai-access-checks">
          {!machine && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={form.mfa}
                  onChange={(e) => setForm({ ...form, mfa: e.target.checked })}
                />
                <span>MFA</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.conditionalAccess}
                  onChange={(e) =>
                    setForm({ ...form, conditionalAccess: e.target.checked })
                  }
                />
                <span>Conditional Access</span>
              </label>
            </>
          )}
          <label>
            <input
              type="checkbox"
              checked={form.jit}
              onChange={(e) => setForm({ ...form, jit: e.target.checked })}
            />
            <span>JIT / süreli yükseltme</span>
          </label>
          {machine && (
            <label>
              <input
                type="checkbox"
                checked={form.managedIdentity}
                onChange={(e) =>
                  setForm({ ...form, managedIdentity: e.target.checked })
                }
              />
              <span>Managed identity</span>
            </label>
          )}
        </div>
        <button disabled={busy}>Erişimi incelemeye gönder</button>
      </form>
      {notice && <p className="ai-access-notice">{notice}</p>}
      <div className="ai-access-list">
        {visible.map((a) => (
          <article key={a.id} className={a.attention}>
            <header>
              <div>
                <small>
                  {a.principalType} · {a.accessLevel}
                </small>
                <b>{a.displayName}</b>
                <code>{a.principal}</code>
              </div>
              <div>
                <em className={a.riskTier.toLowerCase()}>
                  {a.riskTier} · {a.riskScore}
                </em>
                <strong>{a.status}</strong>
              </div>
            </header>
            <p>{a.purpose}</p>
            <dl>
              <div>
                <dt>Veri kapsamı</dt>
                <dd>{a.dataScope}</dd>
              </div>
              <div>
                <dt>Sorumlu</dt>
                <dd>{a.owner}</dd>
              </div>
              <div>
                <dt>Kontroller</dt>
                <dd>
                  {a.mfa && "MFA · "}
                  {a.conditionalAccess && "CA · "}
                  {a.jit && "JIT · "}
                  {a.managedIdentity && "Managed ID · "}Rotasyon{" "}
                  {a.keyRotationDays}g
                </dd>
              </div>
              <div>
                <dt>Yaşam döngüsü</dt>
                <dd>
                  {a.lastUsed} / {a.expiresAt} / {a.reviewDate}
                </dd>
              </div>
            </dl>
            {a.reviewNote && <aside>{a.reviewNote}</aside>}
            <footer>
              {a.status !== "revoked" && (
                <>
                  <button
                    onClick={() =>
                      setDecision({
                        id: a.id,
                        action: "certify",
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
                        id: a.id,
                        action: "revoke",
                        note: "",
                        confirmation: "",
                      })
                    }
                  >
                    Erişimi kaldır
                  </button>
                </>
              )}
            </footer>
            {decision?.id === a.id && (
              <div className="ai-access-decision">
                <textarea
                  rows={2}
                  value={decision.note}
                  onChange={(e) =>
                    setDecision({ ...decision, note: e.target.value })
                  }
                  placeholder="İnceleme gerekçesi"
                />
                <input
                  value={decision.confirmation}
                  onChange={(e) =>
                    setDecision({ ...decision, confirmation: e.target.value })
                  }
                  placeholder={
                    decision.action === "certify"
                      ? "ERİŞİMİ ONAYLA"
                      : "ERİŞİMİ KALDIR"
                  }
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
