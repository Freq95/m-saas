import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown>;

type DbState = {
  users: Array<Doc>;
  password_reset_tokens: Array<Doc>;
  lastTokenId: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (isObject(left) && isObject(right) && 'toString' in left && 'toString' in right) {
    return String(left) === String(right);
  }
  return left === right;
}

function matchesFilter(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, rawCondition]) => {
    const value = doc[key];
    if (!isObject(rawCondition) || rawCondition instanceof Date || Array.isArray(rawCondition)) {
      return isEqualValue(value, rawCondition);
    }

    if ('$gt' in rawCondition) return (value as Date) > (rawCondition.$gt as Date);
    if ('$lt' in rawCondition) return (value as Date) < (rawCondition.$lt as Date);
    if ('$ne' in rawCondition) return !isEqualValue(value, rawCondition.$ne);
    if ('$exists' in rawCondition) {
      const exists = typeof value !== 'undefined';
      return exists === Boolean(rawCondition.$exists);
    }
    return isEqualValue(value, rawCondition);
  });
}

function applyUpdate(doc: Doc, update: Doc) {
  if (isObject(update.$set)) {
    Object.assign(doc, update.$set);
  }
  if (isObject(update.$unset)) {
    for (const key of Object.keys(update.$unset)) {
      delete doc[key];
    }
  }
}

function createFakeDb(state: DbState) {
  return {
    collection(name: 'users' | 'password_reset_tokens') {
      if (name === 'users') {
        return {
          findOne: vi.fn(async (filter: Doc) => state.users.find((doc) => matchesFilter(doc, filter)) ?? null),
          updateOne: vi.fn(async (filter: Doc, update: Doc) => {
            const doc = state.users.find((item) => matchesFilter(item, filter));
            if (!doc) return { matchedCount: 0 };
            applyUpdate(doc, update);
            return { matchedCount: 1 };
          }),
        };
      }

      return {
        createIndexes: vi.fn(async () => undefined),
        insertOne: vi.fn(async (doc: Doc) => {
          const insertedId = `token-${++state.lastTokenId}`;
          state.password_reset_tokens.push({ ...doc, _id: insertedId });
          return { insertedId };
        }),
        findOne: vi.fn(async (filter: Doc) =>
          state.password_reset_tokens.find((doc) => matchesFilter(doc, filter)) ?? null
        ),
        findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc) => {
          const doc = state.password_reset_tokens.find((item) => matchesFilter(item, filter));
          if (!doc) return null;
          const before = { ...doc };
          applyUpdate(doc, update);
          return before;
        }),
        deleteMany: vi.fn(async (filter: Doc) => {
          const before = state.password_reset_tokens.length;
          state.password_reset_tokens = state.password_reset_tokens.filter((doc) => !matchesFilter(doc, filter));
          return { deletedCount: before - state.password_reset_tokens.length };
        }),
        deleteOne: vi.fn(async (filter: Doc) => {
          const index = state.password_reset_tokens.findIndex((doc) => matchesFilter(doc, filter));
          if (index < 0) return { deletedCount: 0 };
          state.password_reset_tokens.splice(index, 1);
          return { deletedCount: 1 };
        }),
      };
    },
  };
}

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const { mockGetMongoDbOrThrow, mockSendEmail } = vi.hoisted(() => ({
  mockGetMongoDbOrThrow: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('@/lib/db/mongo-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/mongo-utils')>('@/lib/db/mongo-utils');
  return {
    ...actual,
    getMongoDbOrThrow: mockGetMongoDbOrThrow,
  };
});

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => null,
}));

vi.mock('@/lib/auth-helpers', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }
  return { AuthError };
});

import { POST as forgotPasswordPost } from '@/app/api/auth/forgot-password/route';
import { GET as resetPasswordGet, POST as resetPasswordPost } from '@/app/api/auth/reset-password/route';

describe('password reset lifecycle', () => {
  let state: DbState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      users: [
        {
          _id: 'user-1',
          email: 'user@example.com',
          status: 'active',
          password_hash: 'old-hash',
        },
      ],
      password_reset_tokens: [],
      lastTokenId: 0,
    };
    mockGetMongoDbOrThrow.mockResolvedValue(createFakeDb(state));
    mockSendEmail.mockResolvedValue({ ok: true });
  });

  it('issues a reset token and validates it while active', async () => {
    const forgotReq = new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '10.0.0.1',
      },
      body: JSON.stringify({ email: 'user@example.com' }),
    });

    const forgotRes = await forgotPasswordPost(forgotReq);
    expect(forgotRes.status).toBe(200);
    expect(state.password_reset_tokens).toHaveLength(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const html = String(mockSendEmail.mock.calls[0][0]?.html ?? '');
    const tokenMatch = html.match(/token=([^"']+)/);
    expect(tokenMatch).not.toBeNull();

    const token = decodeURIComponent(String(tokenMatch?.[1] ?? ''));
    expect(state.password_reset_tokens[0]?.token_hash).toBe(sha256(token));

    const validateReq = new NextRequest(`http://localhost/api/auth/reset-password?token=${token}`);
    const validateRes = await resetPasswordGet(validateReq);
    expect(validateRes.status).toBe(200);
    await expect(validateRes.json()).resolves.toEqual({ valid: true });
  });

  it('enforces single-use and denies replay after successful reset', async () => {
    const token = 'single-use-token';
    state.password_reset_tokens.push({
      _id: 'token-1',
      user_id: 'user-1',
      email: 'user@example.com',
      token_hash: sha256(token),
      expires_at: new Date(Date.now() + 60_000),
      used_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const resetReq = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'NewPassword123!' }),
    });
    const firstRes = await resetPasswordPost(resetReq);
    expect(firstRes.status).toBe(200);
    await expect(firstRes.json()).resolves.toEqual({ success: true });
    expect(state.users[0]?.password_hash).not.toBe('old-hash');
    expect(state.password_reset_tokens).toHaveLength(0);

    const replayReq = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'AnotherPass123!' }),
    });
    const replayRes = await resetPasswordPost(replayReq);
    expect(replayRes.status).toBe(400);
    await expect(replayRes.json()).resolves.toEqual({ error: 'Token invalid sau expirat.' });
  });

  it('denies expired tokens', async () => {
    const token = 'expired-token';
    state.password_reset_tokens.push({
      _id: 'token-1',
      user_id: 'user-1',
      email: 'user@example.com',
      token_hash: sha256(token),
      expires_at: new Date(Date.now() - 60_000),
      used_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const resetReq = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'ValidPass123!' }),
    });
    const res = await resetPasswordPost(resetReq);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Token invalid sau expirat.' });
  });
});
