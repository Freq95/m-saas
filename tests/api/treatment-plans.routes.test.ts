import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAuthUser,
  mockResolveClientScope,
  mockCreatePlan,
  mockGetPlan,
  mockUpdatePlan,
  mockDeletePlan,
  mockListPlans,
  mockListDentists,
  mockGetSettings,
  mockRateLimit,
  mockInvalidate,
  mockGetDb,
} = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockResolveClientScope: vi.fn(),
  mockCreatePlan: vi.fn(),
  mockGetPlan: vi.fn(),
  mockUpdatePlan: vi.fn(),
  mockDeletePlan: vi.fn(),
  mockListPlans: vi.fn(),
  mockListDentists: vi.fn(),
  mockGetSettings: vi.fn(),
  mockRateLimit: vi.fn(),
  mockInvalidate: vi.fn(),
  mockGetDb: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getAuthUser: mockGetAuthUser,
  isClinicalRole: (role: string) => role === 'owner' || role === 'dentist',
}));
vi.mock('@/lib/client-permissions', () => ({ resolveClientScopeForClient: mockResolveClientScope }));
vi.mock('@/lib/rate-limit', () => ({
  checkWriteRateLimit: mockRateLimit,
  checkUpdateRateLimit: mockRateLimit,
}));
vi.mock('@/lib/cache-keys', () => ({ invalidateReadCaches: mockInvalidate }));
vi.mock('@/lib/db/mongo-utils', () => ({ getMongoDbOrThrow: mockGetDb }));
vi.mock('@/lib/error-handler', () => ({
  createErrorResponse: (message: string, status: number, details?: unknown) =>
    Response.json({ error: message, details }, { status }),
  createSuccessResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: () => Response.json({ error: 'Internal error' }, { status: 500 }),
}));
vi.mock('@/lib/server/treatment-plans', () => ({
  createTreatmentPlan: mockCreatePlan,
  getTreatmentPlan: mockGetPlan,
  updateTreatmentPlan: mockUpdatePlan,
  softDeleteTreatmentPlan: mockDeletePlan,
  listTreatmentPlans: mockListPlans,
  listTreatmentPlanDentists: mockListDentists,
  getTreatmentPlanSettings: mockGetSettings,
}));

import { GET as GET_LIST, POST } from '@/app/api/clients/[id]/treatment-plans/route';
import { DELETE, GET, PATCH } from '@/app/api/clients/[id]/treatment-plans/[planId]/route';

describe('treatment-plan API route authorization and scope', () => {
  const viewerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0801');
  const ownerTenantId = new ObjectId('65f9a0e8f5f89f73d18b0802');
  const auth = {
    userId: 13,
    dbUserId: new ObjectId('65f9a0e8f5f89f73d18b0803'),
    tenantId: viewerTenantId,
    role: 'dentist',
    name: 'Dr. Test',
  };
  const scope = { userId: 42, tenantId: ownerTenantId };
  const clientId = 301;
  const planId = 77;
  const params = { params: Promise.resolve({ id: String(clientId), planId: String(planId) }) };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(auth);
    mockResolveClientScope.mockResolvedValue(scope);
    mockRateLimit.mockResolvedValue(null);
    mockInvalidate.mockResolvedValue(undefined);
    mockCreatePlan.mockResolvedValue({ id: planId, status: 'draft' });
    mockGetPlan.mockResolvedValue({ id: planId, status: 'draft' });
    mockUpdatePlan.mockResolvedValue({ id: planId, status: 'draft', total: 250 });
    mockDeletePlan.mockResolvedValue(true);
    mockListPlans.mockResolvedValue([{ id: planId }]);
    mockListDentists.mockResolvedValue([]);
    mockGetSettings.mockResolvedValue({ currency: 'lei' });
    mockGetDb.mockResolvedValue({
      collection: () => ({ findOne: vi.fn(async () => ({ id: clientId, name: 'Pacient Test' })) }),
    });
  });

  it('creates inside the resolved patient owner scope, not the viewer scope', async () => {
    const request = new NextRequest(`http://localhost/api/clients/${clientId}/treatment-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [{ procedure: 'Consultație', quantity: 1, unit_price: 250 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: String(clientId) }) });

    expect(response.status).toBe(201);
    expect(mockCreatePlan).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      auth,
      expect.objectContaining({ items: expect.any(Array) })
    );
  });

  it('returns 404 without touching plans when the patient scope cannot be resolved', async () => {
    mockResolveClientScope.mockResolvedValue(null);

    const response = await GET_LIST(
      new NextRequest(`http://localhost/api/clients/${clientId}/treatment-plans`),
      { params: Promise.resolve({ id: String(clientId) }) }
    );

    expect(response.status).toBe(404);
    expect(mockListPlans).not.toHaveBeenCalled();
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  it('reads a plan using the resolved tenant, user, and patient scope', async () => {
    const response = await GET(new NextRequest('http://localhost'), params);

    expect(response.status).toBe(200);
    expect(mockGetPlan).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      planId
    );
  });

  it('blocks non-clinical users before an update is attempted', async () => {
    mockGetAuthUser.mockResolvedValue({ ...auth, role: 'receptionist' });
    const request = new NextRequest('http://localhost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'sent' }),
    });

    const response = await PATCH(request, params);

    expect(response.status).toBe(403);
    expect(mockResolveClientScope).not.toHaveBeenCalled();
    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it('updates and deletes only through the resolved patient scope', async () => {
    const patchResponse = await PATCH(new NextRequest('http://localhost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ total_override: 250 }),
    }), params);
    const deleteResponse = await DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), params);

    expect(patchResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(mockUpdatePlan).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      auth,
      planId,
      expect.objectContaining({ total_override: 250 })
    );
    expect(mockDeletePlan).toHaveBeenCalledWith(
      { tenantId: ownerTenantId, userId: 42, clientId },
      planId
    );
  });
});
