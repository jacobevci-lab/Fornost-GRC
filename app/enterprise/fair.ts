export const currencies = ['TRY','USD','EUR'] as const;
export type Currency = typeof currencies[number];
export type Estimate = {currency:Currency; frequency:number; minimum:number; likely:number; maximum:number};
const keys = ['frequency','minimum','likely','maximum'] as const;
export function readEstimate(input:unknown):Estimate|null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw=input as Record<string,unknown>;
  if (!currencies.includes(raw.currency as Currency)) return null;
  const numbers=keys.map(key=>{
    const v=raw[key];
    if ((typeof v!=='number' && typeof v!=='string') || !/^\d{1,12}(\.\d{1,2})?$/.test(String(v))) return NaN;
    return Number(v);
  });
  const [frequency,minimum,likely,maximum]=numbers;
  return numbers.every(Number.isFinite) && frequency>=1 && frequency<=100 && minimum<=likely && likely<=maximum
    ? {currency:raw.currency as Currency,frequency,minimum,likely,maximum} : null;
}
// Beta-PERT mean severity multiplied by the annual probability of one loss event.
// Round once, to the nearest minor currency unit.
export function annualLossMinor(e:Estimate):bigint {
  const cents=(v:number)=>BigInt(Math.round(v*100));
  return ((cents(e.minimum)+BigInt(4)*cents(e.likely)+cents(e.maximum))*cents(e.frequency)+BigInt(30000))/BigInt(60000);
}
export function singleLossMinor(e:Estimate):bigint {
  const cents=(v:number)=>BigInt(Math.round(v*100));
  return (cents(e.minimum)+BigInt(4)*cents(e.likely)+cents(e.maximum)+BigInt(3))/BigInt(6);
}
export function exposure(rows:ReadonlyArray<{data:Record<string,unknown>}>) {
  const totals=new Map<Currency,bigint>();let measured=0;
  for(const row of rows){const e=readEstimate(row.data.fairLite);if(!e)continue;measured++;totals.set(e.currency,(totals.get(e.currency)??BigInt(0))+annualLossMinor(e));}
  return {totals,measured,total:rows.length};
}
export function money(amount:bigint,currency:Currency,tr:boolean){
  const nf=new Intl.NumberFormat(tr?'tr-TR':'en-US',{style:'currency',currency,minimumFractionDigits:2});
  return nf.formatToParts(amount/BigInt(100)).map(p=>p.type==='fraction'?(amount%BigInt(100)).toString().padStart(2,'0'):p.value).join('');
}
