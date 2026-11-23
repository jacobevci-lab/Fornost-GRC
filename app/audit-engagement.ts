import { requestDate } from './audit-requests';

export const auditTypes = [
  ['İç Denetim','Internal audit'],
  ['Dış Belgelendirme Denetimi','External certification audit'],
  ['Gözetim Denetimi','Surveillance audit'],
  ['Müşteri / Tedarikçi Denetimi','Customer / supplier audit'],
  ['Düzenleyici Kurum Denetimi','Regulatory audit'],
] as const;
export const teamEmails = (value:string) => value.split(/[;,\n]/).map(email=>email.trim().toLowerCase()).filter(Boolean);
export const auditEmail = (value:string) => value.length<=254 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value);
export function validateAuditTeam(owner:string, team:string, structured:boolean) {
  const members=teamEmails(team), normalized=owner.trim().toLowerCase();
  if (members.includes(normalized) || (structured && (members.length>20 || new Set(members).size!==members.length || members.some(email=>!auditEmail(email)) || (normalized && !auditEmail(normalized))))) throw new Error('audit-team');
}
export function auditPeriod(start:string,end:string,target:string) {
  if (Boolean(start)!==Boolean(end) || [start,end,target].some(d=>d && !requestDate(d)) || (start && start>end)) throw new Error('audit-dates');
  return start && end ? start+'..'+end : '';
}
export function inAuditPeriod(period:string, collected:string, selected:string) {
  const [from,to]=selected.split('..');
  if(!to || !requestDate(from) || !requestDate(to)) return period===selected;
  let start='',end='';
  const normalized=period.replace(/^Q([1-4])[- ](\d{4})$/i,'$2-Q$1');
  const quarter=/^(\d{4})[- ]?Q([1-4])$/i.exec(normalized);
  if (quarter) {
    const finalMonth=Number(quarter[2])*3;
    start=quarter[1]+'-'+String(finalMonth-2).padStart(2,'0')+'-01';
    end=new Date(Date.UTC(Number(quarter[1]),finalMonth,0)).toISOString().slice(0,10);
  } else if (/^\d{4}$/.test(period)) {start=period+'-01-01';end=period+'-12-31';}
  else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    start=period+'-01';end=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
  } else if (Boolean(requestDate(period))) {start=end=period;}
  else if (/^\d{4}-\d\d-\d\d\.\.\d{4}-\d\d-\d\d$/.test(period)) {[start,end]=period.split('..');}
  else {start=end=collected.slice(0,10);}
  return requestDate(start) && requestDate(end) && start<=end && start>=from && end<=to;
}
