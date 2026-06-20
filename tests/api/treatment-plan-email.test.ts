import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), scope: vi.fn(), rate: vi.fn(), db: vi.fn(), send: vi.fn(),
  getPlan: vi.fn(), generate: vi.fn(), link: vi.fn(), markSent: vi.fn(), revokeToken: vi.fn(), log: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({ getAuthUser: mocks.auth, isClinicalRole: () => true }));
vi.mock('@/lib/client-permissions', () => ({ resolveClientScopeForClient: mocks.scope }));
vi.mock('@/lib/rate-limit', () => ({ checkWriteRateLimit: mocks.rate }));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.send }));
vi.mock('@/lib/audit', () => ({ logDataAccess: mocks.log }));
vi.mock('@/lib/storage', () => ({
  isStorageConfigured: () => true,
  getStorageProvider: () => ({ download: vi.fn(async () => Buffer.from('pdf')) }),
}));
vi.mock('@/lib/db/mongo-utils', () => ({ getMongoDbOrThrow: mocks.db, stripMongoId: (value: unknown) => value }));
vi.mock('@/lib/server/treatment-plans', () => ({
  getTreatmentPlan: mocks.getPlan,
  generateTreatmentPlanPdfFile: mocks.generate,
  resolveOrIssuePublicLink: mocks.link,
  markTreatmentPlanSent: mocks.markSent,
  revokeTreatmentPlanPublicToken: mocks.revokeToken,
}));
vi.mock('@/lib/error-handler', () => ({
  createErrorResponse: (message: string, status: number) => Response.json({ error: message }, { status }),
  createSuccessResponse: (data: unknown) => Response.json(data),
  handleApiError: () => Response.json({ error: 'Internal error' }, { status: 500 }),
}));

import { POST } from '@/app/api/clients/[id]/treatment-plans/[planId]/send-email/route';

describe('treatment-plan email state', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b1201');
  const plan = { id: 77, status: 'accepted', pdf_file_id: 900, clinic_name_snapshot: 'Clinica', doctor_name_snapshot: 'Dr' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 42, tenantId, dbUserId: new ObjectId(), role: 'dentist' });
    mocks.scope.mockResolvedValue({ userId: 42, tenantId });
    mocks.rate.mockResolvedValue(null);
    mocks.getPlan.mockResolvedValue(plan);
    mocks.link.mockResolvedValue({ token: 'a'.repeat(43), expiresAt: '2026-07-20T00:00:00.000Z' });
    mocks.markSent.mockResolvedValue(plan);
    mocks.db.mockResolvedValue({ collection: (name: string) => ({
      findOne: vi.fn(async () => name === 'clients'
        ? { id: 301, name: 'Ana', email: 'ana@example.com' }
        : { id: 900, storage_key: 'plan.pdf', original_filename: 'plan.pdf' }),
    }) });
  });

  function request() {
    return new NextRequest('http://localhost/api/clients/301/treatment-plans/77/send-email', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
  }

  it('uses the shared state transition that preserves accepted plans', async () => {
    mocks.send.mockResolvedValue({ ok: true });
    const response = await POST(request(), { params: Promise.resolve({ id: '301', planId: '77' }) });
    expect(response.status).toBe(200);
    expect(mocks.markSent).toHaveBeenCalledWith(
      { tenantId, userId: 42, clientId: 301 }, 77, 'email', 'ana@example.com'
    );
  });

  it('revokes the public token when email delivery fails', async () => {
    mocks.send.mockResolvedValue({ ok: false, reason: 'provider down' });
    const response = await POST(request(), { params: Promise.resolve({ id: '301', planId: '77' }) });
    expect(response.status).toBe(502);
    expect(mocks.revokeToken).toHaveBeenCalledWith(
      { tenantId, userId: 42, clientId: 301 }, 77, 'a'.repeat(43)
    );
    expect(mocks.markSent).not.toHaveBeenCalled();
  });
});
