import Link from 'next/link';
import { Badge, PageHeader } from '../../../components/shell';
import { controls } from '../../../lib/data';
export default async function ControlDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = controls.find((x) => x.id === id) ?? controls[0]!;
  return (
    <>
      <PageHeader
        eyebrow={c.code}
        title={c.title}
        description="Yetkilerin iş gereksinimiyle uyumunu periyodik olarak doğrulamak ve gereksiz erişimleri kaldırmak."
        action={
          <Link className="primary" href="/assessments">
            Değerlendir
          </Link>
        }
      />
      <div className="detail-grid">
        <article className="panel">
          <Badge tone="info">Olgunluk {c.maturity}/5</Badge>
          <h2 className="detail-title">Kontrol tasarımı</h2>
          <div className="definition">
            <div>
              <small>Sahip</small>
              <strong>{c.owner}</strong>
            </div>
            <div>
              <small>Kapsam</small>
              <strong>%{c.coverage}</strong>
            </div>
            <div>
              <small>Sıklık</small>
              <strong>Üç aylık</strong>
            </div>
            <div>
              <small>Kanıt gereksinimi</small>
              <strong>Rapor + onay kaydı</strong>
            </div>
          </div>
        </article>
        <aside className="panel">
          <div className="panel-header">
            <h2>Framework eşlemeleri</h2>
          </div>
          {c.frameworks.map((f) => (
            <div className="audit-card" key={f}>
              <strong>{f}</strong>
              <p>Doğrudan eşleme · GRC doğrulandı</p>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
