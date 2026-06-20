import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, any>;

const {
  mockGetMongoDbOrThrow,
  mockGetNextNumericId,
  mockGetAuthUser,
  mockCheckUpdateRateLimit,
  mockInvalidateReadCaches,
  mockStorageDelete,
  mockEvaluateEligibility,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockCheckUpdateRateLimit: vi.fn(),
  mockInvalidateReadCaches: vi.fn(),
  mockStorageDelete: vi.fn(),
  mockEvaluateEligibility: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
    getNextNumericId: mockGetNextNumericId,
  };
});

vi.mock('@/lib/auth-helpers', () => ({
  AuthError: class AuthError extends Error { status = 401; },
  getAuthUser: mockGetAuthUser,
  isClinicalRole: (role: string) => role === 'owner' || role === 'dentist',
}));
vi.mock('@/lib/server/patient-retention', () => ({
  evaluatePatientErasureEligibility: mockEvaluateEligibility,
}));
vi.mock('@/lib/rate-limit', () => ({ checkUpdateRateLimit: mockCheckUpdateRateLimit }));
vi.mock('@/lib/cache-keys', () => ({ invalidateReadCaches: mockInvalidateReadCaches }));
vi.mock('@/lib/storage', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => ({ delete: mockStorageDelete })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DELETE } from '@/app/api/clients/[id]/gdpr-erase/route';

function makeCollection(findDocs: Doc[] = [], findOneDoc: Doc | null = null) {
  return {
    findOne: vi.fn(async () => findOneDoc),
    find: vi.fn(() => ({ toArray: vi.fn(async () => findDocs) })),
    deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    insertOne: vi.fn(async () => ({ acknowledged: true })),
    updateOne: vi.fn(async () => ({ matchedCount: 1 })),
  };
}

