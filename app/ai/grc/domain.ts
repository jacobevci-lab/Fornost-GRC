export type Lang='tr'|'en';
export type Source={id:string;code:string;kind:'policy'|'control'|'evidence';text:string;hash:string;classification:string;controlRefs?:string[];implemented?:boolean;supportsImplementation?:boolean};
export type Answer={code?:string;category?:string;question:string;status:'yes'|'partial'|'no';answer:string;confidence:number;sources:Source[];approvedBy?:string;approvedAt?:string};
export const say=(lang:Lang,tr:string,en:string)=>lang==='tr'?tr:en;
export const fold=(v:unknown)=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/ı/g,'i');
const concepts:[RegExp,string][]=[[/^(erisim|access)/,'access'],[/^(zorunlu|enforce|mandatory)/,'enforced'],[/^(ayricalik|privileg)/,'privileged'],[/^(uretim|production)/,'production'],[/^(sistem|system)/,'system'],[/^(sifrele|encrypt)/,'encryption'],[/^(yedek|backup)/,'backup'],[/^(sakla|retention)/,'retention'],[/^(silme|delet)/,'deletion'],[/^(kisisel|personal)/,'personal'],[/^(veri|data)$/,'data'],[/^(politika|polic)/,'policy'],[/^(kanit|evidence)/,'evidence'],[/^(tedarik|vendor|supplier)/,'vendor'],[/^(insan|human)/,'human'],[/^(onay|approv)/,'approval'],[/^(review|gozden)/,'review'],[/^(maskele|redact)/,'redaction']];
export function tokens(v:string){const words=(fold(v).match(/[a-z0-9]{3,}/g)||[]).map(x=>concepts.find(([re])=>re.test(x))?.[1]||x);return [...new Set(words)].filter(x=>!['the','and','are','our','your','with','that','for','does','have','olan','icin','bir','ile','veya','olarak','nedir'].includes(x));}
export function overlap(a:string,b:string){const words=tokens(a),other=new Set(tokens(b));return words.length?words.filter(x=>other.has(x)).length/words.length:0;}
export const safeCell=(value:unknown)=>{const text=String(value??'');return /^[\s\u0000-\u001f]*[=+@-]/.test(text)?`'${text}`:text;};
export function csv(rows:unknown[][]){return '\uFEFF'+rows.map(row=>row.map(v=>'"'+safeCell(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
export function parseCsv(text:string){
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(ch===','||ch==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(ch==='\n'){rows.push(row);row=[];}}else cell+=ch;}
 if(quoted)throw new Error('CSV_QUOTES');row.push(cell.replace(/\r$/,''));rows.push(row);return rows.filter(r=>r.some(x=>x.trim()));
}
export function draftAnswer(question:string,sources:Source[],lang:Lang):Answer{
 const matches=sources.map(s=>({s,score:overlap(question,s.text)})).filter(x=>x.score>=.18).sort((a,b)=>b.score-a.score);
 const control=matches.find(x=>x.s.kind==='control'),policy=matches.find(x=>x.s.kind==='policy'),evidence=matches.find(x=>x.s.kind==='evidence'&&control&&x.s.controlRefs?.some(ref=>ref===control.s.id||ref===control.s.code));
 const chosen=[policy,control,evidence,...matches].filter((x):x is {s:Source;score:number}=>!!x).filter((x,i,all)=>all.findIndex(v=>v.s.id===x.s.id)===i).slice(0,4);
 const refs=chosen.map(x=>({...x.s,text:x.s.text.slice(0,1500)}));const confidence=refs.length?Math.min(85,Math.round(20+matches[0].score*60)):0;
 return {question,status:refs.length?'partial':'no',confidence,sources:refs,answer:refs.length?say(lang,'İlgili onaylı kaynaklar aşağıdadır. Kapsam ve karşılanma düzeyi uzman tarafından doğrulanmalıdır: ','Relevant approved sources follow. An expert must verify scope and fulfillment: ')+refs.map(s=>s.code+': '+s.text.slice(0,400)).join('\n'):say(lang,'Bu soruyu doğrulayan onaylı kaynak bulunamadı. Yol haritası ve mevcut durum insan incelemesi gerektirir.','No approved source substantiates this question. Roadmap and current status require human review.')};
}
export function sourcesCurrent(answer:Answer,current:Source[]){return answer.sources.every(old=>current.some(s=>s.id===old.id&&s.hash===old.hash));}
export const instructionLike=(value:string)=>/ignore (?:all |the |any )?(?:previous|prior|system) instructions|system\s*(?:prompt|message)\s*:|(?:^|\n)\s*(?:system|assistant|developer)\s*:|<\/?(?:system|assistant|tool)|call (?:the )?tool|approve (?:all |the )?(?:evidence|vendor)|önceki talimatları|sistem talimatlarını|kanıt[ıi] onayla/i.test(value);
export function canClaimMet(answer:Answer){
 const policies=answer.sources.filter(s=>s.kind==='policy'&&/^POL-\d{3,}$/.test(s.code));
 const controls=answer.sources.filter(s=>s.kind==='control'&&s.implemented&&/^CTL-\d{3,}$/.test(s.code));
 return policies.length>0&&controls.some(c=>answer.sources.some(e=>e.kind==='evidence'&&e.supportsImplementation&&/^EVD-\d{3,}$/.test(e.code)&&e.controlRefs?.some(ref=>ref===c.id||ref===c.code)));
}
export function applyQuestionnaireModelDrafts(answers:Answer[],output:string){
 try{const parsed=JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g,''));for(const item of parsed.answers||[]){
  if(!Number.isInteger(item.index))continue;const a=answers[item.index];
  if(!a||typeof item.answer!=='string'||!item.answer.trim()||item.answer.length>6000||instructionLike(item.answer)||!Array.isArray(item.quotes)||!item.quotes.length||item.quotes.length>12)continue;
  if(!item.quotes.every((q:{id:string;quote:string})=>typeof q.quote==='string'&&q.quote.length>=20&&!instructionLike(q.quote)&&a.sources.some(s=>s.id===q.id&&s.text.includes(q.quote))))continue;
  const quoted=a.sources.filter(s=>item.quotes.some((q:{id:string})=>q.id===s.id));
  // A model may select exact excerpts; free-form prose cannot upgrade assurance or invent claims.
  a.status=item.status==='yes'&&canClaimMet({...a,sources:quoted})?'yes':item.status==='no'?'no':'partial';
  a.answer=item.quotes.map((q:{id:string;quote:string})=>a.sources.find(s=>s.id===q.id)!.code+': '+q.quote).join('\n');
 }}catch{/* Preserve rules drafts when the response is malformed. */}
 return answers;
}
export function mergeVendorExtraction(base:ReturnType<typeof analyzeVendor>,output:string,text:string){
 try{const parsed=JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g,''));
  const quotes=(input:unknown)=>Array.isArray(input)?input.filter((q):q is string=>typeof q==='string'&&q.length>=10&&q.length<=1500&&text.includes(q)&&!instructionLike(q)).slice(0,20):[];
  for(const key of ['period','subprocessors','opinionQuotes'] as const)base[key]=[...new Set([...base[key],...quotes(parsed[key]).filter(q=>analyzeVendor(q)[key].length)])].slice(0,20);
  // Opinion and freshness are derived from the document, never from model assertions.
  for(const item of Array.isArray(parsed.items)?parsed.items.slice(0,40):[])if(['exception','cuec'].includes(item.kind)&&quotes([item.quote]).length&&analyzeVendor(item.quote).items.some(x=>x.kind===item.kind)&&!base.items.some(x=>x.quote===item.quote&&x.kind===item.kind))base.items.push({kind:item.kind,quote:item.quote});
 }catch{/* Exact document excerpts remain available when extraction fails. */}
 return base;
}
export function reviewEvidence(text:string,controls:Source[],lang:Lang,ocr=false,now=new Date()){
 const dates=[...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m=>m[1]).filter(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d);
 const recent=dates.some(d=>Date.parse(d)<=now.getTime()&&Date.parse(d)>=now.getTime()-90*86400000);
 const negative=/\b(disabled|report[ -]?only|not enforced|not enabled|not configured)\b|devre d[ıi][şs][ıi]|yaln[ıi]zca rapor/i.test(text);
 const positive=!negative&&/\b(enforced|enabled|mandatory|encrypted)\b|zorunlu|etkin|[şs]ifreli/i.test(text);
 const matched=controls.length>0&&controls.every(c=>overlap(c.text,text)>=.15);
 const dimensions=[
  {key:'recency',score:recent?75:dates.length?25:0,detail:dates.length?say(lang,'Belgede görülen tarihler: ','Dates observed in document: ')+dates.slice(0,8).join(', '):say(lang,'Belgede tarih bulunamadı.','No document date found.')},
  {key:'scope',score:matched?65:0,detail:matched?say(lang,'Kontrol terimleriyle örtüşme var; sistem kapsamını doğrulayın.','Control terms overlap; verify the actual system scope.'):say(lang,'Bağlı kontrol veya kapsam eşleşmesi doğrulanamadı.','Linked control or scope match could not be verified.')},
  {key:'configuration',score:positive?70:0,detail:negative?say(lang,'Disabled / Report-Only / zorunlu olmayan yapılandırma tespit edildi.','Disabled / Report-Only / non-enforced configuration detected.'):positive?say(lang,'Etkin yapılandırma terimi görüldü; kapsam ve istisnaları doğrulayın.','Enabled configuration term found; verify scope and exceptions.'):say(lang,'Yapılandırma etkinliği belirsiz.','Configuration effectiveness is unknown.')},
  {key:'completeness',score:text.length>=100&&dates.length&&controls.length?60:0,detail:say(lang,'Metin uzunluğu: ','Text length: ')+text.length+say(lang,'. Kanıt tek başına işletim etkinliğini ispatlamaz.','. A document alone does not prove operating effectiveness.')},
 ];
 return {dimensions,confidence:Math.min(ocr?40:80,Math.round(dimensions.reduce((n,d)=>n+d.score,0)/4)),findings:dimensions.filter(d=>d.score<60).map(d=>d.detail),decision:negative?'remediation':'human-review',ocr,controls:controls.map(c=>({id:c.id,code:c.code,hash:c.hash})),note:say(lang,'AI ön incelemesidir. Onay yetkisi bağımsız insan doğrulayıcıdadır.','AI preliminary review. Approval remains with an independent human reviewer.')};
}
export type VendorItem={kind:'exception'|'cuec';quote:string};
export function analyzeVendor(text:string,now=new Date()){
 const raw=text.split(/\n/).map(s=>s.trim()).filter(Boolean),ignoredInstructionCount=raw.filter(instructionLike).length;
 const lines=raw.filter(s=>!instructionLike(s)).flatMap(s=>s.split(/(?<=[.!?])\s+/)).filter(Boolean);
 const pick=(re:RegExp)=>lines.filter(s=>re.test(s)).slice(0,20).map(s=>s.slice(0,1500));
 const qualified=pick(/\bqualified opinion|\badverse opinion|[şs]artl[ıi] g[öo]r[üu][şs]|olumsuz g[öo]r[üu][şs]/i);
 const unqualified=pick(/unqualified opinion|unmodified opinion|[şs]arts[ıi]z g[öo]r[üu][şs]/i);
 const exceptions=pick(/exception|deviation|istisna|critical vulnerability|high.risk finding|kritik zafiyet|critical finding|kritik bulgu/i).filter(s=>/critical vulnerability|critical finding|kritik (?:zafiyet|bulgu)/i.test(s)&&!/no critical|kritik (?:bulgu|zafiyet) (?:yok|bulunmadı)/i.test(s)||!(/no exceptions|without exceptions|istisna bulunmad[ıi]|no critical|kritik (?:bulgu|zafiyet) (?:yok|bulunmadı)/i.test(s)));
 const cuecs=pick(/CUEC|complementary user entity|customer responsib|m[üu][şs]teri.*sorumlu|tamamlay[ıi]c[ıi] kontrol/i);
 const period=pick(/period|covering|d[öo]nem|valid until|expir|ge[çc]erlilik|son ge[çc]erlilik/i).slice(0,6);
 const dates=(s:string)=>(s.match(/\b20\d{2}[-/]\d{2}[-/]\d{2}\b/g)||[]).map(d=>d.replaceAll('/','-')).filter(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d);
 const ranges=period.filter(p=>/period|covering|d[öo]nem/i.test(p)).map(dates).filter(d=>d.length===2&&d[0]<=d[1]);
 const range=ranges.length===1?ranges[0]:[],expires=period.filter(p=>/valid until|expir|son ge[çc]erlilik/i.test(p)).flatMap(dates);
 const today=now.toISOString().slice(0,10),end=range[1]||'',expiry=expires.length===1?expires[0]:'';
 const state=expiry&&expiry<today?'expired':range[0]>today||end>today?'future':end?(now.getTime()-Date.parse(end)>365*86400000?'stale':'current'):'unknown';
 const critical=exceptions.some(s=>/critical|kritik/i.test(s));
 return {opinion:qualified.length?'qualified':unqualified.length?'unqualified':'unknown',conclusion:critical?'critical':qualified.length||exceptions.length?'qualified':unqualified.length?'unqualified':'unknown',opinionQuotes:[...qualified,...unqualified],period,validity:{state,start:range[0]||'',end,expiry,asOf:today},ignoredInstructionCount,subprocessors:pick(/sub.?processor|subservice|alt y[üu]klenici|alt i[şs]leyen/i),items:[...exceptions.map(quote=>({kind:'exception' as const,quote})),...cuecs.map(quote=>({kind:'cuec' as const,quote}))] as VendorItem[]};
}
