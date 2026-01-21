// Re-export storage functions for compatibility
export { getDb, loadData, saveData } from './storage-simple';

// Initialize database (now just ensures data is loaded)
export async function initDb() {
  const { loadData } = await import('./storage-simple');
  loadData();
  console.log('JSON storage initialized successfully');
}

