import Link from 'next/link';
import { Badge, PageHeader } from '../../components/shell';
import { findings } from '../../lib/data';
export default function Findings() {
  return (
    <>
      <PageHeader
        eyebrow="Bulgu ve aksiyon"
        title="Açık bulgular"
        description="Denetim ve değerlendirme bulgularını sahip, vade, aksiyon ve kapanış doğrulamasıyla takip edin."
      />
      <div className="table-panel">
        <div className="toolbar">
          <span>{findings.length} açık bulgu</span>
          <span>1 yüksek öncelik</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Bulgu</th>
                <th>Kaynak</th>
                <th>Sahip</th>
                <th>Önem</th>
                <th>Durum</th>
                <th>Vade</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/findings/${f.id}`}>{f.title}</Link>
                  </td>
                  <td>{f.source}</td>
                  <td>{f.owner}</td>
                  <td>
                    <Badge tone={f.severity === 'Yüksek' ? 'danger' : 'warning'}>
                      {f.severity}
                    </Badge>
                  </td>
                  <td>{f.status}</td>
                  <td>{f.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
