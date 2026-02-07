/**
 * Quarantined SQL adapter entrypoint.
 * All data access must use native Mongo utilities from `lib/db/mongo-utils.ts`.
 */
export function getDb(): never {
  throw new Error(
    'SQL adapter path is quarantined. Use `getMongoDbOrThrow` from `@/lib/db/mongo-utils` instead.'
  );
}
