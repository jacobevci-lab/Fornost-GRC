"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
const initial = {
  modelId: "",
  version: "",
  artifactType: "model",
  source: "",
  supplier: "",
  sha256: "",
  signatureVerified: false,
  signatureIssuer: "",
  license: "",
  sbomReference: "",
  scanner: "",
  scanDate: "",
  malwareClean: false,
  criticalVulnerabilities: 0,
  highVulnerabilities: 0,
  unsafeFormats: false,
  reproducible: false,
  provenance: "",
  validUntil: "",
};
type A = {
  id: string;
  modelId: string;
  version: string;
  artifactType: string;
  supplier: string;
  sha256: string;
  signatureVerified: boolean;
  sbomReference: string;
  scanner: string;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  validUntil: string;
  blockers: string[];
  status: string;
  attention: string;
};
export default function FornostAiSupplyChain() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      artifacts: A[];
      summary: Record<string, number>;
    }>({ models: [], artifacts: [], summary: {} }),
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
    const r = await fetch(withBasePath("/api/ai/supply-chain"), {
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
    const r = await fetch(withBasePath("/api/ai/supply-chain"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      b = await r.json().catch(() => ({}));
    setNotice(
      r.ok
        ? method === "POST"
          ? `Artifact kaydedildi · ${b.blockers?.length || 0} engel`
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
      ? "ARTIFACTI ONAYLA"
      : s === "rejected"
        ? "ARTIFACTI REDDET"
        : "ARTIFACTI EMEKLİ ET";
  return (
    <div className="ai-supply">
      <header>
        <div>
          <small>PROVENANCE · SIGNATURE · SBOM · SCANNING</small>
          <h3>AI Model Supply-Chain Güvencesi</h3>
          <p>
            Üretime alınacak model, adapter, tokenizer ve container
            artifactlarını doğrulayın.
          </p>
        </div>
        <a href={withBasePath("/api/ai/supply-chain?format=csv")}>
          Supply-Chain CSV
        </a>
      </header>
      <div className="stats">
        {[
          ["total", "Artifact"],
          ["approved", "Onaylı"],
          ["blocked", "Engelli"],
          ["expiring", "Süresi yaklaşan"],
          ["vulnerable", "Açıklı"],
        ].map(([k, l]) => (
          <article key={k}>
            <b>{data.summary[k] || 0}</b>
            <span>{l}</span>
          </article>
        ))}
      </div>
      <form onSubmit={create}>
        <b>Yeni model artifactı</b>
        <div className="grid">
          {[
            ["version", "Sürüm"],
            ["source", "Kaynak URL/repo"],
            ["supplier", "Tedarikçi"],
            ["sha256", "SHA-256"],
            ["signatureIssuer", "İmza sağlayıcısı"],
            ["license", "Lisans"],
            ["sbomReference", "SBOM referansı"],
            ["scanner", "Tarama aracı"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                required
                value={String(form[k as keyof typeof form])}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
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
            Artifact türü
            <select
              value={form.artifactType}
              onChange={(e) =>
                setForm({ ...form, artifactType: e.target.value })
              }
            >
              {["model", "adapter", "tokenizer", "container", "bundle"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Tarama tarihi
            <input
              required
              type="date"
              value={form.scanDate}
              onChange={(e) => setForm({ ...form, scanDate: e.target.value })}
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
          <label>
            Kritik açık
            <input
              type="number"
              min="0"
              value={form.criticalVulnerabilities}
              onChange={(e) =>
                setForm({
                  ...form,
                  criticalVulnerabilities: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Yüksek açık
            <input
              type="number"
              min="0"
              value={form.highVulnerabilities}
              onChange={(e) =>
                setForm({
                  ...form,
                  highVulnerabilities: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <label>
          Provenance ve build zinciri
          <textarea
            required
            rows={3}
            value={form.provenance}
            onChange={(e) => setForm({ ...form, provenance: e.target.value })}
          />
        </label>
        <div className="checks">
          {[
            ["signatureVerified", "İmza doğrulandı"],
            ["malwareClean", "Malware taraması temiz"],
            ["reproducible", "Reproducible build"],
            ["unsafeFormats", "Güvensiz format içeriyor"],
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
        <button disabled={busy}>Artifactı Değerlendir</button>
      </form>
      {notice && <div className="notice">{notice}</div>}
      <div className="list">
        {data.artifacts.map((x) => (
          <article key={x.id}>
            <header>
              <div>
                <b>
                  {x.version} · {x.artifactType}
                </b>
                <small>
                  {x.id} · {x.modelId} · {x.supplier}
                </small>
              </div>
              <span>
                {x.status} · {x.attention}
              </span>
            </header>
            <code title={x.sha256}>sha256:{x.sha256.slice(0, 18)}…</code>
            <dl>
              <div>
                <dt>İmza</dt>
                <dd>{x.signatureVerified ? "Doğrulandı" : "Eksik"}</dd>
              </div>
              <div>
                <dt>SBOM</dt>
                <dd>{x.sbomReference}</dd>
              </div>
              <div>
                <dt>Açıklar</dt>
                <dd>
                  {x.criticalVulnerabilities} kritik · {x.highVulnerabilities}{" "}
                  yüksek
                </dd>
              </div>
              <div>
                <dt>Geçerlilik</dt>
                <dd>{x.validUntil}</dd>
              </div>
            </dl>
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
