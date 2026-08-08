import Link from 'next/link';
import { Badge, PageHeader } from '../../../components/shell';
import { assets } from '../../../lib/data';
export default async function AssetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = assets.find((x) => x.id === id) ?? assets[0]!;
  return (
    <>
      <PageHeader
        eyebrow="Varlık detayı"
        title={a.name}
        description="İş bağlamı, risk maruziyeti ve kontrol kapsamı."
        action={
          <Link className="secondary" href="/risks">
            İlişkili riskler
          </Link>
        }
      />
      <div className="detail-grid">
        <article className="panel">
          <Badge tone="danger">{a.criticality}</Badge>
          <h2 className="detail-title">Varlık profili</h2>
          <div className="definition">
            <div>
              <small>Tür</small>
              <strong>{a.type}</strong>
            </div>
            <div>
              <small>İş sahibi</small>
              <strong>{a.owner}</strong>
            </div>
            <div>
              <small>Veri sınıfı</small>
              <strong>{a.classification}</strong>
            </div>
            <div>
              <small>Kontrol kapsamı</small>
              <strong>{a.controls}</strong>
            </div>
          </div>
        </article>
        <aside className="panel">
          <div className="panel-header">
            <h2>Son hareketler</h2>
          </div>
          <div className="timeline">
            <article>
              <strong>Risk değerlendirmesi güncellendi</strong>
              <small>Bugün · GRC Ekibi</small>
            </article>
            <article>
              <strong>Kontrol kapsamı doğrulandı</strong>
              <small>2 gün önce · IAM Ekibi</small>
            </article>
          </div>
        </aside>
      </div>
    </>
  );
}
