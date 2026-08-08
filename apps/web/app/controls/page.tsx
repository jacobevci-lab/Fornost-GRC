import Link from 'next/link';
import { Badge, PageHeader } from '../../components/shell';
import { controls } from '../../lib/data';
export default function Controls() {
  return (
    <>
      <PageHeader
        eyebrow="Unified Control Library"
        title="Kontrol kütüphanesi"
        description="Tek kontrol dilini ISO 27001, NIST CSF, SOC 2, CIS, PCI DSS, KVKK ve GDPR gereksinimleriyle eşleyin."
      />
      <div className="table-panel">
        <div className="toolbar">
          <span>{controls.length} örnek kontrol</span>
          <span>Ortalama kapsam %74</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Kontrol</th>
                <th>Sahip</th>
                <th>Olgunluk</th>
                <th>Kapsam</th>
                <th>Çerçeveler</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/controls/${c.id}`}>{c.code}</Link>
                  </td>
                  <td>{c.title}</td>
                  <td>{c.owner}</td>
                  <td>{c.maturity}/5</td>
                  <td>{c.coverage}%</td>
                  <td>{c.frameworks.join(' · ')}</td>
                  <td>
                    <Badge tone="info">{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
