import { NextResponse } from 'next/server';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getPublicTreatmentPlanPdfUrl } from '@/lib/server/treatment-plans';

export const runtime = 'nodejs';

export async function GET(_request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const signedUrl = await getPublicTreatmentPlanPdfUrl(params.token);
    if (!signedUrl) {
      return createErrorResponse('Link invalid sau expirat.', 404);
    }
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    return handleApiError(error, 'Failed to open treatment plan link');
  }
}
