import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRateLimit, mockSignedUrl, mockLogAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(), mockDb: vi.fn(), mockRateLimit: vi.fn(), mockSignedUrl: vi.fn(), mockLogAccess: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({ getAuthUser: mockAuth, AuthError: class AuthError extends Error {} }));
vi.mock('@/lib/db/mongo-utils', () => ({ getMongoDbOrThrow: mockDb }));
vi.mock('@/lib/rate-limit', () => ({ checkGdprExportRateLimit: mockRateLimit }));
vi.mock('@/lib/storage', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => ({ getSignedUrl: mockSignedUrl })),
}));
vi.mock('@/lib/audit', () => ({ logDataAccess: mockLogAccess }));

import { GET } from '@/app/api/clients/[id]/gdpr-export/route';

describe('GDPR export completeness', () => {
  const tenantId = new ObjectId('65f9a0e8f5f89f73d18b1101');

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 42, dbUserId: new ObjectId(), tenantId, email: 'doctor@example.com', role: 'dentist' });
    mockRateLimit.mockResolvedValue(null);
    mockSignedUrl.mockImplementation(async (key: string) => `https://signed.example/${key}`);
    const rows: Record<string, any[]> = {
      appointments: [{ id: 81 }],
      conversations: [{ id: 71 }],
      client_files: [{ storage_key: 'patient.pdf', original_filename: 'patient.pdf' }],
      contact_files: [], client_notes: [], contact_notes: [],
      contact_custom_fields: [{ field: 'allergy', value: 'latex' }],
      tooth_states: [],
      tooth_events: [{ id: 91, tooth_fdi: 11, issue_type: 'caries', action: 'diagnosed', deleted_at: '2026-01-01T00:00:00.000Z' }],
      surgery_groups: [], bridge_groups: [],
      treatment_plans: [{ id: 101, items: [], deleted_at: '2026-01-02T00:00:00.000Z' }],
      data_access_logs: [{ route: '/api/clients/301', target_type: 'client', target_id: 301, created_at: '2025-01-01T00:00:00.000Z' }],
      reminders: [], messages: [{ conversation_id: 71, content: 'Mesaj' }],
      message_attachments: [{ conversation_id: 71, storage_key: 'attachment.png', original_filename: 'attachment.png' }],
    };
    mockDb.mockResolvedValue({
      collection(name: string) {
        if (name === 'clients') return { findOne: vi.fn(async () => ({
          id: 301, user_id: 42, tenant_id: tenantId, name: 'Ana', consent_document_key: 'consent.pdf',
        })) };
        return {
          find: vi.fn(() => ({ sort() { return this; }, async toArray() { return rows[name] ?? []; } })),
        };
      },
    });
  });

  it('includes retained records, custom fields, attachments, consent document, and access history', async () => {
    const response = await GET(new NextRequest('http://localhost/api/clients/301/gdpr-export'), {
      params: Promise.resolve({ id: '301' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.custom_fields).toEqual([expect.objectContaining({ field: 'allergy' })]);
    expect(body.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ filename: 'attachment.png', download_url: expect.stringContaining('attachment.png') }),
    ]));
    expect(body.client.consent_document_url).toContain('consent.pdf');
    expect(body.dental_chart.events[0].deleted_at).toBeTruthy();
    expect(body.treatment_plans[0].deleted_at).toBeTruthy();
    expect(body.data_access_history).toHaveLength(1);
  });
});
