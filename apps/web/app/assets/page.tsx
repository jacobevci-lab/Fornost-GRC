import Link from 'next/link';
import { Badge, PageHeader } from '../../components/shell';
import { assets } from '../../lib/data';
export default function Assets() {
  return (
    <>
      <PageHeader
        eyebrow="Envanter"
        title="Varlıklar"
        description="Kritik iş varlıklarının sahiplik, sınıflandırma, risk ve kontrol kapsamını yönetin."
      />
      <div className="table-panel">
        <div className="toolbar">
          <span>{assets.length} varlık</span>
          <span>Son envanter kontrolü: bugün</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Varlık</th>
                <th>Tür</th>
                <th>Sahip</th>
                <th>Sınıf</th>
                <th>Kritiklik</th>
                <th>Risk</th>
                <th>Kontrol</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/assets/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>{a.type}</td>
                  <td>{a.owner}</td>
                  <td>{a.classification}</td>
                  <td>
                    <Badge tone={a.criticality === 'Kritik' ? 'danger' : 'warning'}>
                      {a.criticality}
                    </Badge>
                  </td>
                  <td>{a.risks}</td>
                  <td>{a.controls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
