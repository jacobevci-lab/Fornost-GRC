import { formatRecordCode, recordCodePrefixes, type RecordCodeModule } from "./record-codes";

export async function reserveRecordCodes(d:D1Database,module:RecordCodeModule,count:number,now:string){
 if(count<1)return [];
 await d.prepare("INSERT OR IGNORE INTO simple_grc_record_code_counters(module,value,updated_at) VALUES(?,0,?)").bind(module,now).run();
 // References resolve both IDs and saved codes, including uncoded legacy IDs.
 // Reserve both namespaces here, never by mutating records during a read.
 const prior=await d.prepare("SELECT code FROM simple_grc_record_codes WHERE module=? UNION ALL SELECT id AS code FROM simple_grc_records WHERE module=?").bind(module,module).all<{code:string}>(),prefix=recordCodePrefixes[module],highest=(prior.results||[]).reduce((max,row)=>{const match=String(row.code).match(new RegExp(`^${prefix}-(\\d+)$`,"i"));return match?Math.max(max,Number(match[1])):max},0);
 await d.prepare("UPDATE simple_grc_record_code_counters SET value=CASE WHEN value<? THEN ? ELSE value END,updated_at=? WHERE module=?").bind(highest,highest,now,module).run();
 const counter=await d.prepare("UPDATE simple_grc_record_code_counters SET value=value+?,updated_at=? WHERE module=? RETURNING value").bind(count,now,module).first<{value:number}>();
 if(!counter)throw new Error("RECORD_CODE_ALLOCATION_FAILED");
 const start=Number(counter.value)-count+1;
 return Array.from({length:count},(_,index)=>formatRecordCode(module as RecordCodeModule,start+index));
}
