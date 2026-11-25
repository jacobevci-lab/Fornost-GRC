import { createHash } from 'node:crypto';
import { title, note } from './records.mjs';

// Only a fixed control name may leave the live QA environment on assertion failure.
export function check(ok, code) {
  if (!ok) throw Object.assign(new Error(code), { qaCheck: code });
}
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const samePerson = (left, right) => Boolean(normalizeEmail(left)) && normalizeEmail(left) === normalizeEmail(right);

export function sessionOwner(loginEmail, session) {
  check(session?.role === 'Admin' && samePerson(session.email, loginEmail), 'identity.session-owner');
  return normalizeEmail(session.email);
}

export const containsRef = (value, id, code) => [value].flat().some((ref) => ref === id || ref === code);
export const evidenceBytes = () =>
  Buffer.from(
    JSON.stringify({
      exercise: note,
      policy: 'Require phishing-resistant MFA',
      pim: 'time-bound',
      synthetic: true,
    }),
  );

export function matchOne(rows, predicate, key, optional = false) {
  const matches = rows.filter(predicate);
  check(matches.length === 1 || (optional && matches.length === 0), 'identity.' + key);
  return matches[0];
}

function planIdentity(p, ids, codes, people) {
  check(p && [ids.bia, codes.bia].includes(p.biaRef), 'plan.bia');
  check([p.rtoHours, p.rpoHours, p.mtpdHours].map(Number).join(',') === '2,1,4', 'plan.objectives');
  for (const [field, who] of [
    ['owner', 'owner'],
    ['reviewer', 'reviewer'],
    ['crisisLead', 'lead'],
  ])
    check(samePerson(p[field], people[who]), 'plan.' + field);
}
export function planChecks(p, ids, codes, people) {
  planIdentity(p, ids, codes, people);
  for (const [field, k] of [
    ['assetRefs', 'asset'],
    ['supplierRefs', 'vendor'],
  ])
    check(p[field]?.length === 1 && containsRef(p[field], ids[k], codes[k]), 'plan.' + field);
}

export async function verifySavedPlan(api, resume) {
  const { plan, ids, codes, people } = resume;
  planIdentity(plan, ids, codes, people);
  const missing = {};
  for (const [field, k] of [
    ['assetRefs', 'asset'],
    ['supplierRefs', 'vendor'],
  ]) {
    const refs = plan[field];
    check(Array.isArray(refs), 'plan.' + field);
    if (refs.length === 0) missing[field] = [ids[k]];
    else check(refs.length === 1 && containsRef(refs, ids[k], codes[k]), 'plan.' + field);
  }
  if (!Object.keys(missing).length) return planChecks(plan, ids, codes, people);
  check(plan.status === 'draft' && plan.updatedAt, 'plan.draft-repair');
  await api('/api/continuity', {
    method: 'POST',
    data: {
      action: 'edit-plan',
      planId: plan.id,
      expectedUpdatedAt: plan.updatedAt,
      owner: plan.owner,
      reviewer: plan.reviewer,
      crisisLead: plan.crisisLead,
      biaMode: 'record',
      ...missing,
    },
  });
  const saved = (await api('/api/continuity')).plans.find((p) => p.id === plan.id);
  planChecks(saved, ids, codes, people);
}

