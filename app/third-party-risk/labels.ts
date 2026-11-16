import {vendorWorkLabels} from './work';

const labels: Record<string, {tr:string;en:string}> = {
  low:{tr:'Düşük',en:'Low'}, medium:{tr:'Orta',en:'Medium'},
  high:{tr:'Yüksek',en:'High'}, critical:{tr:'Kritik',en:'Critical'},
  unassessed:{tr:'Değerlendirilmedi',en:'Not assessed'},
  unmanaged:{tr:'Kapsam dışında',en:'Outside TPRM'},
  'review-overdue':{tr:'İnceleme gecikti',en:'Review overdue'},
  'review-due':{tr:'İnceleme zamanı',en:'Review due'},
  'contract-expired':{tr:'Sözleşme süresi doldu',en:'Contract expired'},
  'critical-finding':{tr:'Kritik bulgu',en:'Critical finding'},
  overdue:{tr:'Gecikmiş',en:'Overdue'},
  public:{tr:'Herkese açık',en:'Public'}, internal:{tr:'Kurum içi',en:'Internal'},
  confidential:{tr:'Gizli',en:'Confidential'}, restricted:{tr:'Kısıtlı',en:'Restricted'},
};

// Presentation only: canonical values remain in forms, API payloads and CSS.
// Preserve unknown values so an unsupported state cannot look approved.
export function vendorLabel(value:string,tr:boolean):string {
  const lang=tr?'tr':'en';
  return vendorWorkLabels[value]?.[lang] || labels[value]?.[lang] || value;
}
