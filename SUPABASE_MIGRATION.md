# Supabase Migration Guide

This guide will help you migrate from JSON file storage to Supabase PostgreSQL database.

## Prerequisites

1. **Create a Supabase project**
   - Go to https://supabase.com
   - Create a new project
   - Note your project URL and API keys

2. **Install dependencies** (already done)
   ```bash
   npm install @supabase/supabase-js
   ```

## Setup Steps

### 1. Set up Supabase Database Schema

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `supabase/schema.sql`
4. Run the SQL script to create all tables

### 2. Configure Environment Variables

Add these to your `.env` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Important**: 
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for client-side
- `SUPABASE_SERVICE_ROLE_KEY` should NEVER be exposed to the client - it has admin access

### 3. Backup Your Current Data

```bash
# Backup your JSON database
cp data/data.json data/data.json.backup
```

### 4. Migrate Data to Supabase

```bash
# Run the migration script
node scripts/migrate-to-supabase.js
```

This will:
- Load all data from `data/data.json`
- Insert it into Supabase tables
- Handle duplicates gracefully

### 5. Verify Migration

1. Check Supabase dashboard → Table Editor
2. Verify all tables have data
3. Test the application

### 6. Test the Application

```bash
npm run dev
```

The application will automatically use Supabase if configured, or fall back to JSON storage if not.

## How It Works

The new database layer (`lib/db.ts`) automatically:
- Uses Supabase if credentials are configured
- Falls back to JSON storage if Supabase is not configured
- Provides the same SQL-like interface for compatibility

## Troubleshooting

### Migration Errors

- **Foreign key violations**: Make sure tables are migrated in order (the script handles this)
- **Duplicate key errors**: The script will try to upsert instead
- **Connection errors**: Verify your Supabase credentials

### Application Errors

- **"Supabase is not configured"**: Check your `.env` file
- **Query errors**: Some complex SQL queries may need adjustment for Supabase syntax

## Rollback

If you need to rollback:
1. Remove Supabase environment variables from `.env`
2. The app will automatically use JSON storage again
3. Your `data/data.json` file is still intact

## Next Steps

After successful migration:
1. ✅ Remove JSON storage code (optional, after thorough testing)
2. ✅ Set up Supabase Row Level Security (RLS) policies
3. ✅ Configure backups in Supabase
4. ✅ Monitor performance in Supabase dashboard

