import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { createImportPreview, parseImportOptions } from '@/lib/calendar-import';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    // Role gate runs before option parsing so non-clinical roles get a
    // clean 403 instead of a misleading 400 about malformed input.
    if (!isClinicalRole(auth.role) || auth.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Importul calendarului este disponibil doar pentru owner și medici.' },
        { status: 403 }
      );
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const form = await request.formData();
    const file = form.get('file');
    const rawOptions = form.get('options');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fișierul .ics lipsește.' }, { status: 400 });
    }

    const options = parseImportOptions(
      typeof rawOptions === 'string' && rawOptions ? JSON.parse(rawOptions) : {}
    );
    const result = await createImportPreview(auth, file, options);
    return createSuccessResponse(result, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to preview calendar import');
  }
}

