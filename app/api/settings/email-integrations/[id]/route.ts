import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { deleteEmailIntegration } from '@/lib/email-integrations';
import { integrationIdParamSchema } from '@/lib/validation';
import { getAuthUser, requireRole } from '@/lib/auth-helpers';

// DELETE /api/settings/email-integrations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, tenantId, role } = await getAuthUser();
    requireRole(role, 'owner');
    // Validate route parameter
    const paramValidation = integrationIdParamSchema.safeParse({ id: params.id });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid integration ID', 400, JSON.stringify(paramValidation.error.errors));
    }
    
    const integrationId = paramValidation.data.id;
    const deleted = await deleteEmailIntegration(integrationId, userId, tenantId);
    
    if (!deleted) {
      return createErrorResponse('Integration not found', 404);
    }
    
    return createSuccessResponse({ message: 'Integration deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete integration');
  }
}

