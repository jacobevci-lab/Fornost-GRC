export default function Telemetry({
  data,
  tr,
}: {
  data: Record<string, unknown>;
  tr: boolean;
}) {
  const rows: { label: string; value: string; at: string }[] = [];
  const metrics: Record<string, string> = {
    mfaCoverage: tr ? "MFA kayıt kapsamı (%)" : "MFA registration coverage (%)",
    pimGlobalAdmins: tr
      ? "PIM etkin Global Admin"
      : "PIM-activated Global Admins",
    highRiskSignIns: tr
      ? "Yüksek riskli oturumlar (24 sa.)"
      : "High-risk sign-ins (24h)",
  };
  if (data.identityTelemetry && typeof data.identityTelemetry === "object") {
    for (const [k, v] of Object.entries(data.identityTelemetry)) {
      if (metrics[k] && v && typeof v.value === "number")
        rows.push({
          label: metrics[k],
          value: String(v.value),
          at: String(v.at),
        });
    }
  }
  const categories: Record<string, string> = {
      encryption: tr ? "Şifreleme" : "Encryption",
      "public-storage": tr ? "Herkese açık depolama" : "Public storage",
      iam: "IAM",
    },
    levels: Record<string, string> = tr
      ? {
          low: "Düşük",
          medium: "Orta",
          high: "Yüksek",
          critical: "Kritik",
          resolved: "Giderildi",
        }
      : {
          low: "Low",
          medium: "Medium",
          high: "High",
          critical: "Critical",
          resolved: "Resolved",
        };
  if (data.cloudPosture && typeof data.cloudPosture === "object") {
    for (const [k, v] of Object.entries(data.cloudPosture)) {
      if (v && categories[k] && levels[v.severity])
        rows.push({
          label: v.provider + " · " + categories[k],
          value: levels[v.severity],
          at: String(v.at),
        });
    }
  }
  if (!rows.length) return null;
  return (
    <section className="exchange ex-card">
      <h3>{tr ? "Entegrasyon gözlemleri" : "Integration observations"}</h3>
      {rows.map((r) => (
        <div className="ex-head" key={r.label}>
          <span>{r.label}</span>
          <strong>{r.value}</strong>
          <time>{new Date(r.at).toLocaleString(tr ? "tr" : "en")}</time>
        </div>
      ))}
    </section>
  );
}
