import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

const {
  mockGetMongoDbOrThrow,
  mockGetNextNumericId,
  mockGetAuthUser,
  mockCheckWriteRateLimit,
  mockInvalidateReadCaches,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockInvalidateReadCaches: vi.fn(),
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
}));

vi.mock('@/lib/cache-keys', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cache-keys')>('@/lib/cache-keys');
  return {
    ...actual,
    invalidateReadCaches: mockInvalidateReadCaches,
  };
});

import { POST } from '@/app/api/services/route';

describe('POST /api/services dentist ownership context', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0021');
  const dbUserId = new ObjectId('65f9a0e8f5f89f73d18b0022');
  const insertOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertOne.mockReset();
    mockGetAuthUser.mockResolvedValue({
      userId: 13,
      tenantId,
      dbUserId,
      email: 'dentist@example.com',
      name: 'Dentist',
    });
    mockGetNextNumericId.mockResolvedValue(55);
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockInvalidateReadCaches.mockResolvedValue(undefined);
    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'services') {
          return {
            insertOne,
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('creates services under the authenticated dentist scope and ignores legacy calendarId', async () => {
    const req = new NextRequest('http://localhost/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 12,
        name: 'Consultatie initiala',
        durationMinutes: 30,
        price: 150,
      }),
    });

    const res = await POST(req);
    const json = await res.json() as { service?: Doc };

    expect(res.status).toBe(201);
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne.mock.calls[0][0]).toMatchObject({
      id: 55,
      tenant_id: tenantId,
      user_id: 13,
      name: 'Consultatie initiala',
      duration_minutes: 30,
      price: 150,
    });
    expect(insertOne.mock.calls[0][0]).not.toHaveProperty('calendar_id');
    expect(json.service).toMatchObject({
      id: 55,
      user_id: 13,
      tenant_id: tenantId.toString(),
    });
    expect(mockInvalidateReadCaches).toHaveBeenCalledWith({
      tenantId,
      userId: 13,
    });
  });
});
