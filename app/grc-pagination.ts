export function parseGrcCursor(raw:string|null):{createdAt:string;id:string}|null{
 if(raw===null)return null;if(raw.length>400)throw new Error('Invalid cursor');const value=JSON.parse(raw);
 if(!value||typeof value.createdAt!=='string'||!value.createdAt||value.createdAt.length>100||typeof value.id!=='string'||!value.id||value.id.length>200)throw new Error('Invalid cursor');
 return {createdAt:value.createdAt,id:value.id};
}
export async function readAllGrcPages<T>(read:(cursor:string|null)=>Promise<{rows:T[];nextCursor?:string|null}>):Promise<T[]>{
 const rows:T[]=[];let cursor:string|null=null;const seen=new Set<string>();
 do{const page=await read(cursor);if(!Array.isArray(page.rows))throw new Error('Invalid record page');rows.push(...page.rows);cursor=page.nextCursor||null;if(cursor){if(seen.has(cursor))throw new Error('Repeated record cursor');seen.add(cursor);}}while(cursor);
 return rows;
}
