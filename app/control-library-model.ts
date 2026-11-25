import {sameBiaPerson} from "./bia-assessment";
import {buildConnectedGrcGraph,type ConnectedGrcRow} from "./connected-grc-model";

export const controlTypes={preventive:["Önleyici","Preventive"],detective:["Tespit Edici","Detective"],corrective:["Düzeltici","Corrective"],directive:["Yönlendirici","Directive"]} as const;
export function controlTypeKey(value:unknown){
  const text=String(value??"").trim().toLocaleLowerCase("tr");
  return Object.entries(controlTypes).find(([k,names])=>k===text||names.some(n=>n.toLocaleLowerCase("tr")===text))?.[0]||String(value??"").trim();
}
export function sameControlTester(data:Record<string,unknown>){
  return sameBiaPerson({owner:data.owner,ownerEmail:data.ownerEmail,approver:data.testOwner,approverEmail:data.testOwnerEmail});
}
export function controlConnections(rows:ConnectedGrcRow[]){
  const byControl=new Map<string,{risks:Map<string,ConnectedGrcRow>;evidence:Map<string,ConnectedGrcRow>;incoming:Set<string>}>();
  for(const link of buildConnectedGrcGraph(rows.filter(r=>["Kontroller","Kanıtlar","Risk Assessment","Uyum"].includes(r.module))).links){
    const ctl=link.source.module==="Kontroller"?link.source:link.target.module==="Kontroller"?link.target:null;
    if(!ctl)continue;
    const target=link.source===ctl?link.target:link.source;
    const kind=link.relation==="risk-control"&&target.module==="Risk Assessment"?"risks":link.relation==="control-evidence"&&target.module==="Kanıtlar"?"evidence":null;
    if(!kind)continue;
    const connected=byControl.get(ctl.id)||{risks:new Map(),evidence:new Map(),incoming:new Set<string>()};
    if(link.target===ctl)connected.incoming.add(target.id);
    connected[kind].set(target.id,target);byControl.set(ctl.id,connected);
  }
  return byControl;
}
