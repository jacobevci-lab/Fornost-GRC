import { Badge, PageHeader } from '../../components/shell';
import { CreateButton } from '../../components/workflow-actions';
import { controls } from '../../lib/data';
export default function Assessments() {
  return (
    <>
      <PageHeader
        eyebrow="Kontrol değerlendirme"
        title="Etkinlik ve olgunluk"
        description="Kontrol tasarımını, işletim etkinliğini ve iyileştirme notlarını izlenebilir biçimde puanlayın."
        action={<CreateButton label="Değerlendirme başlat" />}
      />
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Değerlendirme kuyruğu</h2>
            <Badge tone="warning">3 bekliyor</Badge>
          </div>
          {controls.map((c) => (
            <div className="risk-row" key={c.id}>
              <span className="score" style={{ background: '#e6f1ed', color: '#176342' }}>
                {c.maturity}
              </span>
              <div>
                <strong>
                  {c.code} · {c.title}
                </strong>
                <small>
                  {c.owner} · Kapsam %{c.coverage}
                </small>
              </div>
              <Badge tone="info">{c.status}</Badge>
            </div>
          ))}
        </article>
        <aside className="panel">
          <div className="panel-header">
            <h2>Puanlama rehberi</h2>
          </div>
          <div className="timeline">
            <article>
              <strong>0–1 · Tasarlanmamış</strong>
              <small>Süreç kişiye bağlı veya yok.</small>
            </article>
            <article>
              <strong>2–3 · Tanımlı</strong>
              <small>Tekrarlanabilir, kapsama ve kanıta ihtiyaç var.</small>
            </article>
            <article>
              <strong>4–5 · Ölçülen</strong>
              <small>Etkinlik izleniyor ve iyileştiriliyor.</small>
            </article>
          </div>
        </aside>
      </section>
    </>
  );
}
