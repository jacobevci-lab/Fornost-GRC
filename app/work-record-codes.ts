// Look up only records already included in this authorized response. Listing does not allocate codes.
const collections = {
  audit: {requests:"audit-request",workpapers:"audit-workpaper",milestones:"audit-milestone",closures:"audit-closure"},
  policy: {versions:"policy-version",attestations:"policy-attestation",exceptions:"policy-exception"},
  vendor: {profiles:"vendor-review",assessments:"vendor-assessment",findings:"vendor-finding"},
  regulatory: {changes:"regulatory-change",impacts:"regulatory-impact"},
  continuity: {gaps:"continuity-gap"},
} as const;

export async function withWorkRecordCodes<T extends Record<string,unknown>>(
  req:Request, db:D1Database, source:keyof typeof collections, payload:T,
) {
  if (req.headers.get("x-fornost-work-queue") !== "1") return payload;
  const ids = new Set<string>();
  function collect(items:unknown, kind:string) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const id = kind === "vendor-review" ? item?.vendorId : item?.id;
      if (typeof id === "string" && id) ids.add(kind === "vendor-review" ? id : `work:${kind}:${id}`);
    }
  }
  for (const [key,kind] of Object.entries(collections[source])) collect(payload[key],kind);
  if (source === "audit") collect((payload.assignments as { rows?:unknown } | undefined)?.rows,"audit-request");
  const keys = [...ids], workCodes:Record<string,string> = {};
  for (let offset=0; offset<keys.length; offset+=250) {
    const result = await db.prepare("SELECT record_id,code FROM simple_grc_record_codes WHERE record_id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(keys.slice(offset,offset+250))).all<{record_id:string; code:string}>();
    for (const row of result.results) workCodes[row.record_id] = row.code;
  }
  return {...payload,workCodes};
}
