export const sections = [
  "risk",
  "framework",
  "supplier",
  "capa",
  "incident",
] as const;
export type Section = (typeof sections)[number];
export const boardLabels: Record<Section, [string, string]> = {
  risk: ["Risk ve finansal maruziyet", "Risk and financial exposure"],
  framework: ["Çerçeve bazında uyum", "Framework assurance"],
  supplier: [
    "Kritik tedarikçi yoğunlaşması",
    "Critical supplier concentration",
  ],
  capa: ["Açık kritik CAPA", "Open critical CAPAs"],
  incident: ["Güvenlik olayları", "Security incidents"],
};
export type Board = {
  title: string;
  at: string;
  lang: "tr" | "en";
  sections: { title: string; rows: [string, string][] }[];
};
