import 'dotenv/config';
import { getMongoDbOrThrow } from '../lib/db/mongo-utils';

export async function findMultiOwnerTenants(db: any) {
  return db.collection('team_members').aggregate([
    { $match: { role: 'owner', status: 'active' } },
    { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
}

export async function migrateRoles(db?: any) {
  const database = db ?? await getMongoDbOrThrow();
  const multiOwners = await findMultiOwnerTenants(database);

  if (multiOwners.length > 0) {
    throw new Error(
      `[migrate-roles] ABORTING: tenants with 2+ active owners must be resolved first: ${JSON.stringify(
        multiOwners.map((tenant: any) => ({ tenantId: String(tenant._id), ownerCount: tenant.count }))
      )}`
    );
  }

  const [usersResult, membersResult, invitesResult] = await Promise.all([
    database.collection('users').updateMany({ role: 'staff' }, { $set: { role: 'dentist' } }),
    database.collection('team_members').updateMany({ role: 'staff' }, { $set: { role: 'dentist' } }),
    database.collection('invite_tokens').updateMany({ role: 'staff' }, { $set: { role: 'dentist' } }),
  ]);

  await database.collection('team_members').createIndex(
    { tenant_id: 1 },
    {
      unique: true,
      partialFilterExpression: { role: 'owner', status: 'active' },
      name: 'unique_active_owner_per_tenant',
    }
  );

  const ownerless = await database.collection('tenants').aggregate([
    { $lookup: { from: 'team_members', localField: '_id', foreignField: 'tenant_id', as: 'tm' } },
    {
      $addFields: {
        activeOwners: {
          $filter: {
            input: '$tm',
            cond: {
              $and: [
                { $eq: ['$$this.role', 'owner'] },
                { $eq: ['$$this.status', 'active'] },
              ],
            },
          },
        },
      },
    },
    { $match: { 'activeOwners.0': { $exists: false } } },
    { $project: { _id: 1, name: 1 } },
  ]).toArray();

  return {
    usersModified: usersResult.modifiedCount,
    teamMembersModified: membersResult.modifiedCount,
    inviteTokensModified: invitesResult.modifiedCount,
    ownerless,
  };
}

if (require.main === module) {
  migrateRoles()
  .then((result) => {
    console.log('[migrate-roles] complete', {
      usersModified: result.usersModified,
      teamMembersModified: result.teamMembersModified,
      inviteTokensModified: result.inviteTokensModified,
    });
    if (result.ownerless.length > 0) {
      console.warn('[migrate-roles] tenants without active owner:', result.ownerless);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('[migrate-roles] failed:', error);
    process.exit(1);
  });
}
