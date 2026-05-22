import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { canCrudCategoriesFor } from '@/lib/categories-permissions';
import { getUniqueCategoryKey } from '@/lib/server/appointment-categories';
import { updateAppointmentCategorySchema } from '@/lib/validation';

function parseCategoryId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const categoryId = parseCategoryId(params.id);
    if (!categoryId) {
      return createErrorResponse('Invalid category ID', 400);
    }

    const body = await request.json();
    const validationResult = updateAppointmentCategorySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const db = await getMongoDbOrThrow();
    const category = await db.collection('appointment_categories').findOne({ id: categoryId });
    if (!category || String(category.tenant_id) !== String(auth.tenantId)) {
      return createErrorResponse('Category not found', 404);
    }
    if (!canCrudCategoriesFor(auth, category.user_id)) {
      return createErrorResponse('Not authorized to update this category', 403);
    }

    const { label, color, position } = validationResult.data;
    const updates: Record<string, unknown> = {};
    if (label !== undefined) {
      updates.label = label;
      updates.key = await getUniqueCategoryKey(db, category.tenant_id, category.user_id, label, categoryId);
    }
    if (color !== undefined) updates.color = color;
    if (position !== undefined) updates.position = position;

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();
    const updated = await db.collection('appointment_categories').findOneAndUpdate(
      { id: categoryId, tenant_id: category.tenant_id },
      { $set: updates },
      { returnDocument: 'after' }
    );
    if (!updated) {
      return createErrorResponse('Category not found', 404);
    }

    await invalidateReadCaches({
      tenantId: auth.tenantId,
      userId: auth.userId,
      additionalScopes: category.user_id !== auth.userId
        ? [{ tenantId: category.tenant_id, userId: category.user_id }]
        : undefined,
    });

    return createSuccessResponse({ category: stripMongoId(updated) });
  } catch (error) {
    return handleApiError(error, 'Failed to update appointment category');
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const categoryId = parseCategoryId(params.id);
    if (!categoryId) {
      return createErrorResponse('Invalid category ID', 400);
    }

    const db = await getMongoDbOrThrow();
    const category = await db.collection('appointment_categories').findOne({ id: categoryId });
    if (!category || String(category.tenant_id) !== String(auth.tenantId)) {
      return createErrorResponse('Category not found', 404);
    }
    if (!canCrudCategoriesFor(auth, category.user_id)) {
      return createErrorResponse('Not authorized to delete this category', 403);
    }

    await db.collection('appointment_categories').deleteOne({
      id: categoryId,
      tenant_id: category.tenant_id,
    });

    await invalidateReadCaches({
      tenantId: auth.tenantId,
      userId: auth.userId,
      additionalScopes: category.user_id !== auth.userId
        ? [{ tenantId: category.tenant_id, userId: category.user_id }]
        : undefined,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment category');
  }
}
