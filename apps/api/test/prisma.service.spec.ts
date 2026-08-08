import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service';

describe('PrismaService tenant transaction', () => {
  it('sets a transaction-local tenant before executing repository work', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const work = vi.fn().mockResolvedValue('ok');
    const service = {
      $transaction: vi.fn(async (callback) => callback({ $executeRaw: executeRaw })),
    };

    const result = await PrismaService.prototype.withTenant.call(
      service,
      '11111111-1111-4111-8111-111111111111',
      work,
    );

    expect(result).toBe('ok');
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledOnce();
  });
});
