import { ObjectId, type Db } from 'mongodb';
import {
  CATEGORY_COLOR_PALETTE,
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  type CategoryKey,
} from '@/lib/calendar-color-policy';
import { appointmentCategoriesCacheKey } from '@/lib/cache-keys';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { getCached } from '@/lib/redis';

export interface AppointmentCategory {
  id: number;
  tenant_id: ObjectId;
  user_id: number;
  key: string;
  label: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ManagedCategoryDentist {
  userId: number;
  name: string;
}

const DEFAULT_CATEGORY_COLORS: Record<CategoryKey, string> = {
  consultatie: CATEGORY_COLOR_PALETTE[0].hex,
  tratament: CATEGORY_COLOR_PALETTE[1].hex,
  control: CATEGORY_COLOR_PALETTE[2].hex,
  urgenta: CATEGORY_COLOR_PALETTE[3].hex,
  altele: CATEGORY_COLOR_PALETTE[6].hex,
};

export function isCategoryPaletteColor(value: string): boolean {
  return CATEGORY_COLOR_PALETTE.some((color) => color.hex === value);
}

export function slugifyCategoryLabel(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || 'categorie';
}

export async function ensureDefaultAppointmentCategories(
  db: Db,
  tenantId: ObjectId,
  userId: number
): Promise<void> {
  const count = await db.collection('appointment_categories').countDocuments({
    tenant_id: tenantId,
    user_id: userId,
  });
  if (count > 0) return;

  const now = new Date().toISOString();
  for (let index = 0; index < CATEGORY_KEYS.length; index += 1) {
    const key = CATEGORY_KEYS[index];
    const id = await getNextNumericId('appointment_categories');
    await db.collection<FlexDoc>('appointment_categories').updateOne(
      {
        tenant_id: tenantId,
        user_id: userId,
        key,
      },
      {
        $setOnInsert: {
          _id: id,
          id,
          tenant_id: tenantId,
          user_id: userId,
          key,
          label: CATEGORY_CONFIG[key].label,
          color: DEFAULT_CATEGORY_COLORS[key],
          position: index,
          created_at: now,
          updated_at: now,
        },
      },
      { upsert: true }
    );
  }
}

export async function getAppointmentCategoriesForDentist(
  userId: number,
  tenantId: ObjectId
): Promise<AppointmentCategory[]> {
  const cacheKey = appointmentCategoriesCacheKey({ tenantId, userId });
  return getCached(cacheKey, 1800, async () => {
    const db = await getMongoDbOrThrow();
    await ensureDefaultAppointmentCategories(db, tenantId, userId);
    const categories = await db.collection('appointment_categories')
      .find({ tenant_id: tenantId, user_id: userId })
      .sort({ position: 1, created_at: 1, id: 1 })
      .toArray();
    return categories.map(stripMongoId) as AppointmentCategory[];
  });
}

export async function getUniqueCategoryKey(
  db: Db,
  tenantId: ObjectId,
  userId: number,
  label: string,
  excludeId?: number
): Promise<string> {
  const base = slugifyCategoryLabel(label);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await db.collection('appointment_categories').findOne({
      tenant_id: tenantId,
      user_id: userId,
      key: candidate,
      ...(typeof excludeId === 'number' ? { id: { $ne: excludeId } } : {}),
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function resolveAppointmentCategoryForWrite(args: {
  db: Db;
  tenantId: ObjectId;
  userId: number;
  categoryId?: number | null;
}): Promise<AppointmentCategory | null> {
  const { db, tenantId, userId, categoryId } = args;
  if (typeof categoryId !== 'number') return null;

  const category = await db.collection('appointment_categories').findOne({
    id: categoryId,
    tenant_id: tenantId,
    user_id: userId,
  });

  return category ? (stripMongoId(category) as AppointmentCategory) : null;
}

export async function getManagedCategoryDentists(args: {
  tenantId: ObjectId;
  role: string;
  userId: number;
  assignedDentistUserIds?: number[];
}): Promise<ManagedCategoryDentist[]> {
  const { tenantId, role, userId, assignedDentistUserIds } = args;
  const db = await getMongoDbOrThrow();
  const targetIds = role === 'asistent'
    ? assignedDentistUserIds ?? []
    : role === 'receptionist'
      ? []
      : [userId];

  if (targetIds.length === 0) return [];

  const dentists = await db.collection('users').find({
    tenant_id: tenantId,
    id: { $in: targetIds },
    role: { $in: ['owner', 'dentist'] },
    status: { $ne: 'deleted' },
  }).project({ id: 1, name: 1, email: 1 }).sort({ name: 1 }).toArray();

  return dentists
    .filter((dentist: any) => typeof dentist.id === 'number')
    .map((dentist: any) => ({
      userId: dentist.id,
      name: dentist.name || dentist.email || `Medic ${dentist.id}`,
    }));
}
