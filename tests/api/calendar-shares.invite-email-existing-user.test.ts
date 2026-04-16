import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

const {
  mockGetMongoDbOrThrow,
  mockGetNextNumericId,
  mockGetAuthUser,
  mockGetCalendarAuth,
  mockGetCalendarById,
  mockCheckWriteRateLimit,
  mockInvalidateReadCaches,
  mockCreateCalendarShareInviteToken,
  mockSendCalendarShareInviteEmail,
} = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockGetNextNumericId: vi.fn(),
  mockGetAuthUser: vi.fn(),
  mockGetCalendarAuth: vi.fn(),
  mockGetCalendarById: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockInvalidateReadCaches: vi.fn(),
  mockCreateCalendarShareInviteToken: vi.fn(),
  mockSendCalendarShareInviteEmail: vi.fn(),
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
  getAuthUser: mockGetAuthUser,
}));

vi.mock('@/lib/calendar-auth', () => ({
  getCalendarAuth: mockGetCalendarAuth,
  getCalendarById: mockGetCalendarById,
  normalizeCalendarPermissions: (permissions: Record<string, unknown>) => ({
    can_view: true,
    ...permissions,
  }),
}));

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

vi.mock('@/lib/calendar-share-invite', () => ({
  createCalendarShareInviteToken: mockCreateCalendarShareInviteToken,
  sendCalendarShareInviteEmail: mockSendCalendarShareInviteEmail,
}));

import { POST } from '@/app/api/calendars/[calendarId]/shares/route';

describe('POST /api/calendars/[calendarId]/shares', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0210');
  const ownerDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0211');
  const existingUserId = new ObjectId('65f9a0e8f5f89f73d18b0212');
  const insertOne = vi.fn();
  const shareFindOne = vi.fn();
  const userFindOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertOne.mockReset();
    shareFindOne.mockReset();
    userFindOne.mockReset();

    mockGetAuthUser.mockResolvedValue({
      userId: 15,
      dbUserId: ownerDbUserId,
      tenantId,
      email: 'owner@example.com',
      name: 'Owner',
    });
    mockGetCalendarAuth.mockResolvedValue({
      calendarId: 12,
      isOwner: true,
    });
    mockGetCalendarById.mockResolvedValue({
      id: 12,
      tenant_id: tenantId,
      name: 'Calendar principal',
      color: '#ec4899',
    });
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockGetNextNumericId.mockResolvedValue(55);
    mockInvalidateReadCaches.mockResolvedValue(undefined);
    mockCreateCalendarShareInviteToken.mockReturnValue({
      token: 'invite-token-123',
      tokenHash: 'invite-token-hash-123',
    });
    mockSendCalendarShareInviteEmail.mockResolvedValue({
      ok: true,
      provider: 'resend',
      id: 'email_123',
    });

    shareFindOne.mockResolvedValue(null);
    userFindOne.mockResolvedValue({
      _id: existingUserId,
      id: 87,
      email: 'staff@example.com',
      name: 'Staff User',
      tenant_id: tenantId,
      status: 'active',
    });

    mockGetMongoDbOrThrow.mockResolvedValue({
      collection(name: string) {
        if (name === 'calendar_shares') {
          return {
            findOne: shareFindOne,
            insertOne,
          };
        }
        if (name === 'users') {
          return {
            findOne: userFindOne,
          };
        }

        throw new Error(`Unexpected collection: ${name}`);
      },
    });
  });

  it('sends an invite email even when the recipient already has an account', async () => {
    const req = new NextRequest('http://localhost/api/calendars/12/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@example.com',
        permissions: {
          can_view: true,
          can_create: true,
          can_edit_own: true,
          can_edit_all: false,
          can_delete_own: true,
          can_delete_all: false,
        },
      }),
    });

    const response = await POST(req, {
      params: Promise.resolve({ calendarId: '12' }),
    });
    const payload = await response.json() as { share?: Doc; emailDelivery?: Doc };

    expect(response.status).toBe(201);
    expect(mockCreateCalendarShareInviteToken).toHaveBeenCalledTimes(1);
    expect(mockSendCalendarShareInviteEmail).toHaveBeenCalledWith({
      to: 'staff@example.com',
      inviterName: 'Owner',
      calendarName: 'Calendar principal',
      token: 'invite-token-123',
    });
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne.mock.calls[0][0]).toMatchObject({
      id: 55,
      calendar_id: 12,
      shared_with_user_id: existingUserId,
      shared_with_numeric_user_id: 87,
      shared_with_email: 'staff@example.com',
      invite_token_hash: 'invite-token-hash-123',
      status: 'pending',
    });
    expect(payload.emailDelivery).toMatchObject({
      sent: true,
      reason: 'sent',
    });
  });
});
