import type { Actor } from '../api/auth/security';
import { commitLifecycle, lifecycleClaim, lifecycleInsert } from '../enterprise-lifecycle-write';
import type { CampaignClosure, CampaignWorkspace } from './campaigns';

type Row = Record<string, string | number | null>;
export class PolicyCampaignError extends Error {
  constructor(public code: 'CAMPAIGN_INPUT' | 'CAMPAIGN_ACCESS' | 'CAMPAIGN_MISSING' | 'CAMPAIGN_CONFLICT', public status: number) { super(code); }
}
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), b => b.toString(16).padStart(2, '0')).join('');
function closureValue(value: unknown): CampaignClosure | null {
  try { const v = JSON.parse(String(value)); return v.schema === 1 && typeof v.note === 'string' && typeof v.sourceRevision === 'string' && v.counts && ['attested', 'declined', 'pending', 'total'].every(k => Number.isInteger(v.counts[k]) && v.counts[k] >= 0) ? v : null; } catch { return null; }
}

async function source(db: D1Database, id: unknown) {
  if (!validId(id)) throw new PolicyCampaignError('CAMPAIGN_INPUT', 400);
  const campaign = await db.prepare('SELECT * FROM policy_attestation_campaigns WHERE id=?').bind(id).first<Row>();
  if (!campaign) throw new PolicyCampaignError('CAMPAIGN_MISSING', 404);
  const version = await db.prepare('SELECT v.*,d.code policy_code,d.title policy_title,d.updated_at policy_revision FROM policy_versions v JOIN policy_documents d ON d.id=v.policy_id WHERE v.id=? AND v.policy_id=?').bind(campaign.version_id, campaign.policy_id).first<Row>();
  if (!version) throw new PolicyCampaignError('CAMPAIGN_CONFLICT', 409);
  const result = await db.prepare('SELECT * FROM policy_attestations WHERE campaign_id=? ORDER BY id LIMIT 501').bind(id).all<Row>();
  const recipients = result.results.slice(0, 500);
  const counts = { attested: recipients.filter(r => r.status === 'attested').length, declined: recipients.filter(r => r.status === 'declined').length, pending: recipients.filter(r => r.status === 'pending').length, total: recipients.length };
  const complete = result.results.length <= 500 && recipients.length === Number(campaign.required_count) && recipients.length > 0 && counts.attested + counts.declined + counts.pending === recipients.length &&
    new Set(recipients.map(r => String(r.subject_email).toLowerCase())).size === recipients.length &&
    recipients.every(r => typeof r.subject_email === 'string' && r.subject_email.includes('@') && Number.isFinite(Date.parse(String(r.updated_at))) && (r.status === 'pending' || (r.content_sha256 === version.content_sha256 && Number.isFinite(Date.parse(String(r.attested_at)))))) &&
    ['open', 'closed'].includes(String(campaign.status)) && /^[a-f0-9]{64}$/.test(String(version.content_sha256));
  const revision = await digest({ campaign, version, recipients });
  return { campaign, version, recipients, counts, complete, revision };
}

export async function readPolicyCampaign(db: D1Database, actor: Actor, id: unknown): Promise<CampaignWorkspace> {
  if (actor.role !== 'Admin') throw new PolicyCampaignError('CAMPAIGN_ACCESS', 403);
  const { campaign: c, version: v, recipients, counts, complete, revision } = await source(db, id);
  const event = await db.prepare("SELECT detail FROM policy_events WHERE campaign_id=? AND action='campaign-close' ORDER BY created_at DESC,id DESC LIMIT 1").bind(c.id).first<{ detail: string }>();
  return {
    campaign: { id: String(c.id), policyId: String(c.policy_id), versionId: String(c.version_id), name: String(c.name), audience: String(c.audience), dueDate: String(c.due_date), requiredCount: Number(c.required_count), status: String(c.status), attestedCount: counts.attested, declinedCount: counts.declined, pendingCount: counts.pending, closedBy: String(c.closed_by || ''), closedAt: String(c.closed_at || ''), createdBy: String(c.created_by || ''), createdAt: String(c.created_at || '') },
    version: { id: String(v.id), number: Number(v.version_number), content: String(v.content), contentSha256: String(v.content_sha256), status: String(v.status), policyCode: String(v.policy_code), policyTitle: String(v.policy_title) },
    recipients: recipients.map(r => ({ id: String(r.id), email: String(r.subject_email), status: String(r.status), note: String(r.note || ''), respondedAt: String(r.attested_at || ''), contentSha256: String(r.content_sha256 || '') })), complete, revision, closure: closureValue(event?.detail),
  };
}

