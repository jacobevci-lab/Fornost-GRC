import Link from 'next/link';
import { Badge, PageHeader } from '../../../components/shell';
import { risks } from '../../../lib/data';
export default async function RiskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = risks.find((x) => x.id === id) ?? risks[0]!;
  return (
    <>
      <PageHeader
        eyebrow={`Risk · ${r.score}/25`}
        title={r.title}
        description="Hatalı yetkilendirme müşteri verisinin açığa çıkmasına ve yasal yükümlülük ihlaline neden olabilir."
        action={
          <Link className="primary" href="/controls">
            Tedavi kontrolü
          </Link>
        }
      />
      <div className="detail-grid">
        <article className="panel">
          <Badge tone={r.level === 'Kritik' ? 'danger' : 'warning'}>{r.level}</Badge>
          <h2 className="detail-title">Risk profili</h2>
          <div className="definition">
            <div>
              <small>Varlık</small>
              <strong>{r.asset}</strong>
            </div>
            <div>
              <small>Sahip</small>
              <strong>{r.owner}</strong>
            </div>
            <div>
              <small>Durum</small>
              <strong>{r.status}</strong>
            </div>
            <div>
              <small>Hedef tarih</small>
              <strong>{r.due}</strong>
            </div>
          </div>
        </article>
        <aside className="panel">
          <div className="panel-header">
            <h2>Tedavi planı</h2>
          </div>
          <div className="timeline">
            <article>
              <strong>RBAC politika setini sadeleştir</strong>
              <small>Devam ediyor · Uygulama Güvenliği</small>
            </article>
            <article>
              <strong>Yetki regresyon testini CI'a ekle</strong>
              <small>Planlandı · 14 Ağu</small>
            </article>
          </div>
        </aside>
      </div>
    </>
  );
}
