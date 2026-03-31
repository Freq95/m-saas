import { NextRequest } from 'next/server';
import { handleApiError, createErrorResponse, createSuccessResponse } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';

const DEFAULT_PRIVACY_NOTICE =
  'Datele dumneavoastra personale sunt prelucrate in conformitate cu Regulamentul (UE) 2016/679 (GDPR). ' +
  'Aveti dreptul la acces, rectificare, stergere si portabilitatea datelor. ' +
  'Pentru exercitarea drepturilor dumneavoastra, va rugam sa contactati cabinetul.';

// GET /api/settings/gdpr — fetch tenant GDPR settings (any authenticated tenant user)
export async function GET(_request: NextRequest) {
  try {
    const { tenantId } = await getAuthUser();

    const db = await getMongoDbOrThrow();
    const tenant = await db.collection('tenants').findOne(
      { _id: tenantId },
      { projection: { gdpr_privacy_notice_text: 1 } }
    );

    return createSuccessResponse({
      gdpr_privacy_notice_text: tenant?.gdpr_privacy_notice_text ?? DEFAULT_PRIVACY_NOTICE,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch GDPR settings');
  }
}

// PATCH /api/settings/gdpr — update gdpr_privacy_notice_text (owner only)
export async function PATCH(request: NextRequest) {
  try {
    const { tenantId, role } = await getAuthUser();
    if (role !== 'owner') return createErrorResponse('Acces interzis', 403);

    const body = await request.json();
    const text = typeof body?.gdpr_privacy_notice_text === 'string'
      ? body.gdpr_privacy_notice_text.trim()
      : null;

    if (text === null || text.length === 0) {
      return createErrorResponse('Textul notificarii GDPR este obligatoriu', 400);
    }
    if (text.length > 2000) {
      return createErrorResponse('Textul notificarii GDPR nu poate depasi 2000 de caractere', 400);
    }

    const db = await getMongoDbOrThrow();
    await db.collection('tenants').updateOne(
      { _id: tenantId },
      { $set: { gdpr_privacy_notice_text: text, updated_at: new Date().toISOString() } }
    );

    return createSuccessResponse({ gdpr_privacy_notice_text: text });
  } catch (error) {
    return handleApiError(error, 'Failed to update GDPR settings');
  }
}
