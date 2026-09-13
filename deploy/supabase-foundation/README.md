# SERGIK Supabase foundation

**Cloud Supabase = primary.** **Home-server Docker = offline backup.**  
Nothing is deleted unless you pass explicit destructive flags (`--clear` on legacy import scripts).

## Why this exists

The old cloud project (`utgwlgcejflqxyalnlze.supabase.co`) was decommissioned. Home-server holds the latest Postgres state when Docker is running. These scripts let you:

1. Stand up a **new** Supabase project safely  
2. **Upsert** data from home-server or JSON exports (no wipe)  
3. **Switch** the Next app between cloud and home without losing either set of keys  
4. **Back up** both sides on a schedule so you never lose the DB again  

## One-time setup (new Supabase project)

### 1. Create the project

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**  
2. Choose a region close to you, set a strong DB password (save it in your password manager)  
3. **Enable billing alerts** (Settings → Billing) so a missed payment cannot silently delete data again  
4. Settings → API → copy **Project URL**, **anon**, **service_role** keys  

### 2. Store keys (both profiles kept in `web/.env.local`)

```bash
cd web
npm run db:init-cloud-profile
```

Or non-interactive:

```bash
npm run db:init-cloud-profile -- \
  --url=https://YOUR_REF.supabase.co \
  --anon=eyJ... \
  --service=eyJ...
```

### 3. Apply schema (safe on empty project)

```bash
npm run db:schema-bundle
```

Open `deploy/supabase-foundation/out/schema-bundle.sql` → Supabase **SQL Editor** → paste → **Run**.  
Creates tables/indexes; does **not** truncate existing rows.

Create Storage bucket **`audio-files`** (public) in the dashboard if the SQL policy step references it.

### 4. Bootstrap data (upsert only)

**Best source:** home-server while Docker is up (freshest data):

```bash
cd deploy/home-server && node scripts/up.mjs   # if not running
cd web && npm run db:bootstrap-cloud
```

**Fallback:** JSON exports in `web/data/supabase-export/` (partial — mainly `audio_files`).

Bootstrap **refuses** to run if cloud already has `audio_files` rows unless you pass `--allow-existing`.

### 5. Use cloud in dev

```bash
cd web && npm run env:cloud && npm run dev:restart
npm run db:verify
```

`/api/health/deps` should show `supabaseDatabase: ok`.

---

## Daily commands

| Task | Command |
| --- | --- |
| App uses **cloud** | `cd web && npm run env:cloud && npm run dev:restart` |
| App uses **home-server** (Docker must be up) | `cd web && npm run env:home-server && npm run dev:restart` |
| Verify both profiles | `cd web && npm run db:verify` |
| Sync **home → cloud** (after vault edits on home) | `npm run db:sync-pair -- --direction=home-to-cloud --apply` |
| Sync **cloud → home** (refresh backup) | `npm run db:sync-pair -- --direction=cloud-to-home --apply` |
| Sync both ways (newer `updated_at` wins) | `npm run db:sync-pair -- --direction=both --apply` |
| **Backup snapshot** (JSON + optional pg_dump) | `cd web && npm run db:backup` |
| Preview sync (no writes) | `npm run db:sync-pair` (default dry-run) |

Run **`npm run db:backup` weekly**. Snapshots live in `deploy/supabase-foundation/snapshots/` (gitignored).

---

## Env layout (`web/.env.local`)

Both profiles stay in one file:

```env
SERGIK_CLOUD_SUPABASE_URL=https://xxxx.supabase.co
SERGIK_CLOUD_SUPABASE_ANON_KEY=...
SERGIK_CLOUD_SERVICE_ROLE_KEY=...

SERGIK_HOME_SUPABASE_URL=http://127.0.0.1:8000
SERGIK_HOME_SUPABASE_ANON_KEY=...
SERGIK_HOME_SERVICE_ROLE_KEY=...

SERGIK_DB_TARGET=cloud

NEXT_PUBLIC_SUPABASE_URL=...   # mirrors active target
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Switching targets updates `NEXT_PUBLIC_*` only; **both profiles are preserved**.

---

## Anti-loss checklist

- [ ] Supabase billing alerts on  
- [ ] Weekly `npm run db:backup`  
- [ ] After big catalog edits: `db:sync-pair --direction=home-to-cloud --apply` (or reverse)  
- [ ] Optional: `deploy/migrate` R2 upload for off-site copies  
- [ ] Never run `import-local-to-supabase.mjs --clear` unless you mean to wipe  

---

## Files

| Script | Role |
| --- | --- |
| `init-cloud-profile.mjs` | Save new cloud keys + validate host |
| `build-schema-bundle.mjs` | Single SQL file for dashboard |
| `bootstrap-cloud.mjs` | First upsert from home or JSON |
| `sync-pair.mjs` | Ongoing table upsert sync |
| `backup-snapshot.mjs` | Timestamped exports |
| `verify-cloud.mjs` | Reachability + row counts |
| `lib/env-profiles.mjs` | Dual-profile env switching |
