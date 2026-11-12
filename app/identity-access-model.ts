import { ACCESS_MODULES, canReadModule, canWriteModule, validateModuleAccess, type AccessModule, type ModuleAccess } from "./module-access";
import { isSessionRevocationEvent } from "./user-session-actions";
export type Lang = "tr" | "en";
export type LocalUser = { revision:string; own:boolean; lastAdmin:boolean; moduleAccess:ModuleAccess; id:string; name:string; email:string; role:"Admin"|"Editor"|"Viewer"; status:"Active"|"Disabled"; failed_attempts?:number; locked_until?:string };
export type AccessEvent = {id:string;email:string;actor:string;created_at:string;after_json?:string};
export function validDirectory(value:unknown):value is {users:LocalUser[];events:AccessEvent[]} {
 if(!value||typeof value!=="object")return false;
 const body=value as {users?:unknown;events?:unknown};
 return Array.isArray(body.users)&&body.users.every(u=>u&&["id","name","email","revision"].every(k=>typeof u[k]==="string")&&["Admin","Editor","Viewer"].includes(u.role)&&["Active","Disabled"].includes(u.status)&&typeof u.own==="boolean"&&typeof u.lastAdmin==="boolean"&&!!validateModuleAccess(u.moduleAccess))&&Array.isArray(body.events)&&body.events.every(e=>e&&["id","email","actor","created_at"].every(k=>typeof e[k]==="string"));
}
export function roleLabel(role:string,lang:Lang) {return lang==="en"?role:({Admin:"Yönetici",Editor:"Düzenleyici",Viewer:"Görüntüleyici"}[role]||role);}
export function moduleLabel(module:AccessModule,lang:Lang) {
 const labels:Record<AccessModule,[string,string]>={"Risk Assessment":["Risk yönetimi","Risk Assessment"],BIA:["İş etki analizi","BIA"],"Varlık Envanteri":["Varlık envanteri","Asset Inventory"],Uyum:["Uyum","Compliance"],Tedarikçiler:["Tedarikçiler","Vendors"],Kontroller:["Kontroller","Controls"],Kanıtlar:["Kanıtlar","Evidence Library"],"Denetim Yönetimi":["Denetim yönetimi","Audit Management"]};
 return labels[module][lang==="tr"?0:1];
}
export function scopeLabel(user:Pick<LocalUser,"role"|"moduleAccess">,lang:Lang){return user.role==="Admin"||user.moduleAccess.mode==="full"?(lang==="tr"?"Tüm çalışma alanı":"Full workspace"):`${ACCESS_MODULES.filter(m=>canReadModule(user,m)).length} ${lang==="tr"?"modül":"modules"}`;}
export function modulePermission(user:LocalUser,module:AccessModule,lang:Lang){return !canReadModule(user,module)?(lang==="tr"?"Erişim yok":"No access"):canWriteModule(user,module)?(lang==="tr"?"Okuma ve düzenleme":"Read and edit"):(lang==="tr"?"Okuma":"Read");}
const accountErrors:Record<string,string>={invalid:"Check the account details and access scope.",password:"Use a password that meets the displayed policy.",missing:"Account not found. Refresh the list.",stale:"Account details or your permissions changed. Refresh the list.",duplicate:"An account already uses this email.",self:"You cannot delete your own account.","last-admin":"At least one active administrator is required.",unavailable:"The operation could not be verified. Refresh the list."};
export function accountError(body:{code?:string;error?:string},lang:Lang){return (lang==="en"&&accountErrors[body.code||""])||body.error||(lang==="tr"?"İşlem başarısız.":"Operation failed.");}
export function accountEvent(value:string|undefined,lang:Lang){
 const tr=lang==="tr";if(isSessionRevocationEvent(value))return tr?"Yerel oturumlar sonlandırıldı":"Local sessions ended";
 let operation;try{operation=JSON.parse(value||"null")?.operation;}catch{}
 if(operation==="delete-local-account")return tr?"Yerel hesap silindi":"Local account deleted";
 if(operation==="create-local-account")return tr?"Yerel hesap oluşturuldu":"Local account created";
 return tr?"Hesap erişimi güncellendi":"Account access updated";
}
