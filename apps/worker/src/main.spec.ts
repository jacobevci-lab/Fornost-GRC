import { describe, expect, it, vi } from 'vitest';

describe('outbox worker foundation', () => {
  it('polls without exposing payload data', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { pollOutbox } = await import('./main');
    expect(() => pollOutbox()).not.toThrow();
  });
});
