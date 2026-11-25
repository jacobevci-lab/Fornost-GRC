// One D1 transaction for parent, provenance and requirements. Each statement stays
// below D1's 100 bound-parameter limit, including catalogs with >1,000 controls.
export function auditRequirementInserts(id:string,rows:Record<string,unknown>[],now:string){
 const statements:Array<{sql:string;values:string[]}>=[];
 for(let start=0;start<rows.length;start+=15){const chunk=rows.slice(start,start+15);statements.push({sql:`INSERT INTO simple_grc_records(id,module,data_json,created_at,updated_at) VALUES ${chunk.map(()=>'(?,?,?,?,?)').join(',')}`,values:chunk.flatMap((data,index)=>[`${id}-REQ-${start+index+1}`,'Denetim Yönetimi',JSON.stringify(data),now,now])});}
 return statements;
}
