export const emailFieldLabels:Record<string,string>={
 'Secure SMTP Bridge URL':"Güvenli SMTP Köprü URL'si",'SMTP Host':'SMTP Sunucusu','SMTP Port':'SMTP Portu',
 Username:'Kullanıcı Adı','Sender Email':'Gönderen E-posta Adresi','Sender Mailbox':'Gönderen Posta Kutusu',
 'Graph Base URL':"Graph Temel URL'si",'Email API URL':"E-posta API URL'si",
 'SMTP Relay Bridge':'SMTP Aktarım Köprüsü','Microsoft Graph Mail':'Microsoft Graph E-posta','HTTP Email API':'HTTP E-posta API',
};
/** Only known shipped examples are placeholders. Never replace a real saved address. */
export function emailSettingsForDisplay(config:Record<string,string|boolean>){
 const next={...config};
 const examples:Record<string,string[]>={applicationUrl:['https://grc.company.com/fornost-grc/'],bridgeUrl:['https://mail-bridge.company.test/send','https://mail-bridge.company/api/send'],sender:['name@company.com'],username:['name@company.com']};
 for(const [key,values] of Object.entries(examples))if(typeof next[key]==='string'&&values.includes(String(next[key]).trim()))next[key]='';
 return next;
}
