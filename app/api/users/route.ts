import {NextRequest,NextResponse} from "next/server";
import {identityDb,passwordHash,requireRole,validPassword} from "../auth/security";
import {readBoundedJsonObject,JsonBodyError} from "../request-body";
import {AccountError,accountFields,createAccount,changeAccount,directoryEntry} from "./account-store";

export async function GET(req:NextRequest){
 const auth=await requireRole(req,["Admin"]);if(auth.response)return auth.response;
 const db=await identityDb();
 const rows=await db.prepare(`SELECT ${accountFields},u.failed_attempts,u.locked_until,u.created_at FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id ORDER BY u.created_at DESC`).all<Parameters<typeof directoryEntry>[0]>();
 const events=await db.prepare(`SELECT e.id,e.user_id,e.actor,e.before_json,e.after_json,e.created_at,
  COALESCE(u.email,json_extract(e.after_json,'$.email'),(SELECT json_extract(d.after_json,'$.email') FROM user_access_events d WHERE d.user_id=e.user_id AND d.id GLOB 'local-delete:*' LIMIT 1),e.user_id) email
  FROM user_access_events e LEFT JOIN local_users u ON u.id=e.user_id ORDER BY e.created_at DESC,e.rowid DESC LIMIT 20`).all();
 const activeAdmins=rows.results.filter(u=>u.role==="Admin"&&u.status==="Active");
 return NextResponse.json({users:rows.results.map(row=>({...directoryEntry(row),own:row.id===auth.actor.id,lastAdmin:activeAdmins.length===1&&activeAdmins[0].id===row.id})),events:events.results},{headers:{"cache-control":"no-store"}});
}
async function write(req:NextRequest,method:"POST"|"PATCH"|"DELETE"){
 const auth=await requireRole(req,["Admin"]);if(auth.response)return auth.response;
 try{
  const body=await readBoundedJsonObject(req,16384),db=await identityDb();
  if(method==="POST"){
   if(typeof body.password!=="string"||!validPassword(body.password))throw new AccountError("password",400,"Hesap parolası parola politikasını karşılamıyor.");
   const id=await createAccount(db,auth.actor,body,await passwordHash(body.password));
   return NextResponse.json({ok:true,id},{status:201});
  }
  return NextResponse.json(await changeAccount(db,auth.actor,body,method==="DELETE"));
 }catch(error){
  if(error instanceof AccountError||error instanceof JsonBodyError)return NextResponse.json({error:error.message,code:error instanceof AccountError?error.code:"invalid"},{status:error.status});
  return NextResponse.json({error:"Kullanıcı işlemi doğrulanamadı.",code:"unavailable"},{status:503});
 }
}
export const POST=(req:NextRequest)=>write(req,"POST");
export const PATCH=(req:NextRequest)=>write(req,"PATCH");
export const DELETE=(req:NextRequest)=>write(req,"DELETE");
