export default function NavIcon({ module }: { module: string }) {
  let paths;
  switch (module) {
    case "Ana Sayfa":
      paths = (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      );
      break;
    case "Benim İşlerim":
      paths = (<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M9 4V2h6v2"/></>);
      break;
    case "Risk Assessment":
      paths = (
        <>
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      );
      break;
    case "Risk İştahı ve KRI":
      paths = (
        <>
          <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
          <path d="m4 8 6-4 6 5 5-6" />
        </>
      );
      break;
    case "Bulgular ve CAPA":
      paths = (
        <>
          <path d="M9 3h6l1 2h3v16H5V5h3l1-2Z" />
          <path d="m8 13 2.5 2.5L16 10" />
          <path d="M9 8h6" />
        </>
      );
      break;
    case "BIA":
      paths = (
        <>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </>
      );
      break;
    case "İş Sürekliliği":
      paths = (
        <>
          <path d="M4 13a8 8 0 1 1 2.3 5.7" />
          <path d="M4 18v-5h5" />
          <path d="M12 7v5l3 2" />
        </>
      );
      break;
    case "Varlık Envanteri":
      paths = (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 4v16" />
        </>
      );
      break;
    case "Uyum":
      paths = (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      );
      break;
    case "Politika Merkezi":
      paths = (
        <>
          <path d="M6 3h9l4 4v14H6V3Z" />
          <path d="M15 3v5h5M9 12h7M9 16h7" />
          <path d="m3 12 2 2 3-4" />
        </>
      );
      break;
    case "Tedarikçiler":
      paths = (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        </>
      );
      break;
    case "Kontroller":
      paths = (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
          <circle cx="8" cy="6" r="2" />
          <circle cx="16" cy="12" r="2" />
          <circle cx="10" cy="18" r="2" />
        </>
      );
      break;
    case "Kanıtlar":
      paths = (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="m9 15 2 2 4-4" />
        </>
      );
      break;
    case "Kanıt Otomasyonu":
      paths = (
        <>
          <path d="M4 7h16" />
          <path d="M7 3v8" />
          <path d="M17 3v8" />
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="m8 16 2 2 5-5" />
        </>
      );
      break;
    case "Regülasyon Merkezi":
      paths = (
        <>
          <path d="M5 3h10l4 4v14H5V3Z" />
          <path d="M15 3v5h5" />
          <path d="M8 12h8M8 16h6" />
        </>
      );
      break;
    case "Denetim Yönetimi":
      paths = (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 3v4h6V3" />
          <path d="m8 13 2 2 5-5" />
        </>
      );
      break;
    case "Raporlar":
      paths = (
        <>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="m7 15 4-4 3 2 5-6" />
        </>
      );
      break;
    case "Bağlantılı GRC":
      paths = (
        <>
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="7" r="3" />
          <circle cx="12" cy="18" r="3" />
          <path d="m8.7 6.3 6.3.4M7.5 8.5l3 6.5M16.5 9.5l-3 5.5" />
        </>
      );
      break;
    case "Sistem Ayarları":
      paths = (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
        </>
      );
      break;
    case "AI Ayarları":
    case "AI Yönetişimi":
    case "Ask Fornost":
      paths = (
        <>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <circle cx="12" cy="12" r="4" />
          <path d="m5.6 5.6 2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
        </>
      );
      break;
    case "Ana Veri Yönetimi":
      paths = (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </>
      );
      break;
    case "İş Akışı Entegrasyonları":
      paths = (
        <>
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M8.5 7.5 15.5 16.5" />
          <path d="M15 6h4v4" />
          <path d="m19 6-5 5" />
        </>
      );
      break;
    case "E-posta ve Bildirimler":
      paths = (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </>
      );
      break;
    case "Kimlik ve Erişim":
      paths = (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M18 10h4" />
          <path d="M20 8v4" />
        </>
      );
      break;
    default:
      paths = <circle cx="12" cy="12" r="8" />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
}
