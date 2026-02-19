import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import type { Client as ClientType } from '@/lib/types';

type ClientsQuery = {
  userId?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
};

type PaginationInfo = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ClientsResult = {
  clients: ClientType[];
  pagination: PaginationInfo;
};

export async function getClientsData(query: ClientsQuery = {}): Promise<ClientsResult> {
  const db = await getMongoDbOrThrow();
  if (!query.userId) {
    throw new Error('userId is required');
  }
  const userId = query.userId;
  const search = query.search ?? '';
  const sortBy = query.sortBy ?? 'last_activity_date';
  const sortOrder = query.sortOrder ?? 'DESC';
  const page = query.page ?? 1;
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    user_id: userId,
    // Always exclude soft-deleted clients
    deleted_at: { $exists: false },
  };

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { name: regex },
      { email: regex },
      { phone: regex },
    ];
  }

  const validSortColumns = new Set([
    'name',
    'email',
    'total_spent',
    'total_appointments',
    'last_appointment_date',
    'last_conversation_date',
    'last_activity_date',
    'created_at',
  ]);
  const sortColumn = validSortColumns.has(sortBy) ? sortBy : 'last_activity_date';
  const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;
  const sort = { [sortColumn]: sortDirection } as Record<string, 1 | -1>;

  const total = await db.collection('clients').countDocuments(filter);

  const clients = (await db
    .collection('clients')
    .find(filter)
    .sort(sort)
    .skip(offset)
    .limit(limit)
    .toArray())
    .map(stripMongoId) as ClientType[];

  return {
    clients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