describe('DELETE /api/clients/[id]/gdpr-erase', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0601');
  const clientId = 301;
  let collections: Record<string, ReturnType<typeof makeCollection>>;
  let withTransaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({ userId: 42, tenantId, role: 'dentist' });
    mockCheckUpdateRateLimit.mockResolvedValue(null);
    mockGetNextNumericId.mockResolvedValue(9001);
    mockInvalidateReadCaches.mockResolvedValue(undefined);
    mockStorageDelete.mockResolvedValue(undefined);
    mockEvaluateEligibility.mockResolvedValue({ eligible: true, reason: null });

    collections = {
      clients: makeCollection([], {
        id: clientId,
        user_id: 42,
        tenant_id: tenantId,
        consent_document_key: 'consent.pdf',
      }),
      client_files: makeCollection([{ storage_key: 'patient-file.pdf' }]),
      contact_files: makeCollection([{ storage_key: 'legacy-file.jpg' }]),
      conversations: makeCollection([{ id: 71 }]),
      appointments: makeCollection([{ id: 81 }]),
      message_attachments: makeCollection([{ storage_key: 'message-file.png' }]),
      messages: makeCollection(),
      conversation_tags: makeCollection(),
      reminders: makeCollection(),
      client_notes: makeCollection(),
      contact_notes: makeCollection(),
      contact_custom_fields: makeCollection(),
      tooth_states: makeCollection(),
      tooth_events: makeCollection(),
      surgery_groups: makeCollection(),
      bridge_groups: makeCollection(),
      treatment_plans: makeCollection(),
      treatment_plan_public_links: makeCollection(),
      data_access_logs: makeCollection(),
      gdpr_erasures: makeCollection(),
      erasure_storage_cleanup_jobs: makeCollection(),
    };
    withTransaction = vi.fn(async (callback: () => Promise<void>) => callback());
    mockGetMongoDbOrThrow.mockResolvedValue({
      client: {
        startSession: vi.fn(() => ({ withTransaction, endSession: vi.fn(async () => undefined) })),
      },
      collection(name: string) {
        const collection = collections[name];
        if (!collection) throw new Error(`Unexpected collection: ${name}`);
        return collection;
      },
    });
  });

  function request() {
    return new NextRequest(`http://localhost/api/clients/${clientId}/gdpr-erase`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
  }

  it('deletes storage and every patient-linked collection within the tenant', async () => {
    const response = await DELETE(request(), { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(200);
    expect(withTransaction).toHaveBeenCalledOnce();
    expect(mockStorageDelete).toHaveBeenCalledTimes(4);
    expect(new Set(mockStorageDelete.mock.calls.map(([key]) => key))).toEqual(new Set([
      'consent.pdf',
      'patient-file.pdf',
      'legacy-file.jpg',
      'message-file.png',
    ]));

    const directClientCollections = [
      'appointments', 'client_files', 'client_notes', 'tooth_states', 'tooth_events',
      'surgery_groups', 'bridge_groups', 'treatment_plans', 'treatment_plan_public_links',
    ];
    for (const name of directClientCollections) {
      expect(collections[name].deleteMany).toHaveBeenCalledWith({ client_id: clientId, tenant_id: tenantId }, expect.any(Object));
    }
    expect(collections.contact_files.deleteMany).toHaveBeenCalledWith({ contact_id: clientId, tenant_id: tenantId }, expect.any(Object));
    expect(collections.contact_notes.deleteMany).toHaveBeenCalledWith({ contact_id: clientId, tenant_id: tenantId }, expect.any(Object));
    expect(collections.contact_custom_fields.deleteMany).toHaveBeenCalledWith({ contact_id: clientId, tenant_id: tenantId }, expect.any(Object));
    expect(collections.messages.deleteMany).toHaveBeenCalledWith({ conversation_id: { $in: [71] }, tenant_id: tenantId }, expect.any(Object));
    expect(collections.message_attachments.deleteMany).toHaveBeenCalledWith({ conversation_id: { $in: [71] }, tenant_id: tenantId }, expect.any(Object));
    expect(collections.conversation_tags.deleteMany).toHaveBeenCalledWith({ conversation_id: { $in: [71] }, tenant_id: tenantId }, expect.any(Object));
    expect(collections.conversations.deleteMany).toHaveBeenCalledWith({ client_id: clientId, tenant_id: tenantId }, expect.any(Object));
    expect(collections.reminders.deleteMany).toHaveBeenCalledWith({ appointment_id: { $in: [81] }, tenant_id: tenantId }, expect.any(Object));
    expect(collections.data_access_logs.deleteMany).toHaveBeenCalledWith({
      tenant_id: tenantId,
      $or: [
        { target_id: clientId, target_type: { $regex: '^client(?:\\.|$)' } },
        { route: { $regex: `/clients/${clientId}(?:/|$)` } },
      ],
    }, expect.any(Object));
    expect(collections.clients.deleteOne).toHaveBeenCalledWith({ id: clientId, tenant_id: tenantId }, expect.any(Object));
    expect(collections.gdpr_erasures.insertOne).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId,
      erased_by_user_id: 42,
      record_count: expect.any(Number),
      file_count: 4,
    }), expect.any(Object));
  });

  it('does not erase a patient outside the authenticated user and tenant scope', async () => {
    collections.clients.findOne.mockResolvedValue(null);

    const response = await DELETE(request(), { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(404);
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(Object.values(collections).every((collection) => collection.deleteMany.mock.calls.length === 0)).toBe(true);
  });

  it('commits database erasure and queues only failed R2 objects for retry', async () => {
    mockStorageDelete.mockImplementation(async (key: string) => {
      if (key === 'legacy-file.jpg') throw new Error('R2 unavailable');
    });

    const response = await DELETE(request(), { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(200);
    expect(collections.clients.deleteOne).toHaveBeenCalled();
    expect(collections.gdpr_erasures.insertOne).toHaveBeenCalled();
    expect(collections.erasure_storage_cleanup_jobs.updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $set: expect.objectContaining({ storage_keys: ['legacy-file.jpg'] }) })
    );
  });

  it('blocks erasure during the legal retention period', async () => {
    mockEvaluateEligibility.mockResolvedValue({ eligible: false, reason: 'retention-period' });
    const response = await DELETE(request(), { params: Promise.resolve({ id: String(clientId) }) });
    expect(response.status).toBe(409);
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(collections.clients.deleteOne).not.toHaveBeenCalled();
  });

  it('blocks non-clinical roles', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 42, tenantId, role: 'receptionist' });
    const response = await DELETE(request(), { params: Promise.resolve({ id: String(clientId) }) });
    expect(response.status).toBe(403);
    expect(mockEvaluateEligibility).not.toHaveBeenCalled();
  });
});