export async function closePolicyCampaign(db: D1Database, actor: Actor, input: Record<string, unknown>) {
  if (actor.role !== 'Admin' || !actor.id) throw new PolicyCampaignError('CAMPAIGN_ACCESS', 403);
  const { campaignId, requestId, expectedRevision } = input;
  if (!validId(campaignId) || typeof requestId !== 'string' || !/^PCC-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId) || typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision) ||
      typeof input.note !== 'string' || input.note.trim().length < 20 || input.note.length > 1000 || /\u0000/.test(input.note) || input.confirmation !== 'CLOSE CAMPAIGN' || typeof input.acknowledgeOutstanding !== 'boolean') throw new PolicyCampaignError('CAMPAIGN_INPUT', 400);
  const note = input.note.trim();
  const live = await db.prepare("SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?").bind(actor.id).first<Row>();
  if (!live || live.role !== 'Admin' || live.status !== 'Active' || String(live.email).toLowerCase() !== actor.email.toLowerCase()) throw new PolicyCampaignError('CAMPAIGN_ACCESS', 403);
  const existing = await db.prepare('SELECT campaign_id,action,detail FROM policy_events WHERE id=?').bind(requestId).first<Row>();
  if (existing) {
    const prior = closureValue(existing.detail);
    if (existing.campaign_id !== campaignId || existing.action !== 'campaign-close' || !prior || prior.actorId !== actor.id || prior.actor !== actor.email || prior.sourceRevision !== expectedRevision || prior.note !== note || prior.acknowledgedOutstanding !== input.acknowledgeOutstanding) throw new PolicyCampaignError('CAMPAIGN_CONFLICT', 409);
    return { id: campaignId, replay: true };
  }
  const { campaign, version, recipients, counts, complete, revision } = await source(db, campaignId);
  if (!complete || campaign.status !== 'open' || revision !== expectedRevision) throw new PolicyCampaignError('CAMPAIGN_CONFLICT', 409);
  if ((counts.pending > 0 || counts.declined > 0) && !input.acknowledgeOutstanding) throw new PolicyCampaignError('CAMPAIGN_INPUT', 400);
  const stamp = new Date().toISOString();
  // Recheck the entire read outcome at the write: a response can arrive after preview or during this request.
  const columns = ['id', 'campaign_id', 'subject_email', 'status', 'note', 'content_sha256', 'attested_at', 'updated_at'];
  const guard = { sql: `EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role='Admin' AND u.status='Active' AND a.policy_json IS ?) AND
    (SELECT COUNT(*) FROM policy_attestations WHERE campaign_id=?)=? AND NOT EXISTS (SELECT 1 FROM json_each(?) s WHERE NOT EXISTS (SELECT 1 FROM policy_attestations a WHERE ${columns.map(k => `a.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')})) AND
    EXISTS (SELECT 1 FROM policy_versions v JOIN policy_documents d ON d.id=v.policy_id WHERE v.id=? AND v.policy_id=? AND v.updated_at=? AND v.content_sha256=? AND v.content=? AND v.version_number=? AND v.status=? AND d.updated_at=? AND d.code=? AND d.title=?)`,
    values: [live.id, live.email, live.policy_json, campaignId, recipients.length, JSON.stringify(recipients), version.id, version.policy_id, version.updated_at, version.content_sha256, version.content, version.version_number, version.status, version.policy_revision, version.policy_code, version.policy_title] };
  const closure: CampaignClosure = { schema: 1, requestId, sourceRevision: revision, actorId: actor.id, actor: actor.email, closedAt: stamp, note, acknowledgedOutstanding: input.acknowledgeOutstanding, counts, versionId: String(version.id), versionNumber: Number(version.version_number), contentSha256: String(version.content_sha256) };
  await commitLifecycle(db, lifecycleClaim(db, 'policy_attestation_campaigns', "status='closed',closed_by=?,closed_at=?", [actor.email, stamp], campaign, guard), [
    lifecycleInsert(db, 'policy_events', { id: requestId, policy_id: String(campaign.policy_id), version_id: String(campaign.version_id), campaign_id: campaignId, exception_id: null, action: 'campaign-close', detail: JSON.stringify(closure), actor: actor.email, created_at: stamp }),
  ]);
  return { id: campaignId, replay: false };
}
