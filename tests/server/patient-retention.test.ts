import { describe, expect, it, vi } from 'vitest';
import { evaluatePatientErasureEligibility } from '@/lib/server/patient-retention';

function dbWithNoRelatedActivity() {
  return {
    collection: vi.fn(() => ({ findOne: vi.fn(async () => null) })),
  } as any;
}

describe('patient erasure eligibility', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');

  it('always blocks legal holds', async () => {
    const result = await evaluatePatientErasureEligibility(dbWithNoRelatedActivity(), {
      id: 1, tenant_id: 'tenant', retention_legal_hold: true, created_at: '2010-01-01T00:00:00.000Z',
    }, now);
    expect(result).toMatchObject({ eligible: false, reason: 'legal-hold' });
  });

  it('blocks records within five years and allows older records', async () => {
    const recent = await evaluatePatientErasureEligibility(dbWithNoRelatedActivity(), {
      id: 1, tenant_id: 'tenant', created_at: '2024-01-01T00:00:00.000Z',
    }, now);
    const old = await evaluatePatientErasureEligibility(dbWithNoRelatedActivity(), {
      id: 2, tenant_id: 'tenant', created_at: '2018-01-01T00:00:00.000Z',
    }, now);
    expect(recent).toMatchObject({ eligible: false, reason: 'retention-period' });
    expect(old).toMatchObject({ eligible: true });
  });
});
