import Link from 'next/link';
import { Boxes, FileCheck2, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, PageHeader } from '../components/shell';
import { risks } from '../lib/data';

const metrics: [string, string, string, LucideIcon][] = [
  ['Kritik varlıklar', '8', '2 yeni', Boxes],
  ['Açık riskler', '17', '4 yüksek öncelik', TriangleAlert],
  ['Kontrol kapsamı', '%68', '+6 puan', ShieldCheck],
  ['Bekleyen kanıt', '12', '5 süresi yaklaşıyor', FileCheck2],
];

export default function Dashboard() {
  return (
    <>
      <PageHeader
        eyebrow="8 Ağustos 2026 · Risk görünümü"
        title="Güvenlik duruşu, tek bakışta."
        description="Kritik varlıklardan açık bulgulara kadar kurumun GRC nabzını izleyin ve öncelikli işlere geçin."
      />
      <section className="metrics" aria-label="Temel göstergeler">
        {metrics.map(([label, value, note, Icon]) => (
          <article className="metric" key={String(label)}>
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon">
                <Icon size={16} />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Öncelikli riskler</h2>
            <Link href="/risks">Tümünü gör →</Link>
          </div>
          {risks.map((risk) => (
            <div className="risk-row" key={risk.id}>
              <span className="score">{risk.score}</span>
              <div>
                <strong>{risk.title}</strong>
                <small>
                  {risk.asset} · {risk.owner}
                </small>
              </div>
              <Badge tone={risk.level === 'Kritik' ? 'danger' : 'warning'}>{risk.level}</Badge>
            </div>
          ))}
        </article>
        <article className="panel">
          <div className="panel-header">
            <h2>Çerçeve kapsamı</h2>
            <Link href="/controls">Kontroller →</Link>
          </div>
          <div className="frameworks">
            {[
              ['ISO 27001', 82],
              ['NIST CSF 2.0', 71],
              ['KVKK', 64],
              ['SOC 2', 52],
            ].map(([name, value]) => (
              <div className="framework-line" key={String(name)}>
                <strong>{name}</strong>
                <div className="progress">
                  <span style={{ width: `${value}%` }} />
                </div>
                <span>{value}%</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
