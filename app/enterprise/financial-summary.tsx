'use client';
import {useData} from './client';
import {currencies,money,type Currency} from './fair';
export function FinancialSummary({tr}:{tr:boolean}){
 const {data,error,reload}=useData<{available:boolean;complete?:boolean;total?:number;measured?:number;totals?:Partial<Record<Currency,string>>}>('enterprise/records?view=finance');
 if(data&&!data.available)return null;
 return <section className="ec-exposure"><strong>{tr?'Kurumsal finansal risk maruziyeti (ALE)':'Enterprise financial risk exposure (ALE)'}</strong>
 {error?<><span role="alert">{tr?'Finansal özet yüklenemedi.':'Financial summary unavailable.'}</span><button onClick={reload}>{tr?'Tekrar dene':'Retry'}</button></>:!data?<span role="status">{tr?'Hesaplanıyor…':'Calculating…'}</span>:!data.complete?<span>{tr?'Toplam hesaplanamadı; daha dar bir kapsam seçin.':'Total unavailable; select a narrower scope.'}</span>:<>{data.measured?currencies.filter(c=>data.totals?.[c]!==undefined).map(c=><b key={c}>{money(BigInt(data.totals![c]!),c,tr)}</b>):<span>{tr?'Finansal tahmin girilmemiş':'No financial estimates recorded'}</span>}<small>{data.measured}/{data.total} · {tr?'risk nicelleştirildi. Para birimleri ayrı toplanır; eksik tahmin sıfır risk değildir.':'risks quantified. Currencies remain separate; missing estimates are not zero risk.'}</small></>}
 </section>;
}
