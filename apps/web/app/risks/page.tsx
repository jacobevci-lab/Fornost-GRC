import Link from 'next/link';
import { Badge, PageHeader } from '../../components/shell';
import { CreateButton } from '../../components/workflow-actions';
import { risks } from '../../lib/data';
export default function Risks() {
  return (
    <>
      <PageHeader
        eyebrow="Risk yönetimi"
        title="Risk kayıtları"
        description="Tehditleri iş etkisiyle önceliklendirin; sahiplik, tedavi ve vade takibini tek yerde yürütün."
        action={<CreateButton label="Yeni risk" />}
      />
      <div className="table-panel">
        <div className="toolbar">
          <span>{risks.length} aktif risk</span>
          <span>Skor: olasılık × etki</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Risk</th>
                <th>Varlık</th>
                <th>Sahip</th>
                <th>Skor</th>
                <th>Seviye</th>
                <th>Durum</th>
                <th>Vade</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/risks/${r.id}`}>{r.title}</Link>
                  </td>
                  <td>{r.asset}</td>
                  <td>{r.owner}</td>
                  <td>{r.score}</td>
                  <td>
                    <Badge tone={r.level === 'Kritik' ? 'danger' : 'warning'}>{r.level}</Badge>
                  </td>
                  <td>{r.status}</td>
                  <td>{r.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
