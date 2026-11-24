import {NextResponse} from 'next/server';
import {JsonBodyError} from '../api/request-body';
export const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'private, no-store'}});
export class EnterpriseError extends Error{constructor(public status:number,code:string){super(code)}}
export function failure(error:unknown){
 return error instanceof EnterpriseError?reply({code:error.message},error.status):error instanceof JsonBodyError?reply({code:'input'},error.status):reply({code:'unavailable'},503);
}
export function assertInput(value:unknown):asserts value {if(!value)throw new EnterpriseError(400,'input');}
export function event(db:D1Database,actor:string,action:string,subject:string,guard='1'){
 return db.prepare(`INSERT INTO org_access_events SELECT ?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),actor,action,subject,new Date().toISOString());
}
