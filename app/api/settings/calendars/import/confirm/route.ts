import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import {
  confirmImportPreview,
  parseImportOptions,
  parseRowOverrides,
  parseSelectedRowIds,
} from '@/lib/calendar-import';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!isClinicalRole(auth.role) || auth.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Importul calendarului este disponibil doar pentru owner și medici.' },
        { status: 403 }
      );
    }
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const previewId = typeof body?.previewId === 'string' ? body.previewId : '';
    const options = parseImportOptions(body?.options || {});
    const selectedRowIds = parseSelectedRowIds(body?.selectedRowIds);
    const overrides = parseRowOverrides(body?.overrides);
    const result = await confirmImportPreview(auth, previewId, options, selectedRowIds, overrides);
    return createSuccessResponse(result, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to confirm calendar import');
  }
}

