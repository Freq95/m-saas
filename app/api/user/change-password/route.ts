import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { checkWriteRateLimit } from '@/lib/rate-limit';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Parola curenta este obligatorie.'),
    newPassword: z.string().min(8, 'Noua parola trebuie sa aiba cel putin 8 caractere.').max(128),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(parsed.error.errors[0]?.message || 'Date invalide.', 400);
    }
    const { currentPassword, newPassword } = parsed.data;

    const db = await getMongoDbOrThrow();
    const dbUser = await db.collection('users').findOne({ _id: auth.dbUserId });
    if (!dbUser) {
      return createErrorResponse('Contul nu a fost gasit.', 404);
    }
    if (!dbUser.password_hash) {
      return createErrorResponse('Contul nu are o parola setata. Foloseste resetarea parolei.', 400);
    }

    const isMatch = await bcrypt.compare(currentPassword, String(dbUser.password_hash));
    if (!isMatch) {
      return createErrorResponse('Parola curenta este incorecta.', 401);
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.collection('users').updateOne(
      { _id: auth.dbUserId },
      {
        $set: { password_hash: newHash, updated_at: new Date().toISOString() },
        $inc: { session_version: 1 },
      }
    );

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Nu am putut schimba parola.');
  }
}
