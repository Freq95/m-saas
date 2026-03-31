import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';

export async function GET() {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const db = await getMongoDbOrThrow();

    const [totalTenants, totalUsers, byPlan, recentTenants] = await Promise.all([
      db.collection('tenants').countDocuments({}),
      db.collection('users').countDocuments({}),
      db
        .collection('tenants')
        .aggregate([
          { $group: { _id: '$plan', count: { $sum: 1 } } },
          { $project: { _id: 0, plan: '$_id', count: 1 } },
        ])
        .toArray(),
      db.collection('tenants').find({}).sort({ created_at: -1 }).limit(10).toArray(),
    ]);

    await logDataAccess({
      actorUserId,
      actorEmail,
      actorRole: 'super_admin',
      targetType: 'admin.stats',
      route: '/api/admin/stats',
      metadata: {
        totalTenants,
        totalUsers,
      },
    });

    return createSuccessResponse({
      totalTenants,
      totalUsers,
      plans: byPlan,
      recentTenants,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load admin stats');
  }
}
