import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, any>;

const { mockGetMongoDbOrThrow, mockStorageProvider } = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockStorageProvider: {
    delete: vi.fn(),
    download: vi.fn(),
    getSignedUrl: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
  };
});

vi.mock('@/lib/auth-helpers', () => ({
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/lib/storage', () => ({
  buildClientStorageKey: vi.fn((tenantId: string, clientId: number, filename: string) => `${tenantId}/${clientId}/${filename}`),
  getStorageProvider: vi.fn(() => mockStorageProvider),
  isStorageConfigured: vi.fn(() => true),
}));

import {
  getPublicTreatmentPlanPdfUrl,
  getPublicTreatmentPlanView,
  issueTreatmentPlanPublicLink,
  markTreatmentPlanSent,
  normalizeRoPhone,
  resolveOrIssuePublicLink,
  revokeTreatmentPlanPublicLink,
  softDeleteTreatmentPlan,
  updateTreatmentPlan,
} from '@/lib/server/treatment-plans';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeCollection(overrides: Partial<Record<string, any>> = {}) {
  return {
    findOne: vi.fn(async () => null),
    findOneAndUpdate: vi.fn(async () => null),
    insertOne: vi.fn(async () => ({ acknowledged: true })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    updateMany: vi.fn(async () => ({ modifiedCount: 0 })),
    updateOne: vi.fn(async () => ({ modifiedCount: 0 })),
    ...overrides,
  };
}

describe('treatment plan sharing helpers', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0201');
  const scope = { tenantId, userId: 42, clientId: 301 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageProvider.getSignedUrl.mockResolvedValue('https://signed.example/plan.pdf');
  });

  it('normalizes Romanian phone numbers for WhatsApp links', () => {
    expect(normalizeRoPhone('0712 345 678')).toBe('40712345678');
    expect(normalizeRoPhone('+40 712 345 678')).toBe('40712345678');
    expect(normalizeRoPhone('0040 712 345 678')).toBe('40712345678');
    expect(normalizeRoPhone('12345')).toBeNull();
    expect(normalizeRoPhone(null)).toBeNull();
  });

  it('reuses an active link when the caller still holds the token (same session)', async () => {
    const existingToken = 'existing_share_token_1234567890abcdef';
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const links = makeCollection({
      // Matched by token_hash; tokens are never stored in plaintext.
      findOne: vi.fn(async () => ({ token_hash: hashToken(existingToken), expires_at: expiresAt })),
    });
    const plans = makeCollection();
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'treatment_plan_public_links') return links;
        if (name === 'treatment_plans') return plans;
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const result = await resolveOrIssuePublicLink(scope, 77, existingToken);

    expect(result).toEqual({ token: existingToken, expiresAt });
    expect(links.insertOne).not.toHaveBeenCalled();
    expect(plans.updateOne).not.toHaveBeenCalled();
  });

  it('stores a TTL date when issuing a fresh public link', async () => {
    const plans = makeCollection({
      findOne: vi.fn(async () => ({
        id: 77,
        tenant_id: tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        pdf_file_id: 900,
        public_view_token_hash: null,
        public_view_expires_at: null,
      })),
    });
    const links = makeCollection();
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'treatment_plans') return plans;
        if (name === 'treatment_plan_public_links') return links;
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const result = await issueTreatmentPlanPublicLink(scope, 77);

    expect(result?.token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(links.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const update = (links.findOneAndUpdate as any).mock.calls[0]?.[1] as Doc;
    expect(update.$set.token_hash).toBe(hashToken(result!.token));
    // Security: the plaintext token must never be persisted.
    expect(update.$set).not.toHaveProperty('token');
    expect(update.$set.expires_at_date).toBeInstanceOf(Date);
    expect(update.$set.expires_at_date.toISOString()).toBe(update.$set.expires_at);
    const [filter, , options] = (links.findOneAndUpdate as any).mock.calls[0];
    expect(filter).toMatchObject({
      tenant_id: tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      plan_id: 77,
      revoked_at: { $exists: false },
    });
    expect(options).toMatchObject({ upsert: true });
  });

  it('revokes all active link records for the plan', async () => {
    const planDoc = { id: 77, tenant_id: tenantId, user_id: scope.userId, client_id: scope.clientId, status: 'draft' };
    const plans = makeCollection({
      findOne: vi.fn(async () => planDoc),
    });
    const links = makeCollection();
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'treatment_plans') return plans;
        if (name === 'treatment_plan_public_links') return links;
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const result = await revokeTreatmentPlanPublicLink(scope, 77);

    expect(result).toMatchObject({ id: 77 });
    expect((links.updateMany as any).mock.calls[0]?.[0]).toMatchObject({
      tenant_id: tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      plan_id: 77,
      revoked_at: { $exists: false },
    });
    expect((links.updateMany as any).mock.calls[0]?.[1].$set.revoked_at).toEqual(expect.any(String));
  });

  it('does not downgrade an accepted plan when marking it sent', async () => {
    const plans = makeCollection({
      findOne: vi.fn(async () => ({
        id: 77,
        tenant_id: tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        status: 'accepted',
      })),
      findOneAndUpdate: vi.fn(async () => ({ id: 77, status: 'accepted' })),
    });
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'treatment_plans') return plans;
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    await markTreatmentPlanSent(scope, 77, 'whatsapp');

    expect((plans.findOneAndUpdate as any).mock.calls[0]?.[1].$set.status).toBe('accepted');
    expect((plans.findOneAndUpdate as any).mock.calls[0]?.[1].$set.sent_via).toBe('whatsapp');
  });

  it('resolves a public PDF URL through the active link collection', async () => {
    const token = 'public_share_token_1234567890abcdef';
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const links = makeCollection({
      findOne: vi.fn(async () => ({
        token_hash: hashToken(token),
        tenant_id: tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        plan_id: 77,
        expires_at: expiresAt,
      })),
    });
    const plans = makeCollection({
      findOne: vi.fn(async () => ({
        id: 77,
        tenant_id: tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        pdf_file_id: 900,
      })),
    });
    const files = makeCollection({
      findOne: vi.fn(async () => ({
        id: 900,
        tenant_id: tenantId,
        client_id: scope.clientId,
        storage_key: 'tenant/client/plan.pdf',
        original_filename: 'Plan.pdf',
      })),
    });
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'treatment_plan_public_links') return links;
        if (name === 'treatment_plans') return plans;
        if (name === 'client_files') return files;
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const url = await getPublicTreatmentPlanPdfUrl(token);

    expect(url).toBe('https://signed.example/plan.pdf');
    expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
      'tenant/client/plan.pdf',
      900,
      expect.objectContaining({ contentDisposition: 'inline; filename="Plan.pdf"' })
    );
  });

  it('returns a patient-safe public page projection without full contact details', async () => {
    const token = 'public_share_token_abcdef1234567890';
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const links = makeCollection({
      findOne: vi.fn(async () => ({
        token_hash: hashToken(token),
        tenant_id: tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        plan_id: 77,
        expires_at: expiresAt,
      })),
    });
    const plans = makeCollection({
      findOne: vi.fn(async () => ({
        id: 77,
        tenant_id: tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        pdf_file_id: 900,
        clinic_name_snapshot: 'Clinica Test',
        doctor_name_snapshot: 'Dr. Test',
        plan_date: '2026-06-19',
        recap: [{ label: 'Consultatie', amount: 150 }],
        total: 150,
        currency: 'lei',
        disclaimer_snapshot: 'Disclaimer',
      })),
    });
    const clients = makeCollection({
      findOne: vi.fn(async () => ({ name: 'Ana Maria Popescu', email: 'ana@example.com', phone: '0712345678' })),
    });
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'treatment_plan_public_links') return links;
        if (name === 'treatment_plans') return plans;
        if (name === 'clients') return clients;
        throw new Error(`Unexpected collection: ${name}`);
      },
    });

    const view = await getPublicTreatmentPlanView(token);

    expect(view).toMatchObject({
      clinicName: 'Clinica Test',
      patientFirstName: 'Ana',
      doctorName: 'Dr. Test',
      total: 150,
      expiresAt,
    });
    expect(view).not.toHaveProperty('email');
    expect(view).not.toHaveProperty('phone');
  });

  it('commits plan edits before deleting the stale PDF', async () => {
    const plan = {
      id: 77, tenant_id: tenantId, user_id: scope.userId, client_id: scope.clientId,
      status: 'draft', pdf_file_id: 900,
      items: [{ procedure: 'Old', details: '', quantity: 1, unit_price: 10, line_total: 10 }],
      total_override: null,
    };
    const plans = makeCollection({
      findOne: vi.fn(async () => plan),
      findOneAndUpdate: vi.fn(async () => ({ ...plan, pdf_file_id: null })),
    });
    const files = makeCollection({ findOne: vi.fn(async () => ({ id: 900, storage_key: 'old.pdf' })) });
    mockGetMongoDbOrThrow.mockResolvedValue({ collection: (name: string) => name === 'treatment_plans' ? plans : files });

    await updateTreatmentPlan(scope, { dbUserId: new ObjectId(), role: 'dentist', userId: 42 } as any, 77, {
      items: [{ service_id: null, procedure: 'New', details: '', quantity: 1, unit_price: 20, line_total: 20 }],
    });

    expect((plans.findOneAndUpdate as any).mock.invocationCallOrder[0])
      .toBeLessThan(mockStorageProvider.delete.mock.invocationCallOrder[0]);
  });

  it('soft-deletes the plan before cleaning up its PDF', async () => {
    const plan = { id: 77, tenant_id: tenantId, user_id: scope.userId, client_id: scope.clientId, pdf_file_id: 900 };
    const plans = makeCollection({ findOne: vi.fn(async () => plan), updateOne: vi.fn(async () => ({ matchedCount: 1 })) });
    const files = makeCollection({ findOne: vi.fn(async () => ({ id: 900, storage_key: 'old.pdf' })) });
    mockGetMongoDbOrThrow.mockResolvedValue({ collection: (name: string) => name === 'treatment_plans' ? plans : files });

    await softDeleteTreatmentPlan(scope, 77);

    expect((plans.updateOne as any).mock.invocationCallOrder[0])
      .toBeLessThan(mockStorageProvider.delete.mock.invocationCallOrder[0]);
  });
});
