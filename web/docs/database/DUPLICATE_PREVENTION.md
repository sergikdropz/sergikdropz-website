# Duplicate Prevention System

## Overview

The bidirectional sync system includes comprehensive duplicate prevention to ensure files and database records are never duplicated unless explicitly requested.

## Features

### 1. File Duplicate Prevention

**Storage Files:**
- Checks if file already exists in Supabase Storage before uploading
- Prevents re-uploading identical files
- Skips uploads if file exists (unless `--force` or `--regenerate`)

**Local Files:**
- Checks if file already exists locally before downloading
- Prevents re-downloading files that are already present
- Skips downloads if file exists (unless `--force` or `--regenerate`)

### 2. Database Duplicate Prevention

**Primary Check:**
- Checks for existing records by `file_path` before inserting
- Updates existing records instead of creating duplicates
- Prevents duplicate database entries

**Secondary Check:**
- Checks for duplicates by `file_name` in the same folder
- Warns about potential duplicates
- Skips database updates to prevent duplicates (unless `--force` or `--regenerate`)

**Error Handling:**
- Catches database unique constraint violations
- Prevents duplicate key errors
- Logs warnings for duplicate attempts

### 3. Hash-Based Change Detection

**File Hashing:**
- Uses MD5 hashing to detect file changes
- Only syncs files that have actually changed
- Tracks file hashes in sync state

**Hash Comparison:**
- Compares current file hash with stored hash
- Only uploads if hash has changed
- Prevents unnecessary transfers

## Usage

### Default Behavior (Duplicate Prevention Enabled)

```bash
# Normal sync - duplicates are prevented
node scripts/sync-all-bidirectional.mjs
```

**What happens:**
- Files that already exist are skipped
- Database records that already exist are updated (not duplicated)
- Duplicate warnings are logged
- Summary shows how many files were skipped

### Force Overwrite

```bash
# Force overwrite existing files
node scripts/sync-all-bidirectional.mjs --force
```

**What happens:**
- Existing files are overwritten
- Database records are updated
- Duplicate checks are bypassed for file uploads
- Use with caution!

### Regenerate Mode

```bash
# Allow regeneration of files/records
node scripts/sync-all-bidirectional.mjs --regenerate
```

**What happens:**
- Duplicate checks are bypassed
- Files can be re-uploaded even if they exist
- Database records can be regenerated
- Use when you explicitly want to regenerate data

### Dry Run (Preview)

```bash
# Preview what would be synced (without duplicates)
node scripts/sync-all-bidirectional.mjs --dry-run
```

**What happens:**
- Shows what would be uploaded/downloaded
- Shows what would be skipped (duplicates)
- No actual changes are made

## Duplicate Detection Methods

### 1. Storage File Existence Check

```javascript
// Checks if file exists in Supabase Storage
const exists = await checkFileExists(bucketName, filePath)
if (exists && !FORCE && !REGENERATE) {
  // Skip upload
}
```

### 2. Local File Existence Check

```javascript
// Checks if file exists locally
if (existsSync(localPath) && !FORCE && !REGENERATE) {
  // Skip download
}
```

### 3. Database Record Check

```javascript
// Checks for existing database record by file_path
const existing = await checkDuplicateDatabaseRecord(filePath)
if (existing && !FORCE && !REGENERATE) {
  // Update existing record instead of creating duplicate
}
```

### 4. Database Name Check

```javascript
// Checks for duplicates by file_name in same folder
const nameMatches = await supabase
  .from('audio_files')
  .select('id, file_path, file_name')
  .eq('file_name', fileName)
  .eq('folder_path', folderPath)

if (nameMatches && nameMatches.length > 0) {
  // Potential duplicate found
}
```

## Examples

### Example 1: Normal Sync (Duplicates Prevented)

