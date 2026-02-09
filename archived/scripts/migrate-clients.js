console.error(
  [
    'scripts/migrate-clients.js is quarantined.',
    'Reason: the SQL adapter/getDb() path was removed in Phase 3.',
    'Do not run this legacy script against the current Mongo-native stack.',
    'If needed, replace it with a new Mongo-native script before using it again.',
  ].join('\n')
);
process.exit(1);

