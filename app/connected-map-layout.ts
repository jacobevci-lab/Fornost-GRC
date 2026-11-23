import type {ConnectedGrcLink as Link, ConnectedGrcRow as Row} from './connected-grc-model';
import {arrowText, layers, layerOf, mapCode} from './connected-map-model';

export const cardWidth = 220, centerWidth = 262, cardHeight = 82, pitch = 118;
const gutter = 110, margin = 38, heading = 54;
export type MapPoint = {key:string; row:Row; lane:number; x:number; y:number; width:number; height:number};

// A register can store a pointer on either endpoint (e.g. risk.existingControls).
// Keep that write/provenance direction intact and orient the drawing by the relationship.
export function mapArrow(edge:Link) {
  let reverse = false;
  let verb:readonly [string,string]|undefined;
  if (edge.relation === 'risk-control') {
    reverse = edge.target.module === 'Kontroller'; verb = ['Azaltır','Mitigates'];
  } else if (edge.relation === 'control-evidence' && [edge.source.module,edge.target.module].includes('Kanıtlar')) {
    reverse = edge.target.module === 'Kanıtlar'; verb = ['Kanıtlar','Evidences'];
  } else if (edge.relation === 'control-framework' && edge.target.module === 'Uyum') {
    reverse = true; verb = ['Kapsar','Covers'];
  } else if (edge.relation.startsWith('finding-') && edge.relation !== 'finding-remediation' && edge.source.module === 'Bulgular ve CAPA') {
    reverse = true; verb = ['Bağlı bulgu','Linked finding'];
  }
  return {from:reverse?edge.target:edge.source,to:reverse?edge.source:edge.target,verb};
}
export function arrowLabel(edge:Link,tr:boolean){
  return mapArrow(edge).verb?.[tr?0:1] || arrowText(edge,tr);
}

export function layoutMap(rows:Row[], links:Link[], root:Row|undefined, availableWidth:number, availableHeight:number) {
  const count = root ? 3 : layers.length;
  const groups = Array.from({length:count},()=>new Map<string,Row>());
  const directed = links.map(edge=>({edge,...mapArrow(edge)})).filter(({from,to})=>!root || from.id===root.id || to.id===root.id);
  if (root) {
    groups[1].set(root.id,root);
    for (const {from,to} of directed) {
      if (from.id!==root.id) groups[0].set(from.id,from);
      if (to.id!==root.id) groups[2].set(to.id,to);
    }
  } else for (const row of rows) groups[layerOf(row)].set(row.id,row);
  const width = Math.max(availableWidth, 2*margin + count*cardWidth + (count-1)*gutter + (root?centerWidth-cardWidth:0));
  const height = Math.max(availableHeight, 2*heading + (Math.max(1,...groups.map(g=>g.size))-1)*pitch + cardHeight);
  const span = (width-2*margin-cardWidth)/(count-1);
  const positions = new Map<string,MapPoint>();
  const key = (id:string,lane:number)=>lane+'|'+id;
  const lanes = groups.map((group,lane)=>{
    const items = [...group.values()].sort((a,b)=>mapCode(a).localeCompare(mapCode(b), 'en', {numeric:true}) || a.id.localeCompare(b.id));
    const middle = margin + cardWidth/2 + span*lane;
    items.forEach((row,i)=>{
      const isRoot = !!root && lane===1;
      const w = isRoot?centerWidth:cardWidth, h = isRoot?cardHeight+14:cardHeight;
      const y = root ? (height-h)/2 + (i-(items.length-1)/2)*pitch : heading+i*pitch;
      const id = key(row.id,lane);
      positions.set(id,{key:id,row,lane,x:middle-w/2,y,width:w,height:h});
    });
    return {lane,middle,count:items.length};
  });
  const wires = directed.flatMap(({edge,from,to})=>{
    const start=positions.get(key(from.id,root?(from.id===root.id?1:0):layerOf(from)));
    const end=positions.get(key(to.id,root?(to.id===root.id?1:2):layerOf(to)));
    if(!start||!end||start===end)return [];
    return [{edge,start,end,key:[edge.source.id,edge.target.id,edge.relation,edge.field].join('|')}];
  });
  return {width,height,lanes,nodes:[...positions.values()],wires};
}

export function wireRoute(a:MapPoint,b:MapPoint){
  const same=a.lane===b.lane, sign=b.lane<a.lane?-1:1;
  const x1=a.x+(sign===1?a.width:0), x2=b.x+(same||sign===-1?b.width:0);
  const y1=a.y+a.height/2, y2=b.y+b.height/2;
  if(same){
    const bend=x1+26;
    return {path:`M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y1}, ${bend} ${y1+(y2>y1?10:-10)} V ${y2+(y2>y1?-10:10)} Q ${bend} ${y2}, ${x2} ${y2}`,x:bend,y:(a.y+b.y)/2+a.height/2+(Math.round(Math.abs(a.y-b.y)/pitch)%2===0?pitch/2:0)};
  }
  const mid=(x1+x2)/2;
  if(Math.abs(a.lane-b.lane)===1) return {path:`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,x:mid,y:(y1+y2)/2};
  // Cross intermediate lanes in the gap above a row, never through a card.
  const track=a.y-16, out=x1+sign*25, into=x2-sign*25;
  return {path:`M ${x1} ${y1} Q ${out} ${y1}, ${out} ${y1-12} V ${track+8} Q ${out} ${track}, ${out+sign*8} ${track} H ${into-sign*8} Q ${into} ${track}, ${into} ${track+8} V ${y2+(y2>track?-12:12)} Q ${into} ${y2}, ${x2} ${y2}`,x:mid,y:track};
}
