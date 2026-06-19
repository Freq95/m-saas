import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { setTreatmentPlanLogo } from '@/lib/server/treatment-plans';

function safeLogoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (auth.role !== 'owner') {
      return createErrorResponse('Doar proprietarul clinicii poate incarca logo-ul.', 403);
    }
    if (!isStorageConfigured()) {
      return createErrorResponse('Cloud storage is not configured.', 503);
    }
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return createErrorResponse('No file provided', 400);
    if (!file.type.startsWith('image/')) {
      return createErrorResponse('Logo-ul trebuie sa fie o imagine.', 400);
    }
    if (file.size > 2 * 1024 * 1024) {
      return createErrorResponse('Logo-ul nu poate depasi 2MB.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `tenants/${auth.tenantId}/treatment-plan-logo/${Date.now()}_${safeLogoName(file.name)}`;
    await getStorageProvider().upload(key, buffer, file.type || 'application/octet-stream');
    const settings = await setTreatmentPlanLogo(auth, key);
    return createSuccessResponse({ settings });
  } catch (error) {
    return handleApiError(error, 'Failed to upload treatment plan logo');
  }
}
