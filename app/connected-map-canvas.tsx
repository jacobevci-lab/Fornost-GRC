"use client";
import {useEffect,useId,useMemo,useRef,useState,type CSSProperties} from 'react';
import {domainStatusLabel} from './domain-identity';
import type {ConnectedGrcRow as Row,ConnectedGrcLink as Link} from './connected-grc-model';
import {layers,mapCode,mapTitle} from './connected-map-model';
import {layoutMap,wireRoute,arrowLabel,pitch} from './connected-map-layout';

const tones:Record<string,string>={
  'Kontroller':'var(--ws-brand)','Kanıtlar':'var(--ws-positive)','Risk Assessment':'var(--ws-warning)',
  'Bulgular ve CAPA':'var(--ws-danger)','Güvenlik Olayları':'color-mix(in srgb,var(--ws-danger) 70%,var(--ws-warning))',
  'Politika Merkezi':'var(--ws-brand-2)','Uyum':'var(--ws-positive)','Tedarikçiler':'var(--ws-warning)',
  'Varlık Envanteri':'color-mix(in srgb,var(--ws-brand) 60%,var(--ws-muted))','BIA':'var(--ws-brand-2)',
  'İş Sürekliliği':'color-mix(in srgb,var(--ws-brand) 60%,var(--ws-positive))','AI Yönetişimi':'var(--ws-brand-2)',
  'Denetim Yönetimi':'var(--ws-muted)','Regülasyon Merkezi':'var(--ws-warning)','Kanıt Otomasyonu':'var(--ws-brand)',
  'Risk İştahı ve KRI':'color-mix(in srgb,var(--ws-warning) 75%,var(--ws-danger))',
};
const statusNames:Record<string,[string,string]>={
  'Kısmi Uyumlu':['Kısmi Uyumlu','Partially compliant'],Uygulanamaz:['Uygulanamaz','Not applicable'],
  Uygulanıyor:['Uygulanıyor','Implemented'],'Aksiyon Devam Ediyor':['Aksiyon Devam Ediyor','Action in progress'],Askıda:['Askıda','Suspended'],
  'Uygulama Hazırlığında':['Uygulama Hazırlığında','Preparing implementation'],excluded:['Kapsam dışı','Out of scope'],
  rejected:['Reddedildi','Rejected'],retiring:['Emekliye ayrılıyor','Retiring'],monitoring:['İzleniyor','Monitoring'],
  declared:['Beyan edildi','Declared'],triage:['Ön inceleme','Triage'],contained:['Sınırlandırıldı','Contained'],resolved:['Çözüldü','Resolved'],onboarding:['Kabul sürecinde','Onboarding'],suspended:['Askıya alındı','Suspended'],retired:['Emekli','Retired'],submitted:['İncelemede','Submitted'],cancelled:['İptal edildi','Cancelled'],archived:['Arşivlendi','Archived'],healthy:['Sağlıklı','Healthy'],stale:['Bayat','Stale'],failing:['Başarısız','Failing'],pending:['Bekliyor','Pending'],
  active:['Aktif','Active'],Aktif:['Aktif','Active'],draft:['Taslak','Draft'],approved:['Onaylı','Approved'],Onaylandı:['Onaylandı','Approved'],open:['Açık','Open'],closed:['Kapalı','Closed'],published:['Yayında','Published'],unmanaged:['Onboarding bekliyor','Awaiting onboarding'],'Süresi Doldu':['Süresi Doldu','Expired'],Değerlendiriliyor:['Değerlendiriliyor','Under assessment'],Başlanmadı:['Başlanmadı','Not started'],İncelemede:['İncelemede','In review'],Taslak:['Taslak','Draft'],Kapalı:['Kapalı','Closed'],Tamamlandı:['Tamamlandı','Completed'],Arşivlendi:['Arşivlendi','Archived'],
};
type Props={rows:Row[];links:Link[];selected?:Row;focus:boolean;tr:boolean;select:(row:Row)=>void;moduleLabel:(name:string)=>string};
export function MapCanvas({rows,links,selected,focus,tr,select,moduleLabel}:Props){
  const marker=useId().replace(/:/g,''), viewport=useRef<HTMLDivElement>(null);
  const [hover,setHover]=useState(''),[keyboard,setKeyboard]=useState(''),[zoom,setZoom]=useState(1),[offset,setOffset]=useState(0);
  const [size,setSize]=useState({width:0,height:0});
  useEffect(()=>{
    const el=viewport.current;if(!el)return;
    const observer=new ResizeObserver(()=>setSize({width:el.clientWidth,height:el.clientHeight}));
    observer.observe(el);return ()=>observer.disconnect();
  },[]);
  const root=focus?selected:undefined,active=hover||keyboard;
  const graph=useMemo(()=>layoutMap(rows,links,root,size.width/zoom,size.height/zoom),[rows,links,root,size,zoom]);
  const adjacent=useMemo(()=>{
    const ids=new Set([active]);
    if(active)for(const {start,end} of graph.wires){
      if(start.row.id===active)ids.add(end.row.id);
      if(end.row.id===active)ids.add(start.row.id);
    }
    return ids;
  },[graph,active]);
  const firstLane=graph.lanes.find(lane=>lane.count)?.middle??0;
  useEffect(()=>{
    const el=viewport.current;if(!el||!size.width)return;
    const startX=focus?(graph.width*zoom-size.width)/2:Math.max(0,firstLane*zoom-size.width/2);
    el.scrollTo(startX,focus?(graph.height*zoom-size.height)/2:0);
  },[focus,root?.id,graph.width,graph.height,firstLane,size.width,size.height,zoom]);
  const virtual=graph.nodes.length>200,top=virtual?offset/zoom-pitch:0,bottom=virtual?(offset+size.height)/zoom+pitch:graph.height;
  const focusLabels=tr?['Gelenler','Merkez','Gidenler']:['Incoming','Focus','Outgoing'];
  const wires=graph.wires.filter(({start,end})=>Math.max(start.y+start.height,end.y+end.height)>=top && Math.min(start.y,end.y)-20<=bottom);
  const pills=new Map<string,{x:number;y:number;labels:Set<string>}>();
  return <section className="cm-network" data-mode={focus?'focus':'all'} aria-label={tr?'İlişki diyagramı':'Relationship diagram'}>
    <div ref={viewport} className="cm-scroll" tabIndex={0} aria-label={tr?'Kaydırılabilir ağ':'Scrollable network'} onScroll={e=>{if(virtual)setOffset(e.currentTarget.scrollTop)}}>
      <div style={{width:graph.width*zoom,height:graph.height*zoom,overflow:'clip'}}><div className="cm-plane" style={{width:graph.width,height:graph.height,transform:`scale(${zoom})`}}>
        {graph.lanes.map(({lane,middle,count})=><div key={lane} className="cm-lane" style={{left:middle}}><strong>{focus?focusLabels[lane]:layers[lane][tr?'tr':'en']}</strong><span>{count}</span></div>)}
        <svg className="cm-wires" width={graph.width} height={graph.height} aria-hidden="true"><defs>{['quiet','active'].map(state=><marker key={state} id={marker+state} markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto"><path className={'cm-tip-'+state} d="M0 0L6 3L0 6Z"/></marker>)}</defs>
          {wires.map(({edge,start,end,key})=>{
            const lit=!!active&&(start.row.id===active||end.row.id===active),route=wireRoute(start,end);
            if(lit){
              const at=route.x+','+route.y, pill=pills.get(at)??{x:route.x,y:route.y,labels:new Set<string>()};
              pill.labels.add(arrowLabel(edge,tr));pills.set(at,pill);
            }
            return <path key={key} className="cm-wire" data-active={lit} data-dim={!!active&&!lit} d={route.path} markerEnd={`url(#${marker}${lit?'active':'quiet'})`}/>;
          })}
          {[...pills].map(([at,{x,y,labels}])=>{
            const title=[...labels].join(' · '),width=Math.min(178,Math.max(54,title.length*6+18));
            return <g key={at} className="cm-wire-pill" transform={`translate(${Math.max(width/2+2,Math.min(graph.width-width/2-2,x))} ${y})`}><rect x={-width/2} y="-10" width={width} height="20" rx="10"/><text textAnchor="middle" dy="4" textLength={title.length*6>160?width-14:undefined} lengthAdjust="spacingAndGlyphs">{title}</text></g>;
          })}
        </svg>
        {graph.nodes.filter(n=>n.y+n.height>=top&&n.y<=bottom).map(({key,row,lane,x,y,width,height})=>{
          const status=String(row.data.status||row.data.implementation||''),code=mapCode(row);
          return <button type="button" key={key} className="cm-node cgw-node" style={{left:x,top:y,width,height,'--cm-node-tone':tones[row.module]||'var(--ws-brand-2)'} as CSSProperties} data-lane={lane} data-root={!!root&&lane===1} data-dim={!!active&&!adjacent.has(row.id)} data-lit={!!active&&adjacent.has(row.id)} aria-haspopup="dialog" onPointerEnter={e=>{if(e.pointerType!=='touch')setHover(row.id)}} onPointerLeave={()=>setHover('')} onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))setKeyboard(row.id)}} onBlur={()=>setKeyboard('')} onClick={()=>select(row)} title={moduleLabel(row.module)+' · '+mapTitle(row,tr)}>
            <span className="cm-node-code">{code==='—'?(tr?'Kod alınamadı':'Code unavailable'):code}</span><b>{mapTitle(row,tr)}</b><span className="cm-status">{status?(statusNames[status]?.[tr?0:1]||domainStatusLabel(status,tr?'tr':'en')):(tr?'Durum belirtilmedi':'Status unspecified')}</span>
          </button>;
        })}
      </div></div>
    </div>
    <div className="cm-canvas-controls" role="group" aria-label={tr?'Yakınlaştırma':'Zoom'}><button disabled={zoom<=.35} onClick={()=>setZoom(Math.max(.35,zoom-.15))} aria-label={tr?'Uzaklaştır':'Zoom out'}>−</button><button onClick={()=>setZoom(1)} title={tr?'Gerçek boyut':'Actual size'}>{Math.round(zoom*100)}%</button><button disabled={zoom>=1.6} onClick={()=>setZoom(Math.min(1.6,zoom+.15))} aria-label={tr?'Yakınlaştır':'Zoom in'}>+</button><button onClick={()=>{const min=layoutMap(rows,links,root,0,0);setZoom(Math.max(.1,Math.min(1,size.width/min.width,size.height/min.height)))}}>{tr?'Sığdır':'Fit'}</button></div>
  </section>;
}
