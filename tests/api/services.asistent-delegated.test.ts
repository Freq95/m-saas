import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMongoDbOrThrow,
  mockGetNextNumericId,
  mockGetAuthUser,
  mockCheckWriteRateLimit,
  mockCheckUpdateRateLimit,
  mockInvalidateReadCaches,
  mockLogAdminAudit,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockCheckUpdateRateLimit: vi.fn(),
  mockInvalidateReadCaches: vi.fn(),
  mockLogAdminAudit: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
    getNextNumericId: mockGetNextNumericId,
  };
});

vi.mock('@/lib/auth-helpers', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }
  return { AuthError, getAuthUser: mockGetAuthUser };
});

vi.mock('@/lib/rate-limit', () => ({
  checkWriteRateLimit: mockCheckWriteRateLimit,
  checkUpdateRateLimit: mockCheckUpdateRateLimit,
}));

vi.mock('@/lib/cache-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache-keys')>('@/lib/cache-keys');
  return { ...actual, invalidateReadCaches: mockInvalidateReadCaches };
});

vi.mock('@/lib/audit', () => ({
  logAdminAudit: mockLogAdminAudit,
}));

import { POST } from '@/app/api/services/route';
import { PATCH } from '@/app/api/services/[id]/route';

describe('asistent delegated services API', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0301');
  const dbUserId = new ObjectId('65f9a0e8f5f89f73d18b0302');
  const insertOne = vi.fn();
  const updateOne = vi.fn();
  const findOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertOne.mockReset();
    updateOne.mockReset();
    findOne.mockReset();
    mockGetAuthUser.mockResolvedValue({
      userId: 13,
      tenantId,
      dbUserId,
      email: 'assistant@example.com',
      name: 'Assistant',
      role: 'asistent',
      assigned_dentist_user_ids: [42],
    });
    mockGetNextNumericId.mockResolvedValue(88);
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockCheckUpdateRateLimit.mockResolvedValue(null);
    mockInvalidateReadCaches.mockResolvedValue(undefined);
    mockLogAdminAudit.mockResolvedValue(undefined);
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'users') return { findOne };
        if (name === 'services') return { insertOne, findOne, updateOne };
        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('allows an asistent to POST a service for an assigned dentist', async () => {
    findOne.mockResolvedValueOnce({ id: 42, role: 'dentist', tenant_id: tenantId });
    const req = new NextRequest('http://localhost/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dentistUserId: 42,
        name: 'Detartraj',
        durationMinutes: 45,
        price: 200,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(insertOne.mock.calls[0][0]).toMatchObject({
      id: 88,
      tenant_id: tenantId,
      user_id: 42,
      name: 'Detartraj',
    });
    expect(json.service.user_id).toBe(42);
    expect(mockInvalidateReadCaches).toHaveBeenCalledWith({
      tenantId,
      userId: 13,
      additionalScopes: [{ tenantId, userId: 42 }],
    });
  });

  it('allows an asistent to PATCH a delegated service by resolving service owner first', async () => {
    findOne
      .mockResolvedValueOnce({
        _id: new ObjectId('65f9a0e8f5f89f73d18b0303'),
        id: 77,
        tenant_id: tenantId,
        user_id: 42,
        name: 'Old',
        duration_minutes: 30,
        price: 100,
      })
      .mockResolvedValueOnce({
        _id: new ObjectId('65f9a0e8f5f89f73d18b0303'),
        id: 77,
        tenant_id: tenantId,
        user_id: 42,
        name: 'New',
        duration_minutes: 40,
        price: 150,
      });
    updateOne.mockResolvedValue({ matchedCount: 1 });

    const req = new NextRequest('http://localhost/api/services/77', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New', durationMinutes: 40, price: 150 }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '77' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(updateOne.mock.calls[0][0]).toEqual({
      id: 77,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    expect(json.service.name).toBe('New');
    expect(mockLogAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'service.edit_by_proxy',
      targetType: 'service',
    }));
  });
});
