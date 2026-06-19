import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { checkPublicLinkRateLimit } from '@/lib/rate-limit';
import { getPublicTreatmentPlanPdfUrl } from '@/lib/server/treatment-plans';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limited = await checkPublicLinkRateLimit(ip);
    if (limited) return limited;

    const signedUrl = await getPublicTreatmentPlanPdfUrl(params.token);
    if (!signedUrl) {
      return createErrorResponse('Link invalid sau expirat.', 404);
    }
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    return handleApiError(error, 'Failed to open treatment plan link');
  }
}
