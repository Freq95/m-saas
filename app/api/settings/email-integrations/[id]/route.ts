import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { deleteEmailIntegration } from '@/lib/email-integrations';
import { DEFAULT_USER_ID } from '@/lib/constants';
import { integrationIdParamSchema } from '@/lib/validation';

// DELETE /api/settings/email-integrations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate route parameter
    const paramValidation = integrationIdParamSchema.safeParse({ id: params.id });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid integration ID', 400, JSON.stringify(paramValidation.error.errors));
    }
    
    const integrationId = paramValidation.data.id;
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || String(DEFAULT_USER_ID));
    
    const deleted = await deleteEmailIntegration(integrationId, userId);
    
    if (!deleted) {
      return createErrorResponse('Integration not found', 404);
    }
    
    return createSuccessResponse({ message: 'Integration deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete integration');
  }
}

