# Supabase Quick Start Checklist

## ✅ Step 1: Create Supabase Project

1. Go to: **https://supabase.com**
2. Sign in (GitHub recommended)
3. Click **"New Project"**
4. Fill in:
   - Name: `m-saas`
   - Database Password: (save this!)
   - Region: Choose closest
5. Wait 2-3 minutes

## ✅ Step 2: Get Credentials

1. In Supabase dashboard → **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: (long string starting with `eyJ...`)
   - **service_role key**: (click "Reveal" to see it)

## ✅ Step 3: Add to .env File

Open `.env` in project root and add:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

## ✅ Step 4: Run Database Schema

1. In Supabase → **SQL Editor**
2. Click **"New query"**
3. Open `supabase/schema.sql` from this project
4. Copy ALL contents
5. Paste and click **"Run"**

## ✅ Step 5: Test Connection

```bash
npm run test:supabase
```

Should see: `✅ Supabase connection test completed!`

## ✅ Step 6: Migrate Data

```bash
# Backup first
cp data/data.json data/data.json.backup

# Migrate
npm run db:migrate:supabase
```

## ✅ Step 7: Start App

```bash
npm run dev
```

Check console for: `✅ Supabase database initialized`

---

**Need help?** See `SUPABASE_SETUP.md` for detailed instructions.

