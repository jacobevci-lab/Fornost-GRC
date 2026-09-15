"use client";
import { useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
type Row = {
  id: string;
  systemName: string;
  modelName: string;
  owner: string;
  status: string;
  riskTier: string;
  reviewDate: string;
  highRisks: number;
  criticalIncidents: number;
  openControls: number;
  totalControls: number;
  evidenceCurrent: number;
  redTeamCurrent: boolean;
  transparencyCurrent: boolean;
  assuranceCurrent: boolean;
  releaseStatus: string;
  releaseScore: number;
  actions: string[];
  readiness: number;
};
export default function FornostAiPortfolio() {
  const [data, setData] = useState<{
      generatedAt: string;
      portfolio: Row[];
      actions: {
        modelId: string;
        systemName: string;
        riskTier: string;
        owner: string;
        action: string;
      }[];
      summary: Record<string, number>;
    } | null>(null),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(withBasePath("/api/ai/portfolio"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => null);
    if (response.ok) setData(body);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (loading && !data)
    return <div className="ai-portfolio empty">AI portföyü hazırlanıyor…</div>;
  return (
    <div className="ai-portfolio">
      <header>
        <div>
          <small>ENTERPRISE AI GOVERNANCE · EXECUTIVE ASSURANCE</small>
          <h3>AI Yönetim Özeti</h3>
          <p>
            Tüm AI sistemlerinin risk, kontrol, kanıt, red-team, şeffaflık,
            sürekli güvence ve yayın durumunu tek görünümde yönetin.
          </p>
        </div>
        <div>
          <button onClick={() => void load()}>Yenile</button>
          <a href={withBasePath("/api/ai/portfolio?format=csv")}>Yönetim CSV</a>
        </div>
      </header>
      <div className="stats">
        {[
          ["models", "AI sistemi"],
          ["approved", "Onaylı envanter"],
          ["releaseReady", "Release onaylı"],
          ["criticalAttention", "Kritik dikkat"],
          ["openActions", "Açık aksiyon"],
          ["averageReadiness", "Ort. hazırlık %"],
        ].map(([key, label]) => (
          <article key={key}>
            <b>{data?.summary[key] || 0}</b>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <section className="matrix">
        <header>
          <b>Model güvence matrisi</b>
          <small>
            {data?.generatedAt
              ? new Date(data.generatedAt).toLocaleString("tr-TR")
              : ""}
          </small>
        </header>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>AI sistemi</th>
                <th>Risk</th>
                <th>Hazırlık</th>
                <th>Risk/Olay</th>
                <th>Kontrol</th>
                <th>Kanıt</th>
                <th>Red-team</th>
                <th>Şeffaflık</th>
                <th>Güvence</th>
                <th>Release</th>
              </tr>
            </thead>
            <tbody>
              {data?.portfolio.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.systemName}</b>
                    <small>
                      {row.modelName} · {row.owner}
                    </small>
                  </td>
                  <td>
                    <span className={`risk ${row.riskTier.toLowerCase()}`}>
                      {row.riskTier}
                    </span>
                  </td>
                  <td>
                    <strong>{row.readiness}%</strong>
                  </td>
                  <td
                    className={
                      row.highRisks + row.criticalIncidents ? "bad" : "good"
                    }
                  >
                    {row.highRisks} / {row.criticalIncidents}
                  </td>
                  <td className={row.openControls ? "bad" : "good"}>
                    {row.totalControls - row.openControls}/{row.totalControls}
                  </td>
                  <td className={row.evidenceCurrent ? "good" : "bad"}>
                    {row.evidenceCurrent || "—"}
                  </td>
                  <td className={row.redTeamCurrent ? "good" : "bad"}>
                    {row.redTeamCurrent ? "Hazır" : "Eksik"}
                  </td>
                  <td className={row.transparencyCurrent ? "good" : "bad"}>
                    {row.transparencyCurrent ? "Hazır" : "Eksik"}
                  </td>
                  <td className={row.assuranceCurrent ? "good" : "bad"}>
                    {row.assuranceCurrent ? "Hazır" : "Eksik"}
                  </td>
                  <td>
                    <span className={`release ${row.releaseStatus}`}>
                      {row.releaseStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="queue">
        <header>
          <div>
            <b>Öncelikli aksiyon kuyruğu</b>
            <small>En fazla 100 güncel yönetim aksiyonu</small>
          </div>
          <span>{data?.actions.length || 0}</span>
        </header>
        {!data?.actions.length ? (
          <p>Tüm AI portföy kontrolleri hazır.</p>
        ) : (
          data.actions.map((item, index) => (
            <article key={`${item.modelId}-${item.action}-${index}`}>
              <span>{item.riskTier}</span>
              <div>
                <b>{item.action}</b>
                <small>
                  {item.systemName} · {item.modelId}
                </small>
              </div>
              <em>{item.owner}</em>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
