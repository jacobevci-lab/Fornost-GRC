import { describe, expect, it } from 'vitest';
import { GrcService } from '../src/grc/grc.service';

describe('GrcService tenant isolation', () => {
  it('returns only requested tenant records', () => {
    const service = new GrcService();
    expect(service.list('assets', '00000000-0000-4000-8000-000000000000').total).toBe(0);
  });
  it('calculates critical risk level', () => {
    const service = new GrcService();
    const result = service.createRisk('11111111-1111-4111-8111-111111111111', {
      title: 'Test riski',
      description: 'Sentetik açıklama',
      owner: 'GRC',
      likelihood: 4,
      impact: 5,
    });
    expect(result.level).toBe('CRITICAL');
  });
});
