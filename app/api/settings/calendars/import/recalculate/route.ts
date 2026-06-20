import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import {
  parseImportOptions,
  parseRowOverrides,
  parseSelectedRowIds,
  recalculateImportPreview,
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
    const body = await request.json();
    const previewId = typeof body?.previewId === 'string' ? body.previewId : '';
    const options = parseImportOptions(body?.options || {});
    const selectedRowIds = parseSelectedRowIds(body?.selectedRowIds);
    const overrides = parseRowOverrides(body?.overrides);
    const result = await recalculateImportPreview(auth, previewId, options, selectedRowIds, overrides);
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error, 'Failed to recalculate calendar import');
  }
}

