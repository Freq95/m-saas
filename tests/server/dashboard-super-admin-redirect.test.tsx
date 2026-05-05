import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetAuthUser, mockRedirectToLogin, mockGetCached, mockGetCalendarListForUser } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockRedirectToLogin: vi.fn(),
  mockGetCached: vi.fn(),
  mockGetCalendarListForUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getAuthUser: mockGetAuthUser,
  redirectToLogin: mockRedirectToLogin,
}));

vi.mock('@/lib/redis', () => ({
  getCached: mockGetCached,
}));

vi.mock('@/lib/cache-keys', () => ({
  dashboardCacheKey: vi.fn(() => 'dashboard:key'),
  dashboardVisibleCalendarsCacheKey: vi.fn(() => 'dashboard:key'),
}));

vi.mock('@/lib/server/dashboard', () => ({
  getDashboardData: vi.fn(),
}));

vi.mock('@/lib/server/calendars-list', () => ({
  getCalendarListForUser: mockGetCalendarListForUser,
}));

import DashboardPage from '@/app/dashboard/page';

describe('dashboard auth routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands SUPER_ADMIN_REDIRECT errors from getAuthUser to redirectToLogin', async () => {
    const err = Object.assign(new Error('Super-admins must use the admin dashboard'), {
      name: 'AuthError',
      code: 'SUPER_ADMIN_REDIRECT',
      status: 403,
    });
    mockGetAuthUser.mockRejectedValue(err);
    mockRedirectToLogin.mockImplementation((e: unknown) => {
      throw new Error(`REDIRECT_TO_LOGIN:${(e as { code?: string })?.code ?? 'unknown'}`);
    });

    await expect(DashboardPage()).rejects.toThrow('REDIRECT_TO_LOGIN:SUPER_ADMIN_REDIRECT');

    expect(mockGetAuthUser).toHaveBeenCalledOnce();
    expect(mockRedirectToLogin).toHaveBeenCalledWith(err);
  });
});
