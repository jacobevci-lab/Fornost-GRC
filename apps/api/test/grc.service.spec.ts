import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { GrcRepository, ResourceKind } from '../src/grc/grc.repository';
import { GrcService } from '../src/grc/grc.service';

class FakeRepository implements GrcRepository {
  private readonly assets = [
    { id: '22222222-2222-4222-8222-222222222222', tenantId: '11111111-1111-4111-8111-111111111111' },
  ];

  async list(kind: ResourceKind, tenantId: string) {
    return kind === 'assets' ? this.assets.filter((item) => item.tenantId === tenantId) : [];
  }

  async detail(kind: ResourceKind, tenantId: string, id: string) {
    const item =
      kind === 'assets'
        ? this.assets.find((entry) => entry.tenantId === tenantId && entry.id === id)
        : undefined;
    if (!item) throw new NotFoundException('Kayıt bulunamadı.');
    return item;
  }

  async createRisk(tenantId: string, input: { likelihood: number; impact: number }) {
    const score = input.likelihood * input.impact;
    return { tenantId, level: score >= 15 ? 'CRITICAL' : 'LOW' };
  }

  async createEvidence() {
    return {};
  }

  async createAssessment() {
    return {};
  }

  async createAction() {
    return {};
  }

  async dashboard(tenantId: string) {
    return {
      tenantId,
      openRisks: 0,
      criticalAssets: 0,
      controlCoverage: 0,
      openFindings: 0,
    };
  }
}

describe('GrcService tenant isolation', () => {
  it('returns only requested tenant records', async () => {
    const service = new GrcService(new FakeRepository());
    const result = await service.list('assets', '00000000-0000-4000-8000-000000000000');
    expect(result.total).toBe(0);
  });

  it('does not expose another tenant detail', async () => {
    const service = new GrcService(new FakeRepository());
    await expect(
      service.detail(
        'assets',
        '00000000-0000-4000-8000-000000000000',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates risk creation to the persistent repository', async () => {
    const service = new GrcService(new FakeRepository());
    const result = (await service.createRisk('11111111-1111-4111-8111-111111111111', {
      title: 'Test riski',
      description: 'Sentetik açıklama',
      owner: 'GRC',
      likelihood: 4,
      impact: 5,
    })) as { level: string };
    expect(result.level).toBe('CRITICAL');
  });
});
