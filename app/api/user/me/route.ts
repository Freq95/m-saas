import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { emailSchema } from '@/lib/validation';

const updateMeSchema = z
  .object({
    name: z.string().min(1, 'Numele nu poate fi gol.').max(100).trim().optional(),
    email: emailSchema.optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.email !== undefined, {
    message: 'Cel putin un camp este necesar.',
  });

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const parsed = updateMeSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(parsed.error.errors[0]?.message || 'Date invalide.', 400);
    }
    const { name, email } = parsed.data;

    const db = await getMongoDbOrThrow();

    if (email && email !== auth.email) {
      const existing = await db.collection('users').findOne({
        email,
        tenant_id: auth.tenantId,
        _id: { $ne: auth.dbUserId },
      });
      if (existing) {
        return createErrorResponse('Acest email este deja folosit de un alt cont.', 409);
      }
    }

    const $set: Record<string, string> = { updated_at: new Date().toISOString() };
    if (name) $set.name = name;
    if (email) $set.email = email;

    await db.collection('users').updateOne({ _id: auth.dbUserId }, { $set });

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Nu am putut actualiza profilul.');
  }
}
