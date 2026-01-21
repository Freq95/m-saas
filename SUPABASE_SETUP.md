# Supabase Setup Guide - Step by Step

Follow these steps to set up your Supabase project:

## Step 1: Create Supabase Account & Project

1. Go to https://supabase.com
2. Click **"Start your project"** or **"Sign in"**
3. Sign in with GitHub (recommended) or email
4. Click **"New Project"**
5. Fill in:
   - **Name**: `m-saas` (or your preferred name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you (e.g., `West US (N. California)`)
   - **Pricing Plan**: Free tier is fine for development
6. Click **"Create new project"**
7. Wait 2-3 minutes for project to initialize

## Step 2: Get Your Credentials

Once your project is ready:

1. Go to **Settings** (gear icon) → **API**
2. You'll see:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGc...` (long string)
   - **service_role key**: `eyJhbGc...` (long string) - Click "Reveal" to see it

**⚠️ Important**: 
- The `service_role` key has admin access - NEVER expose it to the client
- The `anon` key is safe for client-side use

## Step 3: Run Database Schema

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the file `supabase/schema.sql` from this project
4. Copy ALL the contents
5. Paste into the SQL Editor
6. Click **"Run"** (or press Ctrl+Enter)
7. You should see: "Success. No rows returned"

## Step 4: Configure Environment Variables

1. Open your `.env` file in the project root
2. Add these lines (replace with YOUR values):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

3. Save the file
4. **Restart your dev server** if it's running

## Step 5: Test Connection

Run this command to test:

```bash
node scripts/test-supabase-connection.js
```

Or test manually by starting your app:
```bash
npm run dev
```

Check the console - you should see: `✅ Supabase database initialized`

## Step 6: Migrate Your Data

Once connection is working:

1. **Backup your data first**:
   ```bash
   cp data/data.json data/data.json.backup
   ```

2. **Run migration**:
   ```bash
   node scripts/migrate-to-supabase.js
   ```

3. Verify in Supabase dashboard → **Table Editor** - you should see all your data

## Troubleshooting

### "Invalid API key"
- Double-check you copied the full key (they're very long)
- Make sure there are no extra spaces

### "relation does not exist"
- Make sure you ran the schema.sql file completely
- Check SQL Editor for any errors

### Migration fails
- Check that all tables were created in Supabase
- Verify foreign key relationships are correct
- Check the error message for specific table issues

### Still using JSON storage
- Make sure `.env` file is in the project root
- Restart your dev server after adding env vars
- Check console for "Supabase database initialized" message

## Next Steps After Setup

1. ✅ Set up Row Level Security (RLS) policies (optional, for production)
2. ✅ Configure automatic backups in Supabase dashboard
3. ✅ Test all your app features
4. ✅ Monitor usage in Supabase dashboard

## Need Help?

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Check `SUPABASE_MIGRATION.md` for more details

