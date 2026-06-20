import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, any>;

const { mockEraseClientData, mockStorageDelete, mockStorageList } = vi.hoisted(() => ({
  mockEraseClientData: vi.fn(),
  mockStorageDelete: vi.fn(),
  mockStorageList: vi.fn(),
}));

vi.mock('@/lib/server/gdpr-erasure', () => ({ eraseClientData: mockEraseClientData }));
vi.mock('@/lib/storage', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => ({
    delete: mockStorageDelete,
    list: mockStorageList,
  })),
}));

import { runDataRetention } from '@/lib/server/data-retention';

function cursor(rows: Doc[]) {
  return {
    sort() { return this; },
    limit() { return this; },
    project() { return this; },
    async toArray() { return rows; },
  };
}

function makeDb(patients: Doc[], referencedStorageKeys = new Set<string>()) {
  const clientsFind = vi.fn((query: Doc) => cursor(patients));
  const retentionInsert = vi.fn(async () => ({ acknowledged: true }));
  const collections = new Map<string, any>();
  const names = [
    'appointments', 'conversations', 'client_notes', 'contact_notes', 'client_files',
    'contact_files', 'tooth_events', 'surgery_groups', 'bridge_groups', 'treatment_plans',
    'message_attachments', 'treatment_plan_settings',
  ];
  for (const name of names) {
    collections.set(name, {
      findOne: vi.fn(async (query: Doc) => {
        const key = query.storage_key || query.consent_document_key || query.logo_storage_key || query.logo_storage_key_snapshot;
        return key && referencedStorageKeys.has(key) ? { _id: 1 } : null;
      }),
    });
  }
  collections.set('clients', {
    find: clientsFind,
    findOne: vi.fn(async (query: Doc) => {
      const key = query.consent_document_key;
      return key && referencedStorageKeys.has(key) ? { _id: 1 } : null;
    }),
  });
  collections.set('retention_runs', { insertOne: retentionInsert });

  return {
    db: {
      collection(name: string) {
        const collection = collections.get(name);
        if (!collection) throw new Error(`Unexpected collection: ${name}`);
        return collection;
      },
    } as any,
    clientsFind,
    retentionInsert,
  };
}

describe('data retention runner', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0701');
  const now = new Date('2026-06-20T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mockEraseClientData.mockResolvedValue({ recordsDeleted: 12, filesDeleted: 2 });
    mockStorageDelete.mockResolvedValue(undefined);
    mockStorageList.mockResolvedValue({ objects: [], continuationToken: null });
  });

  it('dry-runs eligible soft-deleted patients and enforces legal-hold filtering', async () => {
    const oldPatient = {
      id: 301,
      tenant_id: tenantId,
      deleted_at: '2026-04-01T00:00:00.000Z',
      created_at: '2018-01-01T00:00:00.000Z',
      last_activity_date: '2020-01-01T00:00:00.000Z',
    };
    const recentPatient = {
      id: 302,
      tenant_id: tenantId,
      deleted_at: '2026-04-01T00:00:00.000Z',
      created_at: '2020-01-01T00:00:00.000Z',
      last_activity_date: '2024-01-01T00:00:00.000Z',
    };
    const { db, clientsFind, retentionInsert } = makeDb([oldPatient, recentPatient]);

    const result = await runDataRetention({ db, now, clinicalYears: 1, execute: false });

    expect(result).toMatchObject({
      mode: 'dry-run',
      candidates: 2,
      eligible: 1,
      deleted: 0,
      skippedRecentActivity: 1,
      clinicalCutoff: '2021-06-20T12:00:00.000Z',
    });
    expect(clientsFind).toHaveBeenCalledWith(expect.objectContaining({
      retention_legal_hold: { $ne: true },
    }));
    expect(mockEraseClientData).not.toHaveBeenCalled();
    expect(retentionInsert).toHaveBeenCalledWith(expect.objectContaining({ mode: 'dry-run', eligible: 1 }));
  });

  it('executes the shared erasure cascade for eligible patients', async () => {
    const { db } = makeDb([{
      id: 301,
      tenant_id: tenantId,
      deleted_at: '2026-04-01T00:00:00.000Z',
      created_at: '2018-01-01T00:00:00.000Z',
      last_activity_date: '2020-01-01T00:00:00.000Z',
    }]);

    const result = await runDataRetention({ db, now, execute: true });

    expect(result.deleted).toBe(1);
    expect(mockEraseClientData).toHaveBeenCalledWith({
      db,
      tenantId,
      clientId: 301,
      erasedByUserId: null,
      reason: 'retention-policy',
    });
  });

  it('deletes only old, unreferenced tenant storage objects in execute mode', async () => {
    const referenced = new Set(['tenants/a/clients/1/referenced.pdf']);
    const { db } = makeDb([], referenced);
    mockStorageList.mockResolvedValue({
      objects: [
        { key: 'tenants/a/clients/1/referenced.pdf', lastModified: new Date('2025-01-01T00:00:00.000Z') },
        { key: 'tenants/a/clients/1/orphan.pdf', lastModified: new Date('2025-01-01T00:00:00.000Z') },
        { key: 'tenants/a/clients/1/recent.pdf', lastModified: new Date('2026-06-10T00:00:00.000Z') },
      ],
      continuationToken: null,
    });

    const result = await runDataRetention({ db, now, execute: true, orphanCleanup: true });

    expect(result).toMatchObject({ orphanScanned: 3, orphanCandidates: 1, orphanDeleted: 1 });
    expect(mockStorageDelete).toHaveBeenCalledOnce();
    expect(mockStorageDelete).toHaveBeenCalledWith('tenants/a/clients/1/orphan.pdf');
  });
});
