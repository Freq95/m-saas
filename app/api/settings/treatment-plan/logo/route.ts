import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { setTreatmentPlanLogo } from '@/lib/server/treatment-plans';

function safeLogoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Verify real image bytes rather than trusting the client-declared MIME type. */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
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
    if (file.size > 2 * 1024 * 1024) {
      return createErrorResponse('Logo-ul nu poate depasi 2MB.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Trust the actual bytes, not the client-declared file.type.
    const sniffedMime = sniffImageMime(buffer);
    if (!sniffedMime) {
      return createErrorResponse('Logo-ul trebuie sa fie o imagine (PNG, JPEG, GIF sau WEBP).', 400);
    }
    const key = `tenants/${auth.tenantId}/treatment-plan-logo/${Date.now()}_${safeLogoName(file.name)}`;
    await getStorageProvider().upload(key, buffer, sniffedMime);
    const settings = await setTreatmentPlanLogo(auth, key);
    return createSuccessResponse({ settings });
  } catch (error) {
    return handleApiError(error, 'Failed to upload treatment plan logo');
  }
}
