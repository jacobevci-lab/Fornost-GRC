import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {withBasePath} from './base-path';
import type {reportSnapshot} from './report-export';

type Snapshot=ReturnType<typeof reportSnapshot>;
export async function renderReportPdf(s:Snapshot,suppliedFont?:Uint8Array){
 let fontBytes=suppliedFont;
 if(!fontBytes){const response=await fetch(withBasePath('/fonts/FornostReportSans.ttf'),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Report font unavailable');fontBytes=new Uint8Array(await response.arrayBuffer());}
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fontBytes,{subset:true}),characters=new Set(font.getCharacterSet());
 doc.setTitle(s.title);doc.setAuthor(s.preparedBy);doc.setSubject(`${s.id} | ${s.classification} | ${s.scope}`);doc.setCreator('Fornost GRC');doc.setCreationDate(new Date(s.generatedAt));
 const ink=rgb(.15,.15,.15),accent=rgb(.58,.26,.06),line=rgb(.85,.82,.78),muted=rgb(.35,.35,.35),pale=rgb(.965,.953,.937);
 const width=842,height=595,margin=36,usable=width-margin*2;
 let page:PDFPage,y=0;
 const safe=(value:unknown)=>{const raw=String(value??'—').replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');for(const ch of raw)if(ch!=='\n'&&!characters.has(ch.codePointAt(0)!))throw new Error('Unsupported report character; use HTML or CSV to preserve the original text.');return raw;};
 const wrap=(value:unknown,max:number,size:number)=>{
  const output:string[]=[];
  for(const paragraph of safe(value).split('\n')){
   let current='';
   for(const ch of paragraph){if(current&&font.widthOfTextAtSize(current+ch,size)>max){output.push(current);current=ch;}else current+=ch;}
   output.push(current);
  }
  return output;
 };
 const addPage=()=>{page=doc.addPage([width,height]);page.drawRectangle({x:margin,y:height-30,width:usable,height:3,color:accent});page.drawText('FORNOST GRC',{x:margin,y:height-46,size:9,font,color:accent});y=height-65;};
 const ensure=(needed:number)=>{if(y-needed<45)addPage();};
 const paragraph=(value:unknown,size=10,color=ink)=>{for(const valueLine of wrap(value,usable,size)){ensure(size+6);page.drawText(valueLine,{x:margin,y,size,font,color});y-=size+5;}y-=5;};
 addPage();paragraph(s.title,21,accent);
 paragraph(`${s.tr?'Rapor kimliği':'Report ID'}: ${s.id} · ${s.classification}`,10,muted);
 paragraph(`${s.tr?'Oluşturma (UTC)':'Generated (UTC)'}: ${s.generatedAt} · ${s.tr?'Hazırlayan':'Prepared by'}: ${s.preparedBy}`,9,muted);
 paragraph(`${s.tr?'Kapsam':'Scope'}: ${s.records.length} ${s.tr?'kayıt':'records'} · ${s.template==='detailed'?(s.tr?'Detaylı kayıt dökümü':'Detailed register'):(s.tr?'Yönetim özeti':'Management summary')}`,11);
 paragraph(s.scope,9);
 paragraph(s.filters.map(f=>`${f.label}: ${f.value}`).join(' · ')||(s.tr?'Ek filtre yok':'No additional filters'),9);
 paragraph(s.tr?'Yönetim göstergeleri':'Management indicators',14,accent);
 for(const metric of s.metrics){paragraph(`${metric.label}: ${metric.value}`,12);paragraph(metric.note,9,muted);}
 paragraph(s.tr?'Veri kalitesi / eksik alanlar':'Data quality / missing fields',12,accent);
 paragraph(s.quality.map(q=>`${q.label}: ${q.missing}`).join(' · '),9);
 paragraph(s.tr?'Anlık görüntü; geçmiş dönem eğilimi veya bağımsız denetim görüşü değildir.':'Point-in-time snapshot; not a historical trend or an independent audit opinion.',9,muted);
 addPage();paragraph(s.tr?'Kayıt dökümü':'Record register',15,accent);
 const widths=[65,94,190,82,118,110,111],size=8.5,leading=12;
 const drawRow=(cells:string[],header=false)=>{
  const lines=cells.map((value,i)=>wrap(value,widths[i]-10,size));let offset=0;const count=Math.max(...lines.map(v=>v.length));
  while(offset<count){
   if(y-24<45){addPage();if(!header)drawRow(s.labels,true);}
   const take=Math.min(count-offset,Math.max(1,Math.floor((y-45-10)/leading))),rowHeight=take*leading+10;
   if(header)page.drawRectangle({x:margin,y:y-rowHeight,width:usable,height:rowHeight,color:pale});
   let x=margin;
   lines.forEach((cell,index)=>{cell.slice(offset,offset+take).forEach((value,j)=>page.drawText(value,{x:x+5,y:y-12-j*leading,size,font,color:header?accent:ink}));x+=widths[index];});
   page.drawLine({start:{x:margin,y:y-rowHeight},end:{x:width-margin,y:y-rowHeight},thickness:.5,color:line});
   y-=rowHeight;offset+=take;
   if(offset<count){addPage();if(!header)drawRow(s.labels,true);}
  }
 };
 drawRow(s.labels,true);
 for(let i=0;i<s.records.length;i++){drawRow(s.records[i].cells);if(i%100===0)await new Promise(resolve=>setTimeout(resolve,0));}
 if(!s.records.length)paragraph(s.tr?'Seçili kapsamda kayıt yok.':'No records in the selected scope.');
 if(s.template==='detailed'){
  addPage();paragraph(s.tr?'Kayıt ayrıntıları':'Record details',15,accent);
  for(const record of s.records){ensure(45);paragraph(`${record.cells[0]} · ${record.cells[2]}`,12,accent);for(const field of record.fields){paragraph(`${field.label} [${field.key}]`,9,muted);paragraph(field.value||'—',9);}y-=8;}
 }
 const pages=doc.getPages();pages.forEach((p,index)=>{p.drawLine({start:{x:margin,y:30},end:{x:width-margin,y:30},thickness:.5,color:line});p.drawText(`${s.classification} · ${s.id}`,{x:margin,y:17,size:8,font,color:muted});p.drawText(`${index+1} / ${pages.length}`,{x:width-margin-50,y:17,size:8,font,color:muted});});
 const bytes=await doc.save();return new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
}
