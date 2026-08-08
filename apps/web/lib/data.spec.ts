import { describe, expect, it } from 'vitest';
import { assets, controls, risks } from './data';

describe('foundation fixtures', () => {
  it('keeps the dashboard chain populated', () => {
    expect(assets.length).toBeGreaterThan(0);
    expect(risks.every((risk) => risk.score >= 1 && risk.score <= 25)).toBe(true);
    expect(controls.every((control) => control.coverage >= 0 && control.coverage <= 100)).toBe(
      true,
    );
  });
});
