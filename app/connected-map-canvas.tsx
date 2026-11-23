"use client";
import {useId,useMemo,useState,useEffect,useRef} from 'react';
import {domainStatusLabel} from './domain-identity';
import NavIcon from './nav-icon';
import type {ConnectedGrcRow as Row,ConnectedGrcLink as Link} from './connected-grc-model';
import {recordOwner} from './connected-grc-workbench-model';
import {layers,layerOf,mapCode,mapTitle,arrowText,connectedComponent,mapStats} from './connected-map-model';

const nodeWidth=166,nodeHeight=118,columnWidth=260,pitch=170;
const tones:Record<string,string>={'Kontroller':'var(--ws-brand)','Kanıtlar':'var(--ws-positive)','Risk Assessment':'var(--ws-warning)','Bulgular ve CAPA':'var(--ws-danger)','Güvenlik Olayları':'var(--ws-danger)','Politika Merkezi':'var(--ws-brand-2)','Tedarikçiler':'var(--ws-warning)','Uyum':'var(--ws-positive)'};
const statusNames:Record<string,[string,string]>={
  declared:['Beyan edildi','Declared'],triage:['Ön inceleme','Triage'],contained:['Sınırlandırıldı','Contained'],resolved:['Çözüldü','Resolved'],onboarding:['Kabul sürecinde','Onboarding'],suspended:['Askıya alındı','Suspended'],retired:['Emekli','Retired'],submitted:['İncelemede','Submitted'],cancelled:['İptal edildi','Cancelled'],archived:['Arşivlendi','Archived'],healthy:['Sağlıklı','Healthy'],stale:['Bayat','Stale'],failing:['Başarısız','Failing'],pending:['Bekliyor','Pending'],
  active:['Aktif','Active'],Aktif:['Aktif','Active'],draft:['Taslak','Draft'],approved:['Onaylı','Approved'],Onaylandı:['Onaylandı','Approved'],open:['Açık','Open'],closed:['Kapalı','Closed'],published:['Yayında','Published'],unmanaged:['Onboarding bekliyor','Awaiting onboarding'],'Süresi Doldu':['Süresi Doldu','Expired'],Değerlendiriliyor:['Değerlendiriliyor','Under assessment'],Başlanmadı:['Başlanmadı','Not started'],İncelemede:['İncelemede','In review'],Taslak:['Taslak','Draft'],Kapalı:['Kapalı','Closed'],Tamamlandı:['Tamamlandı','Completed'],Arşivlendi:['Arşivlendi','Archived'],
};
export function MapCanvas({rows,links,selected,focus,depths,tr,select,moduleLabel}:{rows:Row[];links:Link[];selected?:Row;focus:boolean;depths:Map<string,number>;tr:boolean;select:(r:Row)=>void;moduleLabel:(s:string)=>string}){
  const marker=useId().replace(/:/g,''),[hover,setHover]=useState(''),[keyboard,setKeyboard]=useState(''),[manualZoom,setZoom]=useState<number|null>(null),[offset,setOffset]=useState(0);
  const viewport=useRef<HTMLDivElement>(null),[available,setAvailable]=useState(0),[viewportHeight,setViewportHeight]=useState(800);
  useEffect(()=>{
    if(!viewport.current)return;
    const observer=new ResizeObserver(([entry])=>{setAvailable(entry.contentRect.width);setViewportHeight(entry.contentRect.height)});
    observer.observe(viewport.current);return ()=>observer.disconnect();
  },[]);
  const adjacency=useMemo(()=>mapStats(rows,links).adjacent,[rows,links]);
  const chain=useMemo(()=>hover||keyboard?connectedComponent(hover||keyboard,adjacency):null,[hover,keyboard,adjacency]);
  const groups:Row[][]=Array.from({length:focus?Math.max(1,...depths.values())+1:layers.length},()=>[]);
  for(const row of rows)groups[focus?(depths.get(row.id)||0):layerOf(row)].push(row);
  const points=new Map<string,{x:number;y:number;row:Row}>(), height=84+Math.max(1,...groups.map(g=>g.length))*pitch,width=groups.length*columnWidth;
  const zoom=manualZoom??(!focus&&available>=720?Math.min(1,available/width):1);
  groups.forEach((group,i)=>group.forEach((row,n)=>points.set(row.id,{row,x:16+i*columnWidth,y:57+n*pitch})));
  const virtual=rows.length>200,top=virtual?Math.max(0,offset/zoom-2*pitch):0;
  const bottom=virtual?(offset+viewportHeight)/zoom+2*pitch:height;
  const visibleNodes=[...points.values()].filter(point=>point.y+nodeHeight>=top&&point.y<=bottom);
  const root=focus?selected?.id:null;
  const firstLane=focus?0:Math.max(0,groups.findIndex(group=>group.length));
  useEffect(()=>{
    const el=viewport.current;
    if(el)el.scrollTo(!focus&&el.clientWidth<600?firstLane*columnWidth:0,0);
  },[focus,root,firstLane]);
  const label=(i:number)=>focus?(i===0?(tr?'Odak kayıt':'Focus record'):`${i} ${tr?'adım':'hops'}`):layers[i][tr?'tr':'en'];
  return <section className="cm-network" data-mode={focus?"focus":"all"} aria-label={tr?'İlişki diyagramı':'Relationship diagram'}>
    <div className="cm-canvas-controls"><span>{rows.length} {tr?'kayıt':'records'}</span><div><button onClick={()=>setZoom(Math.max(.4,zoom-.15))} aria-label={tr?'Uzaklaştır':'Zoom out'}>−</button><button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button onClick={()=>setZoom(Math.min(1.6,zoom+.15))} aria-label={tr?'Yakınlaştır':'Zoom in'}>+</button><button onClick={e=>{const viewport=e.currentTarget.closest('.cm-network')?.querySelector('.cm-scroll');if(viewport)setZoom(Math.min(1,viewport.clientWidth/width))}}>{tr?'Sığdır':'Fit'}</button></div></div>
    <div ref={viewport} style={{height:`clamp(230px,${Math.ceil(height*zoom+20)}px,60vh)`}} onScroll={e=>{if(virtual)setOffset(e.currentTarget.scrollTop)}} className="cm-scroll" tabIndex={0} aria-label={tr?'Kaydırılabilir ağ':'Scrollable network'}><div style={{width:width*zoom,height:height*zoom,overflow:"clip"}}><div className="cm-plane" style={{width,height,transform:`scale(${zoom})`}}>
      {groups.map((g,i)=><div className="cm-lane" key={i} style={{left:i*columnWidth,width:columnWidth,height}}><strong>{label(i)}</strong><span>{g.length}</span></div>)}
      <svg className="cm-wires" width={width} height={height} aria-hidden="true"><defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="currentColor"/></marker></defs>{links.map(edge=>{
        const a=points.get(edge.source.id),b=points.get(edge.target.id);if(!a||!b||Math.max(a.y,b.y)+nodeHeight<top||Math.min(a.y,b.y)-20>bottom)return null;
        const same=a.x===b.x,forward=a.x<b.x, x1=a.x+(same||forward?nodeWidth:0),x2=b.x+(same||!forward?nodeWidth:0);
        const y1=a.y+nodeHeight*.68,y2=b.y+nodeHeight*.35,mid=same?x1+44:(x1+x2)/2;
        const multi=Math.abs(a.x-b.x)>columnWidth, laneY=Math.min(a.y,b.y)-14;
        const path=multi?`M${x1},${y1} L${x1+(forward?19:-19)},${y1} V${laneY} H${x2+(forward?-19:19)} V${y2} H${x2}`:`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
        return <g key={[edge.source.id,edge.field,edge.relation,edge.target.id].join('|')} opacity={chain&&!chain.has(a.row.id)?.18:1}><path className="cm-wire" d={path} markerEnd={`url(#${marker})`}/><text x={same?x1+32:mid} y={multi?laneY-4:(y1+y2)/2-4} textAnchor="middle">{arrowText(edge,tr)}</text></g>;
      })}</svg>
      {visibleNodes.map(({row,x,y})=>{const status=String(row.data.status||row.data.implementation||'—');return <button type="button" key={row.id} className="cm-node cgw-node" style={{left:x,top:y,width:nodeWidth,height:nodeHeight,'--cm-node-tone':tones[row.module]||'var(--ws-brand-2)'} as React.CSSProperties} data-dim={!!chain&&!chain.has(row.id)} aria-pressed={selected?.id===row.id} onMouseEnter={()=>setHover(row.id)} onMouseLeave={()=>setHover('')} onFocus={()=>setKeyboard(row.id)} onBlur={()=>setKeyboard('')} onClick={()=>select(row)} title={moduleLabel(row.module)+' · '+mapTitle(row,tr)}>
        <span className="cm-node-code"><NavIcon module={row.module}/>{mapCode(row)}</span><b>{mapTitle(row,tr)}</b><small>{recordOwner(row)}</small><span className="cm-status">{statusNames[status]?.[tr?0:1]||domainStatusLabel(status,tr?'tr':'en')}</span></button>})}
    </div></div></div>
  </section>;
}
