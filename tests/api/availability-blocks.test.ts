import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAuthUser,
  mockCheckWriteRateLimit,
  mockCheckUpdateRateLimit,
  mockListAvailabilityBlocks,
  mockCreateAvailabilityBlock,
  mockUpdateAvailabilityBlock,
  mockDeleteAvailabilityBlock,
} = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockCheckWriteRateLimit: vi.fn(),
  mockCheckUpdateRateLimit: vi.fn(),
  mockListAvailabilityBlocks: vi.fn(),
  mockCreateAvailabilityBlock: vi.fn(),
  mockUpdateAvailabilityBlock: vi.fn(),
  mockDeleteAvailabilityBlock: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkWriteRateLimit: mockCheckWriteRateLimit,
  checkUpdateRateLimit: mockCheckUpdateRateLimit,
}));

vi.mock('@/lib/availability-blocks', () => ({
  listAvailabilityBlocks: mockListAvailabilityBlocks,
  createAvailabilityBlock: mockCreateAvailabilityBlock,
  updateAvailabilityBlock: mockUpdateAvailabilityBlock,
  deleteAvailabilityBlock: mockDeleteAvailabilityBlock,
}));

import { GET, POST } from '@/app/api/availability-blocks/route';
import { PATCH, DELETE } from '@/app/api/availability-blocks/[id]/route';

describe('/api/availability-blocks', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b0401');
  const auth = {
    userId: 7,
    tenantId,
    dbUserId: new ObjectId('65f9a0e8f5f89f73d18b0402'),
    email: 'dentist@example.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(auth);
    mockCheckWriteRateLimit.mockResolvedValue(null);
    mockCheckUpdateRateLimit.mockResolvedValue(null);
  });

  it('lists blocks for the requested calendars and date range', async () => {
    mockListAvailabilityBlocks.mockResolvedValue([
      {
        id: 11,
        calendar_id: 22,
        type_label: 'Curs',
        reason: 'Curs Brasov',
        start_time: '2026-06-04T06:00:00.000Z',
        end_time: '2026-06-04T10:00:00.000Z',
        all_day: false,
      },
    ]);

    const req = new NextRequest('http://localhost/api/availability-blocks?startDate=2026-06-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.000Z&calendarIds=22,23');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.blocks).toHaveLength(1);
    expect(mockListAvailabilityBlocks).toHaveBeenCalledWith(expect.objectContaining({
      auth,
      calendarIds: [22, 23],
    }));
  });

  it('rejects an empty free-text type label', async () => {
    const req = new NextRequest('http://localhost/api/availability-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        typeLabel: '   ',
        reason: 'Curs Brasov',
        startTime: '2026-06-04T06:00:00.000Z',
        endTime: '2026-06-04T10:00:00.000Z',
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Tipul');
    expect(mockCreateAvailabilityBlock).not.toHaveBeenCalled();
  });

  it('creates a free-text block and returns warning data for existing overlaps', async () => {
    mockCreateAvailabilityBlock.mockResolvedValue({
      block: {
        id: 12,
        calendar_id: 22,
        type_label: 'Colaborator',
        reason: 'Chirurg in cabinet',
        start_time: '2026-06-04T06:00:00.000Z',
        end_time: '2026-06-04T10:00:00.000Z',
        all_day: false,
      },
      overlappingAppointments: [{ id: 901, client_name: 'Ana Test' }],
    });

    const req = new NextRequest('http://localhost/api/availability-blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        typeLabel: 'Colaborator',
        reason: 'Chirurg in cabinet',
        startTime: '2026-06-04T06:00:00.000Z',
        endTime: '2026-06-04T10:00:00.000Z',
        allDay: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.block.type_label).toBe('Colaborator');
    expect(json.warning).toContain('exista programari');
    expect(json.overlappingAppointments).toEqual([{ id: 901, client_name: 'Ana Test' }]);
    expect(mockCreateAvailabilityBlock).toHaveBeenCalledWith(expect.objectContaining({
      typeLabel: 'Colaborator',
      reason: 'Chirurg in cabinet',
    }));
  });

  it('updates and deletes a block by id', async () => {
    mockUpdateAvailabilityBlock.mockResolvedValue({
      block: { id: 12, type_label: 'Curs', reason: 'Curs Brasov' },
      overlappingAppointments: [],
    });
    mockDeleteAvailabilityBlock.mockResolvedValue(undefined);

    const patchReq = new NextRequest('http://localhost/api/availability-blocks/12', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        typeLabel: 'Curs',
        reason: 'Curs Brasov',
      }),
    });
    const patchRes = await PATCH(patchReq, { params: Promise.resolve({ id: '12' }) });
    const patchJson = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patchJson.block.type_label).toBe('Curs');
    expect(mockUpdateAvailabilityBlock).toHaveBeenCalledWith(expect.objectContaining({
      blockId: 12,
      patch: expect.objectContaining({ typeLabel: 'Curs', reason: 'Curs Brasov' }),
    }));

    const deleteReq = new NextRequest('http://localhost/api/availability-blocks/12', { method: 'DELETE' });
    const deleteRes = await DELETE(deleteReq, { params: Promise.resolve({ id: '12' }) });

    expect(deleteRes.status).toBe(200);
    expect(mockDeleteAvailabilityBlock).toHaveBeenCalledWith({ auth, blockId: 12 });
  });
});
