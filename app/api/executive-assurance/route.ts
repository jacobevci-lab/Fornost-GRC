import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../auth/security';
import { ensureCoreGrcSchemaCompatibility } from '../grc/schema-compat';
import { ensureEvidenceHistorySchema } from '../../evidence/versioning';
import { ensureEvidenceAutomationSchema } from '../evidence-automation/core';
import { ensureAssuranceWorkSchema } from '../../continuous-assurance-runtime';
import { loadExecutiveAssuranceSnapshot } from '../../executive-assurance-runtime';

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
  if (access.response) return access.response;
  const { env } = await import('cloudflare:workers');
  await ensureCoreGrcSchemaCompatibility(env.DB);
  await ensureEvidenceHistorySchema(env.DB);
  await ensureEvidenceAutomationSchema(env.DB);
  await ensureAssuranceWorkSchema(env.DB);
  return NextResponse.json(await loadExecutiveAssuranceSnapshot(env.DB), { headers: { 'cache-control': 'private, no-store' } });
}
