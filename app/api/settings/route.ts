import { NextRequest, NextResponse } from "next/server";
import { identityDb, requireRole } from "../auth/security";

const defaults = {
  reminderDays: "15", remindersEnabled: true, tlsMode: "managed", domain: "", minimumTls: "1.2",
  forceHttps: true, hstsEnabled: true, organizationName: "Fornost Enterprise", timezone: "Europe/Istanbul",
  dateFormat: "DD.MM.YYYY", sessionTimeoutMinutes: "30", auditRetentionDays: "365", telemetryEnabled: false,
};
const tables = [
  `CREATE TABLE IF NOT EXISTS platform_settings (id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS platform_setting_events (id TEXT PRIMARY KEY, action TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS platform_setting_events_created_idx ON platform_setting_events(created_at)`,
];
const integer = (value:unknown,min:number,max:number,name:string) => { const parsed=Number(value); if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw new Error(`${name} ${min}-${max} aralığında olmalıdır.`); return String(parsed); };
const boolean = (value:unknown) => value === true;
const text = (value:unknown,max:number,name:string) => { const parsed=String(value??"").trim(); if(parsed.length>max)throw new Error(`${name} çok uzun.`); return parsed; };
function validate(input:Record<string,unknown>){
  const tlsMode=text(input.tlsMode,20,"TLS modu"),minimumTls=text(input.minimumTls,10,"TLS sürümü"),timezone=text(input.timezone,80,"Saat dilimi"),dateFormat=text(input.dateFormat,20,"Tarih biçimi"),domain=text(input.domain,253,"Alan adı").toLowerCase();
  if(!["managed","custom"].includes(tlsMode))throw new Error("TLS modu geçersiz.");
  if(!["1.2","1.3"].includes(minimumTls))throw new Error("Minimum TLS sürümü geçersiz.");
  if(!["Europe/Istanbul","Europe/London","Europe/Berlin","UTC"].includes(timezone))throw new Error("Saat dilimi geçersiz.");
  if(!["DD.MM.YYYY","YYYY-MM-DD","MM/DD/YYYY"].includes(dateFormat))throw new Error("Tarih biçimi geçersiz.");
  if(domain&&!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw new Error("Geçerli bir FQDN girin.");
  const organizationName=text(input.organizationName,160,"Organizasyon adı");if(organizationName.length<2)throw new Error("Organizasyon adı gereklidir.");
  return {reminderDays:integer(input.reminderDays,1,365,"Hatırlatma süresi"),remindersEnabled:boolean(input.remindersEnabled),tlsMode,domain,minimumTls,forceHttps:boolean(input.forceHttps),hstsEnabled:boolean(input.hstsEnabled),organizationName,timezone,dateFormat,sessionTimeoutMinutes:integer(input.sessionTimeoutMinutes,5,720,"Oturum süresi"),auditRetentionDays:integer(input.auditRetentionDays,30,3650,"Audit saklama süresi"),telemetryEnabled:boolean(input.telemetryEnabled)};
}
async function database(){const db=await identityDb();await db.batch(tables.map(sql=>db.prepare(sql)));return db;}

export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const db=await database();
  const [row,eventRows]=await Promise.all([
    db.prepare("SELECT config_json,updated_by,updated_at FROM platform_settings WHERE id='default'").first<{config_json:string;updated_by:string;updated_at:string}>(),
    db.prepare("SELECT id,action,actor,detail,created_at FROM platform_setting_events ORDER BY created_at DESC LIMIT 12").all<{id:string;action:string;actor:string;detail:string;created_at:string}>(),
  ]);
  let config={};if(row)try{config=JSON.parse(row.config_json);}catch{}
  const events=(eventRows.results||[]).map(event=>{let changedKeys:string[]=[];try{const parsed=JSON.parse(event.detail);if(Array.isArray(parsed.changedKeys))changedKeys=parsed.changedKeys.filter((key:unknown)=>typeof key==="string");}catch{}return {id:event.id,action:event.action,actor:event.actor,changedKeys,createdAt:event.created_at};});
  return NextResponse.json({...defaults,...config,updatedBy:row?.updated_by||null,updatedAt:row?.updated_at||null,events},{headers:{"cache-control":"no-store"}});
}

export async function PUT(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  if(Number(req.headers.get("content-length")||0)>32_768)return NextResponse.json({error:"İstek boyutu çok büyük."},{status:413});
  const body=await req.json().catch(()=>({}));let config;
  try{config=validate(body);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Ayarlar doğrulanamadı."},{status:400});}
  const db=await database(),now=new Date().toISOString(),eventId=crypto.randomUUID();
  const previousRow=await db.prepare("SELECT config_json FROM platform_settings WHERE id='default'").first<{config_json:string}>();
  let previous:Record<string,unknown>={};if(previousRow)try{previous=JSON.parse(previousRow.config_json);}catch{}
  const changedKeys=Object.keys(config).filter(key=>previous[key]!==config[key as keyof typeof config]);
  await db.batch([
    db.prepare("INSERT INTO platform_settings(id,config_json,updated_by,updated_at) VALUES('default',?,?,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(config),access.actor.email,now),
    db.prepare("INSERT INTO platform_setting_events(id,action,actor,detail,created_at) VALUES(?,?,?,?,?)").bind(eventId,"platform-settings-update",access.actor.email,JSON.stringify({changedKeys}),now),
  ]);
  return NextResponse.json({...config,updatedBy:access.actor.email,updatedAt:now,event:{id:eventId,action:"platform-settings-update",actor:access.actor.email,changedKeys,createdAt:now}});
}
