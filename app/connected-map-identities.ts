import {contextId,type MapContextEdge} from './connected-map-context';
import {withBasePath} from './base-path';
import type {ConnectedGrcRow as Row} from './connected-grc-model';
import {isShortCode} from './connected-map-model';

const workKinds=new Set(['vendor-assessment','vendor-finding','policy-version','policy-exception','regulatory-change','regulatory-impact','continuity-gap']);
export function registryKey(row:Row){
  if(!row.id.startsWith('enterprise:'))return row.id;
  const kind=String(row.data.kind),id=String((row.data.canonicalRefs as string[])?.[0]||'');
  if(kind==='vendor')return String(row.data.vendorId);
  if(kind==='ai-model'||kind==='policy')return id;
  if(kind==='finding'||kind==='finding-manual')return 'work:finding:'+id;
  if(workKinds.has(kind))return 'work:'+kind+':'+id;
  return row.id;
}
export async function mapCodes(rows:Row[],signal:AbortSignal){
  const edges:MapContextEdge[]=[],codes:Record<string,string>={};
  for(let i=0;i<rows.length;i+=200){
    const response=await fetch(withBasePath('/api/connected-grc/codes'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys:rows.slice(i,i+200).map(registryKey),ids:rows.slice(i,i+200).map(contextId)}),signal,cache:'no-store'});
    if(!response.ok)throw Error('codes unavailable');
    const result=await response.json();Object.assign(codes,result.codes);edges.push(...result.edges);
  }
  return {edges,rows:rows.map(row=>{const code=codes[registryKey(row)];return isShortCode(code)&&code!==row.code?{...row,code,data:{...row.data,aliasRefs:[...Array.isArray(row.data.aliasRefs)?row.data.aliasRefs:[],row.code].filter(Boolean)}}:row})};
}
