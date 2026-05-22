import { describe, expect, it, vi } from 'vitest';
import { migrateRoles } from '@/scripts/migrate-roles';

describe('migrateRoles pre-check', () => {
  it('rejects tenants with multiple active owners before mutating data', async () => {
    const updateMany = vi.fn();
    const createIndex = vi.fn();
    const db = {
      collection(name: string) {
        if (name === 'team_members') {
          return {
            aggregate: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([
                { _id: 'tenant-a', count: 2 },
              ]),
            }),
            updateMany,
            createIndex,
          };
        }
        return { updateMany };
      },
    };

    await expect(migrateRoles(db)).rejects.toThrow('2+ active owners');
    expect(updateMany).not.toHaveBeenCalled();
    expect(createIndex).not.toHaveBeenCalled();
  });
});
