import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PostgreSQL tenant isolation migration', () => {
  it('enables forced RLS and tenant-scoped write checks', async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        '../../packages/database/prisma/migrations/20260808094000_initial_schema_and_rls/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.current_tenant_id()');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('WITH CHECK ("tenantId" = public.current_tenant_id())');
    expect(migration).toContain('ALTER TABLE "UserIdentity" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY');
  });
});
