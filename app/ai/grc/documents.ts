import { getDocumentProxy } from 'unpdf';
import { validateEvidenceUpload } from '../../evidence/validate-upload';
import { sha256HexBytes } from '../../evidence/versioning';
import type { Runtime } from './router';
export async function extractDocument(bytes:Uint8Array,name:string,type:string){
 if(bytes.length>10*1024*1024||!bytes.length)throw new Error('AI_FILE_SIZE');
 const mime=validateEvidenceUpload(bytes,name,type);
 if(mime.startsWith('image/'))return {text:'',ocr:true};
 let text='';
 if(mime==='application/pdf'){
  const pdf=await getDocumentProxy(bytes.slice(),{useSystemFonts:false,useWorkerFetch:false,useWasm:false});
  try{
   if(pdf.numPages>150)throw new Error('AI_PAGE_LIMIT');
   for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),t=await p.getTextContent();text+=`\n[${n}] `+t.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('');if(text.length>160000)throw new Error('AI_TEXT_LIMIT');}
  }finally{await pdf.loadingTask.destroy();}
 }else if(/\.(txt|json|csv|log|tsv)$/i.test(name))text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 else throw new Error('AI_FILE_TYPE');
 if(text.length>160000)throw new Error('AI_TEXT_LIMIT');
 return {text:text.replace(/\0/g,'').trim(),ocr:false};
}
export async function storedBytes(env:Runtime,key:string,expectedHash:string){
 let bytes:Uint8Array|undefined;
 if(env.BUCKET){const object=await env.BUCKET.get(key);if(object){bytes=await boundedBytes(object.body,10485760);}}
 if(!bytes){const row=await env.DB.prepare('SELECT content FROM simple_evidence_files WHERE file_key=?').bind(key).first<{content:ArrayBuffer|number[]}>();if(row)bytes=Array.isArray(row.content)?Uint8Array.from(row.content):new Uint8Array(row.content);}
 if(!bytes||await sha256HexBytes(bytes)!==expectedHash)throw new Error('AI_FILE_INTEGRITY');return bytes;
}

export async function boundedBytes(stream:ReadableStream,max:number){const reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>max)throw new Error('AI_FILE_SIZE');chunks.push(part.value);}}finally{await reader.cancel();}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
