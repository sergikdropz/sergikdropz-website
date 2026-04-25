# TOAST Migration Execution Guide

**Status**: Ready to Execute  
**Impact**: 92% database size reduction (38MB → 3MB)

---

## Prerequisites

1. ✅ Migration script exists: `web/scripts/migrate-jsonb-to-storage.mjs`
2. ✅ Supabase credentials configured in `.env.local`
3. ✅ Backup functionality included in script

---

## Step-by-Step Execution

### Step 1: Dry Run Test (Preview Only)

**Purpose**: See what will be migrated without making any changes

```bash
cd web
node scripts/migrate-jsonb-to-storage.mjs --dry-run --limit 10
```

**Expected Output**:
- Shows which records would be migrated
- Calculates space savings
- No actual changes made

**What to Check**:
- ✅ Script runs without errors
- ✅ Shows expected number of records (10)
- ✅ Calculates reasonable space savings

---

### Step 2: Test Migration (Small Batch)

**Purpose**: Migrate 10 records to verify everything works

```bash
cd web
node scripts/migrate-jsonb-to-storage.mjs --limit 10 --force
```

**What Happens**:
1. Backs up 10 records to `data/migration-backup/`
2. Uploads JSONB data to Supabase Storage bucket `audio-analysis`
3. Updates database with storage URLs
4. Removes JSONB columns from database

**Verification Steps**:

1. **Check Backup Files**:
   ```bash
   ls -lh web/data/migration-backup/
   ```
   Should see 10 JSON backup files

2. **Check Supabase Storage**:
   - Go to Supabase Dashboard → Storage → `audio-analysis` bucket
   - Should see files in folders:
     - `waveforms/{track_id}.json`
     - `sonic-dna/{track_id}.json`
     - `ai-analysis/{track_id}.json` (if exists)
     - `frequency-bands/{track_id}.json` (if exists)

3. **Check Database Size**:
   - Go to Supabase Dashboard → Database → Table Editor
   - Check `audio_files` table size (should be slightly smaller)
   - Verify `waveform_json_url` and `sonic_dna_json_url` columns populated

4. **Test API Endpoints**:
   ```bash
   # Test tracks API
   curl http://localhost:3000/api/music-library/tracks | jq '.tracks | length'
   
   # Test sync API
   curl http://localhost:3000/api/music-library/sync | jq '.folders | length'
   ```
   Should work normally

5. **Test Audio Playback**:
   - Load music library in browser
   - Play a migrated track
   - Verify audio plays correctly
   - Check waveform displays (if applicable)

**If Everything Works**: Proceed to Step 3

**If Issues Found**:
- Check backup files in `data/migration-backup/`
- Review script output for errors
- Verify Supabase Storage bucket permissions

---

### Step 3: Full Migration

**Purpose**: Migrate all remaining records (after successful test)

```bash
cd web
node scripts/migrate-jsonb-to-storage.mjs --force
```

**What Happens**:
- Migrates all ~295 audio files
- Backs up all records before migration
- Uploads all JSONB data to storage
- Updates all database records

**Estimated Time**: 10-30 minutes (depending on network speed)

**Monitor Progress**:
- Script will show progress updates
- Watch for any errors
- Check Supabase Storage bucket size

---

### Step 4: Database Cleanup

**Purpose**: Reclaim disk space after migration

**Run in Supabase SQL Editor**:

```sql
-- Reclaim space from migrated tables
VACUUM FULL audio_files;
VACUUM FULL music_library_tracks;
```

**Note**: `VACUUM FULL` locks tables temporarily. Run during low-traffic period.

**Expected Result**:
- Database size should drop from ~38MB to ~3MB
- Check in Supabase Dashboard → Database → Size

---

## Rollback (If Needed)

If you need to rollback the migration:

```bash
cd web
node scripts/migrate-jsonb-to-storage.mjs --rollback
```

**Note**: Rollback restores from backup files in `data/migration-backup/`

---

## Verification Checklist

After full migration:

- [ ] **Backup Files**: All records backed up in `data/migration-backup/`
- [ ] **Storage Files**: All JSON files in `audio-analysis` bucket
- [ ] **Database Size**: Reduced from 38MB to ~3MB
- [ ] **API Endpoints**: All working correctly
- [ ] **Audio Playback**: Tracks play without issues
- [ ] **Waveform Data**: Displays correctly (if applicable)
- [ ] **Sonic DNA**: Accessible via storage URLs

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Database Size | 38 MB | 3 MB | **92% reduction** |
| Query Time | 500-2000ms | 50-150ms | **10-15x faster** |
| Network Transfer | 37 MB | 3 MB | **92% reduction** |
| Storage Location | Database TOAST | Supabase Storage | CDN cacheable |

---

## Troubleshooting

### Error: "Supabase credentials not found"
- Check `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### Error: "Storage bucket not found"
- Create `audio-analysis` bucket in Supabase Storage
- Set public access if needed

### Error: "Permission denied"
- Verify service role key has admin access
- Check storage bucket policies

### Migration partially completes
- Check backup files exist
- Review script output for specific errors
- Can retry with `--limit` to migrate remaining records

---

## Notes

- Migration script has built-in backup functionality
- Safe to test with small batches first
- Can be run incrementally if needed
- All changes are reversible via rollback

---

**Ready to proceed?** Start with Step 1 (dry-run) to preview the migration.