export async function resumeContext(api, rows, owner) {
  // Exact titles alone never authorize writes. Require multiple independent
  // provenance markers, the current actor and the persisted cross-module relationships.
  const ids = {},
    codes = {};
  const remember = (key, r, id, code) => {
    check(id && code, 'identity.' + key);
    ids[key] = id;
    codes[key] = code;
    return r;
  };
  const core = (key, module) => {
    const r = matchOne(
      rows,
      (x) => x.key === 'rows' && x.module === module && x.name === title[key],
      key,
    );
    return remember(key, r, r.id, r.code).data;
  };
  const vendors = await api('/api/third-party-risk');
  const v = matchOne(vendors.profiles, (p) => p.name === title.vendor, 'vendor');
  const vendorCore = matchOne(rows, (r) => r.key === 'rows' && r.id === v.vendorId, 'vendor-register');
  remember('vendor', v, v.vendorId, vendorCore.code);
  check(
    vendors.assessments.some((a) => a.vendorId === v.vendorId && a.treatmentPlan?.includes(note)),
    'vendor.provenance',
  );
  check(samePerson(v.riskOwner, owner), 'vendor.owner');
  const people = { owner, reviewer: v.reviewer, lead: v.businessOwner };
  check(
    new Set(Object.values(people).map((v) => String(v).toLowerCase())).size === 3,
    'roles.independent',
  );
  const a = core('asset', 'Varlık Envanteri'),
    b = core('bia', 'BIA'),
    c = core('control', 'Kontroller'),
    e = core('evidence', 'Kanıtlar'),
    r = core('risk', 'Risk Assessment');
  check(a.description?.includes(note) && a.vendor === ids.vendor, 'asset.provenance');
  check(
    containsRef(b.technologyRefs, ids.asset, codes.asset) &&
      containsRef(b.supplierRefs, ids.vendor, codes.vendor),
    'bia.dependencies',
  );
  check(c.description === note && samePerson(c.owner, owner), 'control.provenance');
  check(
    e.contentSha256 === createHash('sha256').update(evidenceBytes()).digest('hex') &&
      containsRef(e.controlRef, ids.control, codes.control),
    'evidence.provenance',
  );
  check(
    [r.asset, r.processLink, r.existingControls].every((x, i) => {
      const k = ['asset', 'bia', 'control'][i];
      return containsRef(x, ids[k], codes[k]);
    }) && Number(r.inherentLikelihood) * Number(r.inherentImpact) === 20,
    'risk.references',
  );
  const policies = await api('/api/policy-lifecycle'),
    p = matchOne(policies.documents, (d) => d.title === title.policy, 'policy');
  check(
    policies.versions.some(
      (v) =>
        v.policyId === p.id &&
        samePerson(v.createdBy, owner) &&
        v.summary?.includes(note) &&
        v.controlRefs?.includes(codes.control),
    ),
    'policy.provenance',
  );
  remember('policy', p, p.id, p.code);
  const plan = matchOne((await api('/api/continuity')).plans, (p) => p.name === title.plan, 'plan');
  check(plan.communicationPlan?.includes(note) && samePerson(plan.createdBy, owner), 'plan.provenance');
  remember('plan', plan, plan.id, plan.code);
  const k = matchOne((await api('/api/risk-appetite')).appetites, (k) => k.kriName === title.kri, 'kri');
  check(
    k.statement?.includes(note) && k.riskRefs.includes(ids.risk) && samePerson(k.owner, owner),
    'kri.provenance',
  );
  remember('kri', k, k.id, k.code);
  const ai = matchOne((await api('/api/ai/workspace')).systems, (m) => m.name === title.ai, 'ai');
  check(
    ai.profile?.purpose?.includes(note) &&
      samePerson(ai.profile.owner, owner) &&
      ai.profile.risks.some((v) => v.id === ids.risk),
    'ai.provenance',
  );
  remember('ai', ai, ai.id, ai.code);
  return { ids, codes, people, plan };
}

export const incidentDescription = note + ' · Gerçek bir olay bildirimi içermez.';

export function verifyIncidentIdentity(incident, { ids, codes, people }) {
  check(incident?.title === title.incident && incident.description === incidentDescription, 'incident.exercise-marker');
  for (const [field, assigned] of [['declaredBy', 'owner'], ['owner', 'owner'], ['commander', 'lead'], ['reviewer', 'reviewer']]) {
    check(samePerson(incident[field], people[assigned]), 'incident.' + field);
  }
  check(incident.personalData === true, 'incident.personal-data');
  for (const [field, key] of [['assetRefs', 'asset'], ['riskRef', 'risk'], ['biaRef', 'bia']]) {
    check(ids[key] && codes[key] && containsRef(incident[field], ids[key], codes[key]), 'incident.' + field);
  }
}

export async function verifyCountdown(page, detectedAt) {
  const header = page.locator('.ic-case-head .ic-clock');
  const read = async () => {
    const text = await header.innerText();
    const match = /72 hours.*?(\d+)h (\d+)m (remaining|overdue)/.exec(text);
    check(match, 'incident.clock-format');
    const displayed = (Number(match[1]) * 60 + Number(match[2])) * (match[3] === 'overdue' ? -1 : 1);
    const expected = (Date.parse(detectedAt) + 72 * 3600000 - Date.now()) / 60000;
    check(Number.isFinite(expected) && Math.abs(displayed - expected) < 2, 'incident.clock-value');
    return displayed;
  };
  const initial = await read();
  await page.getByRole('button', { name: 'Crisis brief', exact: true }).click();
  const brief = page.locator('.ic-command .ic-clock');
  const { expect } = await import('@playwright/test');
  await expect(brief).toHaveText(await header.innerText());
  await expect.poll(read, { timeout: 85000, intervals: [1000, 3000] }).toBeLessThan(initial);
  await expect(brief).toHaveText(await header.innerText());
}
