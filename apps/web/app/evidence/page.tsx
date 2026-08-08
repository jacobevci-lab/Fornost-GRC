import { Badge, PageHeader } from '../../components/shell';
import { CreateButton } from '../../components/workflow-actions';
import { evidence } from '../../lib/data';
export default function Evidence() {
  return (
    <>
      <PageHeader
        eyebrow="Kanıt merkezi"
        title="Kanıtlar"
        description="Kontrol sonuçlarını destekleyen dosya metadata, sahiplik, uygunluk ve geçerlilik durumlarını yönetin."
        action={<CreateButton type="upload" label="Kanıt ekle" />}
      />
      <div className="table-panel">
        <div className="toolbar">
          <span>{evidence.length} kanıt</span>
          <span>İzin verilen: PDF, PNG, JPEG, CSV · en fazla 25 MB</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Kanıt</th>
                <th>Kontrol</th>
                <th>Sahip</th>
                <th>Tür</th>
                <th>Uygunluk</th>
                <th>Geçerlilik</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.name}>
                  <td>
                    <strong>{e.name}</strong>
                  </td>
                  <td>{e.control}</td>
                  <td>{e.owner}</td>
                  <td>{e.type}</td>
                  <td>
                    <Badge tone={e.status === 'Uygun' ? 'success' : 'warning'}>{e.status}</Badge>
                  </td>
                  <td>{e.valid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
