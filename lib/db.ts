/**
 * Database abstraction layer
 * Uses Supabase if configured, falls back to JSON storage
 */

import { isSupabaseConfigured } from './supabase';
import { getSupabaseDb } from './db-supabase';
import { getDb as getJsonDb, loadData, saveData } from './storage-simple';

// Export for compatibility
export { loadData, saveData };

// Get database instance (Supabase or JSON fallback)
export function getDb() {
  if (isSupabaseConfigured()) {
    return getSupabaseDb();
  }
  // Fallback to JSON storage
  return getJsonDb();
}

// Initialize database
export async function initDb() {
  if (isSupabaseConfigured()) {
    console.log('✅ Supabase database initialized');
    return;
  }
  
  // Fallback to JSON storage
  const { loadData } = await import('./storage-simple');
  loadData();
  console.log('✅ JSON storage initialized (Supabase not configured)');
}

