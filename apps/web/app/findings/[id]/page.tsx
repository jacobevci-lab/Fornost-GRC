import { Badge, PageHeader } from '../../../components/shell';
import { CreateButton } from '../../../components/workflow-actions';
import { findings } from '../../../lib/data';
export default async function FindingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = findings.find((x) => x.id === id) ?? findings[0]!;
  return (
    <>
      <PageHeader
        eyebrow="Bulgu detayı"
        title={f.title}
        description="Bir örnek kullanıcı hesabı, işten ayrılma SLA'sı sonrasında aktif kalmıştır. Kök neden ve telafi edici kontrol doğrulanmalıdır."
        action={<CreateButton label="Aksiyon ekle" />}
      />
      <div className="detail-grid">
        <article className="panel">
          <Badge tone="danger">{f.severity}</Badge>
          <h2 className="detail-title">Kapanış kriterleri</h2>
          <div className="definition">
            <div>
              <small>Kaynak</small>
              <strong>{f.source}</strong>
            </div>
            <div>
              <small>Sahip</small>
              <strong>{f.owner}</strong>
            </div>
            <div>
              <small>Hedef tarih</small>
              <strong>{f.due}</strong>
            </div>
            <div>
              <small>Doğrulayan</small>
              <strong>İç Denetim</strong>
            </div>
          </div>
        </article>
        <aside className="panel">
          <div className="panel-header">
            <h2>Aksiyonlar</h2>
          </div>
          <div className="timeline">
            <article>
              <strong>Offboarding entegrasyonunu yeniden çalıştır</strong>
              <small>Devam ediyor · IAM Ekibi</small>
            </article>
            <article>
              <strong>Son 90 günü geriye dönük tara</strong>
              <small>Planlandı · 12 Ağu</small>
            </article>
          </div>
        </aside>
      </div>
    </>
  );
}
