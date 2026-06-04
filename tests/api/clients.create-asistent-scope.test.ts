import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetMongoDbOrThrow,
  mockGetAuthUser,
  mockCheckWriteRateLimit,
  mockFindMatchingClient,
  mockFindOrCreateClient,
  mockInvalidateReadCaches,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockFindMatchingClient: vi.fn(),
  mockFindOrCreateClient: vi.fn(),
  mockInvalidateReadCaches: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
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
}));

vi.mock('@/lib/client-matching', () => ({
  findMatchingClient: mockFindMatchingClient,
  findOrCreateClient: mockFindOrCreateClient,
}));

vi.mock('@/lib/cache-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache-keys')>('@/lib/cache-keys');
  return { ...actual, invalidateReadCaches: mockInvalidateReadCaches };
});

import { POST } from '@/app/api/clients/route';

describe('POST /api/clients asistent scope', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0401');
  const dbUserId = new ObjectId('65f9a0e8f5f89f73d18b0402');
  const usersFindOne = vi.fn();
  const clientsUpdateOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    usersFindOne.mockReset();
    clientsUpdateOne.mockReset();
    mockGetAuthUser.mockResolvedValue({
      userId: 13,
      tenantId,
      dbUserId,
      email: 'assistant@example.com',
      name: 'Assistant',
      role: 'asistent',
      assigned_dentist_user_ids: [42],
    });
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockFindMatchingClient.mockResolvedValue(null);
    mockFindOrCreateClient.mockResolvedValue({
      id: 501,
      user_id: 42,
      tenant_id: tenantId,
      name: 'Ana Pop',
      email: null,
      phone: '+40722111222',
    });
    mockInvalidateReadCaches.mockResolvedValue(undefined);
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'users') return { findOne: usersFindOne };
        if (name === 'clients') return { updateOne: clientsUpdateOne };
        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('creates under the assigned dentist when an asistent does not send dentistUserId', async () => {
    usersFindOne.mockResolvedValue({ id: 42, tenant_id: tenantId, role: 'dentist' });

    const req = new NextRequest('http://localhost/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ana Pop',
        phone: '+40722111222',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(mockFindOrCreateClient).toHaveBeenCalledWith(
      42,
      tenantId,
      'Ana Pop',
      undefined,
      '+40722111222',
      false
    );
    expect(json.client.user_id).toBe(42);
    expect(mockInvalidateReadCaches).toHaveBeenCalledWith({
      tenantId,
      userId: 13,
      additionalScopes: [{ tenantId, userId: 42 }],
    });
  });

  it('returns an existing same-name patient without writing before duplicate confirmation', async () => {
    usersFindOne.mockResolvedValue({ id: 42, tenant_id: tenantId, role: 'dentist' });
    mockFindMatchingClient.mockResolvedValue({
      id: 777,
      user_id: 42,
      tenant_id: tenantId,
      name: 'Ana Pop',
      email: 'old@example.com',
      phone: '+40722111222',
    });

    const req = new NextRequest('http://localhost/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ana Pop',
        phone: '+40722111222',
        notes: 'should not be applied before confirmation',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.matched).toBe(true);
    expect(json.client.id).toBe(777);
    expect(mockFindOrCreateClient).not.toHaveBeenCalled();
    expect(clientsUpdateOne).not.toHaveBeenCalled();
    expect(mockInvalidateReadCaches).not.toHaveBeenCalled();
  });
});
