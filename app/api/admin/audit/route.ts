import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    await getSuperAdmin();
    const db = await getMongoDbOrThrow();

    const action = request.nextUrl.searchParams.get('action')?.trim();
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (action) {
      filter.action = action;
    }

    const [items, total] = await Promise.all([
      db.collection('audit_logs').find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('audit_logs').countDocuments(filter),
    ]);

    return createSuccessResponse({
      logs: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch audit logs');
  }
}
