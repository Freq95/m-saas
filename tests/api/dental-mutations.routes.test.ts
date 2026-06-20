import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAuthUser,
  mockResolveScope,
  mockRateLimit,
  mockGetDb,
  mockNextId,
  mockRecompute,
  mockGetDentalData,
  mockCreateSurgery,
  mockCreateBridge,
} = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockResolveScope: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetDb: vi.fn(),
  mockNextId: vi.fn(),
  mockRecompute: vi.fn(),
  mockGetDentalData: vi.fn(),
  mockCreateSurgery: vi.fn(),
  mockCreateBridge: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getAuthUser: mockGetAuthUser,
  isClinicalRole: (role: string) => role === 'owner' || role === 'dentist',
}));
vi.mock('@/lib/client-permissions', () => ({ resolveClientScopeForClient: mockResolveScope }));
vi.mock('@/lib/rate-limit', () => ({
  checkWriteRateLimit: mockRateLimit,
  checkUpdateRateLimit: mockRateLimit,
}));
vi.mock('@/lib/db/mongo-utils', () => ({
  getMongoDbOrThrow: mockGetDb,
  getNextNumericId: mockNextId,
  stripMongoId: (doc: unknown) => doc,
}));
vi.mock('@/lib/dental/recompute', () => ({ recomputeToothState: mockRecompute }));
vi.mock('@/lib/server/dental', () => ({ getDentalData: mockGetDentalData }));
vi.mock('@/lib/server/surgery', () => ({ createSurgeryGroup: mockCreateSurgery }));
vi.mock('@/lib/server/bridges', () => ({ createBridgeGroup: mockCreateBridge }));
vi.mock('@/lib/error-handler', () => ({
  createErrorResponse: (message: string, status: number, details?: unknown) =>
    Response.json({ error: message, details }, { status }),
  createSuccessResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: () => Response.json({ error: 'Internal error' }, { status: 500 }),
}));

import { POST as POST_EVENT } from '@/app/api/clients/[id]/dental/events/route';
import { POST as POST_SURGERY } from '@/app/api/clients/[id]/dental/surgery/route';
import { POST as POST_BRIDGE } from '@/app/api/clients/[id]/dental/bridges/route';
import { PATCH as PATCH_TOOTH } from '@/app/api/clients/[id]/dental/teeth/[fdi]/route';
import { PATCH as PATCH_EVENT, DELETE as DELETE_EVENT } from '@/app/api/clients/[id]/dental/events/[eid]/route';

describe('dental mutation route authorization and scope', () => {
  const viewerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0901');
  const ownerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0902');
  const auth = { userId: 13, tenantId: viewerTenantId, role: 'dentist', name: 'Dr. Test' };
  const scope = { userId: 42, tenantId: ownerTenantId };
  const clientId = 301;
  const insertOne = vi.fn();
  const findOne = vi.fn();
  const updateOne = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(auth);
    mockResolveScope.mockResolvedValue(scope);
    mockRateLimit.mockResolvedValue(null);
    mockNextId.mockResolvedValue(91);
    mockRecompute.mockResolvedValue(undefined);
    mockGetDentalData.mockResolvedValue({ teeth: [], events: [] });
    mockCreateSurgery.mockResolvedValue({ id: 51 });
    mockCreateBridge.mockResolvedValue({ id: 61 });
    insertOne.mockResolvedValue({ acknowledged: true });
    findOne.mockResolvedValue({ id: 91, tooth_fdi: 11 });
    updateOne.mockResolvedValue({ matchedCount: 1 });
    mockGetDb.mockResolvedValue({ collection: () => ({ insertOne, findOne, updateOne }) });
  });

  it('blocks non-clinical users before resolving patient scope', async () => {
    mockGetAuthUser.mockResolvedValue({ ...auth, role: 'receptionist' });
    const request = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tooth_fdi: 11, surfaces: [], issue_type: 'caries', action: 'diagnosed' }),
    });

    const response = await POST_EVENT(request, { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(403);
    expect(mockResolveScope).not.toHaveBeenCalled();
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('returns 404 and performs no mutation for an inaccessible patient', async () => {
    mockResolveScope.mockResolvedValue(null);
    const request = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tooth_fdi: 11, surfaces: [], issue_type: 'caries', action: 'diagnosed' }),
    });

    const response = await POST_EVENT(request, { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(404);
    expect(mockGetDb).not.toHaveBeenCalled();
    expect(mockNextId).not.toHaveBeenCalled();
  });

  it('creates a dental event and recomputes inside the resolved owner scope', async () => {
    const request = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tooth_fdi: 11,
        surfaces: ['O'],
        issue_type: 'caries',
        severity: 'moderate',
        action: 'diagnosed',
      }),
    });

    const response = await POST_EVENT(request, { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(201);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: ownerTenantId,
      user_id: 42,
      client_id: clientId,
      tooth_fdi: 11,
    }));
    expect(mockRecompute).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      11
    );
  });

  it('creates surgery and bridge groups inside the resolved owner scope', async () => {
    const surgeryResponse = await POST_SURGERY(new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tooth_fdis: [11, 12], comment: 'Intervenție test' }),
    }), { params: Promise.resolve({ id: String(clientId) }) });
    const bridgeResponse = await POST_BRIDGE(new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tooth_fdis: [21, 22], comment: 'Punte test' }),
    }), { params: Promise.resolve({ id: String(clientId) }) });

    expect(surgeryResponse.status).toBe(201);
    expect(bridgeResponse.status).toBe(201);
    expect(mockCreateSurgery).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      { doctorUserId: 13, doctorName: 'Dr. Test' },
      expect.objectContaining({ tooth_fdis: [11, 12] })
    );
    expect(mockCreateBridge).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      { doctorUserId: 13, doctorName: 'Dr. Test' },
      expect.objectContaining({ tooth_fdis: [21, 22] })
    );
  });

  it('updates tooth status only inside the resolved owner scope', async () => {
    const response = await PATCH_TOOTH(new NextRequest('http://localhost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'implant' }),
    }), { params: Promise.resolve({ id: String(clientId), fdi: '11' }) });

    expect(response.status).toBe(200);
    expect(mockRecompute).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      11,
      'implant'
    );
    expect(mockGetDentalData).toHaveBeenCalledWith(clientId, ownerTenantId, 42);
  });

  it('repeats the complete owner scope in dental event PATCH and DELETE writes', async () => {
    const patchResponse = await PATCH_EVENT(new NextRequest('http://localhost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'Actualizat' }),
    }), { params: Promise.resolve({ id: String(clientId), eid: '91' }) });
    const deleteResponse = await DELETE_EVENT(new NextRequest('http://localhost', { method: 'DELETE' }), {
      params: Promise.resolve({ id: String(clientId), eid: '91' }),
    });

    expect(patchResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    for (const [filter] of updateOne.mock.calls) {
      expect(filter).toMatchObject({
        id: 91,
        tenant_id: ownerTenantId,
        user_id: 42,
        client_id: clientId,
        deleted_at: { $exists: false },
      });
    }
  });
});
