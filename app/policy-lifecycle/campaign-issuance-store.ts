import type { Actor } from '../api/auth/security';
import { parseModuleAccess } from '../module-access';
import { commitLifecycle, lifecycleInsert, LifecycleConflict } from '../enterprise-lifecycle-write';
import { readPolicyDecision } from './decision-store';
import { validatePolicy, validatePolicyVersion } from './domain';
import { validPolicyReviewDate } from './periodic-review';
import type { CampaignIssueInput, CampaignIssuePreview, CampaignPerson, CampaignPeople } from './campaign-issuance';

type Row = Record<string, string | number | null>;
type Person = { id: string; name: string; email: string; role: string; status: string; policy_json: string | null };
const personSelect = 'SELECT u.id,u.name,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id';
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
export class CampaignIssueError extends Error {
  constructor(public code: 'CAMPAIGN_ISSUE_INPUT' | 'CAMPAIGN_ISSUE_ACCESS' | 'CAMPAIGN_ISSUE_SOURCE' | 'CAMPAIGN_ISSUE_RECIPIENTS' | 'CAMPAIGN_ISSUE_CONFLICT', public status: number, public unavailableIds: string[] = []) { super(code); }
}
function eligible(person: Person) { return person.status === 'Active' && ['Admin', 'Editor', 'Viewer'].includes(person.role) && (person.role === 'Admin' || parseModuleAccess(person.policy_json).mode === 'full') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email); }
const publicPerson = ({ id, name, email, role }: Person): CampaignPerson => ({ id, name, email, role });
async function liveAdmin(db: D1Database, actor: Actor) {
  if (actor.role !== 'Admin' || !actor.id) throw new CampaignIssueError('CAMPAIGN_ISSUE_ACCESS', 403);
  const live = await db.prepare(personSelect + ' WHERE u.id=?').bind(actor.id).first<Person>();
  if (!live || live.role !== 'Admin' || !eligible(live) || live.email.toLowerCase() !== actor.email.toLowerCase()) throw new CampaignIssueError('CAMPAIGN_ISSUE_ACCESS', 403);
  return live;
}
function input(value: Record<string, unknown>): CampaignIssueInput {
  const { policyId, name, audience, dueDate, subjectIds } = value;
  if (!idValid(policyId) || typeof name !== 'string' || name.trim().length < 5 || name.length > 200 || typeof audience !== 'string' || audience.trim().length < 3 || audience.length > 500 || /\u0000/.test(name + audience) || !validPolicyReviewDate(dueDate) || !Array.isArray(subjectIds) || subjectIds.length < 1 || subjectIds.length > 500 || !subjectIds.every(idValid) || new Set(subjectIds).size !== subjectIds.length) throw new CampaignIssueError('CAMPAIGN_ISSUE_INPUT', 400);
  return { policyId, name: name.trim(), audience: audience.trim(), dueDate, subjectIds: [...subjectIds].sort() };
}
export async function campaignPeople(db: D1Database, actor: Actor, params: URLSearchParams): Promise<CampaignPeople> {
  await liveAdmin(db, actor);
  const q = params.get('q') || '', raw = params.get('page') || '0', page = Number(raw);
  if (params.getAll('q').length > 1 || params.getAll('page').length > 1 || q.length > 160 || !/^\d+$/.test(raw) || !Number.isSafeInteger(page) || page > 10000) throw new CampaignIssueError('CAMPAIGN_ISSUE_INPUT', 400);
  // Page the directory before applying the shared JS access-policy parser; no approximate SQL permission parser.
  const rows = await db.prepare(personSelect + " WHERE u.status='Active' AND u.role IN ('Admin','Editor','Viewer') AND (?='' OR instr(lower(u.name||' '||u.email),lower(?))>0) ORDER BY lower(u.name),u.id LIMIT 51 OFFSET ?").bind(q.trim(), q.trim(), page * 50).all<Person>();
  return { people: rows.results.slice(0, 50).filter(eligible).map(publicPerson), hasMore: rows.results.length > 50, page };
}
async function source(db: D1Database, request: CampaignIssueInput) {
  if (request.dueDate < new Date().toISOString().slice(0, 10)) throw new CampaignIssueError('CAMPAIGN_ISSUE_INPUT', 400);
  const { policy, version } = await readPolicyDecision(db, 'retire', request.policyId);
  let valid = false;
  try {
    validatePolicy({ ...policy, reviewFrequencyDays: policy.review_frequency_days });
    const refs = [version.control_refs_json, version.regulation_refs_json, version.risk_refs_json].map(x => JSON.parse(String(x)));
    if (!refs.every(x => Array.isArray(x) && x.length <= 50 && x.every(v => typeof v === 'string' && v.length > 0 && v.length <= 160))) throw new Error('mappings');
    const v = validatePolicyVersion({ ...version, policyId: version.policy_id, effectiveDate: version.effective_date, controlRefs: refs[0], regulationRefs: refs[1], riskRefs: refs[2] });
    valid = policy.status === 'published' && version.status === 'published' && policy.current_version_id === version.id && version.policy_id === policy.id && v.content === version.content && v.summary === version.summary && v.effectiveDate === version.effective_date && Number.isInteger(version.version_number) && Number(version.version_number) > 0 && await hash(String(version.content)) === version.content_sha256;
  } catch { /* Reject unusable source before creating any assignments. */ }
  if (!valid) throw new CampaignIssueError('CAMPAIGN_ISSUE_SOURCE', 409);
  const people = (await db.prepare(personSelect + ' WHERE u.id IN (SELECT value FROM json_each(?)) ORDER BY u.id').bind(JSON.stringify(request.subjectIds)).all<Person>()).results;
  const unavailableIds = request.subjectIds.filter(id => { const person = people.find(p => p.id === id); return !person || !eligible(person) || people.filter(p => p.email.toLowerCase() === person.email.toLowerCase()).length !== 1; });
  if (unavailableIds.length) throw new CampaignIssueError('CAMPAIGN_ISSUE_RECIPIENTS', 409, unavailableIds);
  return { policy, version, people, revision: await hash(JSON.stringify({ request, policy, version, people })) };
}
export async function previewCampaignIssue(db: D1Database, actor: Actor, body: Record<string, unknown>): Promise<CampaignIssuePreview> {
  await liveAdmin(db, actor); const request = input(body), current = await source(db, request);
  return { request, policy: current.policy, version: current.version, participants: current.people.map(publicPerson), revision: current.revision };
}
function rowGuard(table: string, row: Row) {
  const keys = Object.keys(row); if (keys.some(k => !/^[a-z_][a-z0-9_]*$/.test(k))) throw new CampaignIssueError('CAMPAIGN_ISSUE_CONFLICT', 409);
  return { sql: `EXISTS (SELECT 1 FROM ${table} t JOIN json_each(?) s ON ${keys.map(k => `t.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')})`, values: [JSON.stringify([row])] };
}
async function replay(db: D1Database, actor: Actor, requestId: string, requestHash: string, revision: string) {
  const existing = await db.prepare("SELECT e.*,c.id existing_campaign FROM policy_events e LEFT JOIN policy_attestation_campaigns c ON c.id=e.campaign_id WHERE e.id=?").bind(requestId).first<Row>();
  if (!existing) return null;
  let detail; try { detail = JSON.parse(String(existing.detail)); } catch { throw new CampaignIssueError('CAMPAIGN_ISSUE_CONFLICT', 409); }
  if (existing.action !== 'campaign-create' || existing.campaign_id !== requestId || existing.existing_campaign !== requestId || existing.actor !== actor.email || detail.schema !== 1 || detail.kind !== 'directory-reviewed-campaign' || detail.actorId !== actor.id || detail.requestHash !== requestHash || detail.sourceRevision !== revision) throw new CampaignIssueError('CAMPAIGN_ISSUE_CONFLICT', 409);
  return { id: requestId, replay: true };
}
export async function issuePolicyCampaign(db: D1Database, actor: Actor, body: Record<string, unknown>) {
  const live = await liveAdmin(db, actor), request = input(body), { requestId, expectedRevision } = body;
  if (body.issueMode !== 'directory-reviewed' || typeof requestId !== 'string' || !/^PAC-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId) || typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision) || body.confirmation !== 'ISSUE POLICY CAMPAIGN') throw new CampaignIssueError('CAMPAIGN_ISSUE_INPUT', 400);
  const requestHash = await hash(JSON.stringify(request)), prior = await replay(db, actor, requestId, requestHash, expectedRevision); if (prior) return prior;
  const current = await source(db, request);
  if (current.revision !== expectedRevision) throw new CampaignIssueError('CAMPAIGN_ISSUE_CONFLICT', 409);
  const guards = [rowGuard('policy_documents', current.policy), rowGuard('policy_versions', current.version)];
  const accountGuard = `NOT EXISTS (SELECT 1 FROM json_each(?) s WHERE NOT EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(s.value,'$.id') AND u.name IS json_extract(s.value,'$.name') AND u.email=json_extract(s.value,'$.email') AND u.role=json_extract(s.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(s.value,'$.policy_json')))`;
  const stamp = new Date().toISOString(), versionId = String(current.version.id);
  const claim = db.prepare(`INSERT INTO policy_attestation_campaigns(id,policy_id,version_id,name,audience,due_date,required_count,status,created_by,created_at) SELECT ?,?,?,?,?,?,?,'open',?,? WHERE NOT EXISTS (SELECT 1 FROM policy_attestation_campaigns WHERE id=?) AND ${guards.map(g => g.sql).join(' AND ')} AND ${accountGuard}`).bind(requestId, request.policyId, versionId, request.name, request.audience, request.dueDate, current.people.length, actor.email, stamp, requestId, ...guards.flatMap(g => g.values), JSON.stringify([...current.people, live]));
  try {
    await commitLifecycle(db, claim, [
      ...current.people.map(person => lifecycleInsert(db, 'policy_attestations', { id: `PAT-${crypto.randomUUID()}`, campaign_id: requestId, subject_email: person.email, status: 'pending', updated_at: stamp })),
      lifecycleInsert(db, 'policy_events', { id: requestId, policy_id: request.policyId, version_id: versionId, campaign_id: requestId, exception_id: null, action: 'campaign-create', actor: actor.email, created_at: stamp, detail: JSON.stringify({ schema: 1, kind: 'directory-reviewed-campaign', actorId: actor.id, requestHash, sourceRevision: current.revision, policyCode: current.policy.code, policyTitle: current.policy.title, versionNumber: current.version.version_number, contentSha256: current.version.content_sha256, participants: current.people.map(publicPerson) }) }),
    ]);
  } catch (error) { if (error instanceof LifecycleConflict) { const recorded = await replay(db, actor, requestId, requestHash, expectedRevision); if (recorded) return recorded; } throw error; }
  return { id: requestId, replay: false };
}
