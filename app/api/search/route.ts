import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '../auth/security';
import { ensureCoreGrcSchemaCompatibility } from '../grc/schema-compat';
import { searchRecords, SearchInputError } from '../../record-search-store';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ['Admin', 'Editor', 'Viewer']);
  if (access.response) return access.response;
  try {
    const { env } = await import('cloudflare:workers');
    await ensureCoreGrcSchemaCompatibility(env.DB);
    return json(await searchRecords(env.DB, access.actor, req.nextUrl.searchParams));
  } catch (error) {
    return error instanceof SearchInputError ? json({ error: error.message }, 400) : json({ error: 'Record search is unavailable. Please retry.' }, 503);
  }
}
