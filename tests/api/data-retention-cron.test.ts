import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHasValidCronSecret, mockRunDataRetention, mockRetentionOptionsFromEnv } = vi.hoisted(() => ({
  mockHasValidCronSecret: vi.fn(),
  mockRunDataRetention: vi.fn(),
  mockRetentionOptionsFromEnv: vi.fn(),
}));

vi.mock('@/lib/cron-auth', () => ({ hasValidCronSecret: mockHasValidCronSecret }));
vi.mock('@/lib/error-handler', () => ({
  createErrorResponse: (message: string, status: number) => Response.json({ error: message }, { status }),
  createSuccessResponse: (data: unknown) => Response.json(data),
  handleApiError: () => Response.json({ error: 'Internal error' }, { status: 500 }),
}));
vi.mock('@/lib/server/data-retention', () => ({
  runDataRetention: mockRunDataRetention,
  retentionOptionsFromEnv: mockRetentionOptionsFromEnv,
}));

import { GET } from '@/app/api/cron/data-retention/route';

describe('GET /api/cron/data-retention', () => {
  const originalEnabled = process.env.GDPR_RETENTION_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GDPR_RETENTION_ENABLED = 'true';
    mockHasValidCronSecret.mockReturnValue(true);
    mockRetentionOptionsFromEnv.mockReturnValue({ execute: false });
    mockRunDataRetention.mockResolvedValue({ mode: 'dry-run', eligible: 2 });
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.GDPR_RETENTION_ENABLED;
    else process.env.GDPR_RETENTION_ENABLED = originalEnabled;
  });

  it('stays disabled until explicitly enabled', async () => {
    process.env.GDPR_RETENTION_ENABLED = 'false';

    const response = await GET(new NextRequest('http://localhost/api/cron/data-retention'));

    expect(response.status).toBe(503);
    expect(mockRunDataRetention).not.toHaveBeenCalled();
  });

  it('rejects requests without the cron secret', async () => {
    mockHasValidCronSecret.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/cron/data-retention'));

    expect(response.status).toBe(401);
    expect(mockRunDataRetention).not.toHaveBeenCalled();
  });

  it('runs with environment-derived safety controls', async () => {
    const response = await GET(new NextRequest('http://localhost/api/cron/data-retention'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRunDataRetention).toHaveBeenCalledWith({ execute: false });
    expect(body).toMatchObject({ mode: 'dry-run', eligible: 2 });
  });
});