```bash
$ node scripts/sync-all-bidirectional.mjs --direction=up

🔄 Comprehensive Bidirectional Sync: Local ↔ Supabase
============================================================
Direction:        up
Duplicate Prevention: ENABLED
============================================================

🎵 Syncing Audio Files...
📁 Scanning local audio files...
   Found 150 audio files locally

📦 Scanning Supabase Storage...
   Found 145 files in storage

📤 Uploading files to Supabase...
   ✅ Uploaded: new-track.wav (5.2MB)
   ⏭️  Skipped (already exists): existing-track.mp3
   ⏭️  Skipped (already exists): another-track.flac

📊 SYNC SUMMARY
============================================================
Uploaded:           5
Skipped:            145
Errors:             0

🛡️  Duplicate Prevention: 145 files/records skipped to prevent duplicates
```

### Example 2: Regenerate Mode

```bash
$ node scripts/sync-all-bidirectional.mjs --regenerate

⚠️  REGENERATE MODE: Duplicate checks bypassed
   Files and records may be regenerated

📤 Uploading files to Supabase...
   ✅ Uploaded: track1.wav (5.2MB)  # Re-uploaded even though exists
   ✅ Uploaded: track2.mp3 (3.1MB)  # Re-uploaded even though exists
```

### Example 3: Database Duplicate Prevention

```
📤 Uploading files to Supabase...
   ✅ Uploaded: new-track.wav (5.2MB)
   
   ⚠️  Potential duplicate found by name: track.wav
      Existing: audio/releases/track.wav
      New: audio/unreleased/track.wav
      ⏭️  Skipping database update to prevent duplicate
```

## Best Practices

### 1. Always Use Default Mode

**Recommended:**
```bash
node scripts/sync-all-bidirectional.mjs
```

**Why:**
- Prevents accidental duplicates
- Safe and efficient
- Only syncs what's needed

### 2. Use Dry Run First

**Recommended:**
```bash
node scripts/sync-all-bidirectional.mjs --dry-run
```

**Why:**
- Preview what will be synced
- See what duplicates will be prevented
- Verify before making changes

### 3. Use Regenerate Only When Needed

**When to use:**
- Re-analyzing files (waveforms, Sonic DNA)
- Fixing corrupted data
- Explicitly regenerating metadata

**Example:**
```bash
# Regenerate all waveforms and Sonic DNA
node scripts/sync-all-bidirectional.mjs --regenerate --metadata-only
```

### 4. Monitor Skipped Files

**Check the summary:**
- Look for high skip counts (indicates many duplicates prevented)
- Review warnings about potential duplicates
- Verify skipped files are intentional

## Troubleshooting

### Issue: Files Not Syncing

**Problem:** Files are being skipped even though they should sync.

**Solution:**
1. Check if files already exist:
   ```bash
   # Check Supabase Storage
   # Check local files
   ```
2. Use `--force` if you need to overwrite:
   ```bash
   node scripts/sync-all-bidirectional.mjs --force
   ```

### Issue: Database Duplicates Still Created

**Problem:** Duplicate database records are being created.

**Solution:**
1. Check for existing duplicates:
   ```bash
   node scripts/analyze-database-duplicates.mjs
   ```
2. Remove duplicates:
   ```bash
   node scripts/remove-database-duplicates.mjs --confirm
   ```
3. Re-run sync with duplicate prevention:
   ```bash
   node scripts/sync-all-bidirectional.mjs
   ```

### Issue: Too Many Files Skipped

**Problem:** Many files are being skipped, but you want to sync them.

**Solution:**
1. Verify files actually exist:
   - Check Supabase Storage
   - Check local filesystem
2. Use `--regenerate` if you want to re-upload:
   ```bash
   node scripts/sync-all-bidirectional.mjs --regenerate
   ```

## Summary

✅ **Duplicate Prevention: ENABLED by default**  
✅ **Files: Not re-uploaded if they exist**  
✅ **Database: Records updated, not duplicated**  
✅ **Hash-based: Only changed files are synced**  
✅ **Safe: Use `--regenerate` only when needed**  

The system ensures files and database records are never duplicated unless you explicitly request regeneration with the `--regenerate` flag.
