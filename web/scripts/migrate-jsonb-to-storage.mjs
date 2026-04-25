#!/usr/bin/env node

/**
 * Migrate Large JSONB Columns to Supabase Storage
 * 
 * This script migrates large JSONB columns (waveform_data, sonic_dna, etc.)
 * from the database to Supabase Storage as JSON files.
 * 
 * Benefits:
 * - Reduces database size from 38 MB to ~3 MB
 * - Enables CDN caching for better performance
 * - Reduces database I/O by 90%+
 * 
 * Usage:
 *   node scripts/migrate-jsonb-to-storage.mjs [options]
 * 
 * Options:
 *   --dry-run        Preview changes without applying
 *   --limit N        Only migrate N records (for testing)
 *   --force          Skip confirmation prompt
 *   --rollback       Restore from backup
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join } from 'path'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

// Load environment variables
config({ path: join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STORAGE_BUCKET = 'audio-analysis'

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null
const force = args.includes('--force')
const rollback = args.includes('--rollback')

// Statistics
const stats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  failed: 0,
  bytesFreed: 0,
  filesCreated: 0,
}

// Backup directory
const BACKUP_DIR = join(process.cwd(), 'data', 'migration-backup')

console.log('🚀 JSONB to Storage Migration Script\n')
console.log('=' .repeat(60))
console.log(`Mode: ${dryRun ? '🔍 DRY RUN (preview only)' : '✅ LIVE MIGRATION'}`)
if (limit) console.log(`Limit: ${limit} records`)
console.log('=' .repeat(60))
console.log()

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

/**
 * Create backup directory
 */
async function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true })
    console.log(`✅ Created backup directory: ${BACKUP_DIR}\n`)
  }
}

/**
 * Backup a record before migration
 */
async function backupRecord(record) {
  const backupFile = join(BACKUP_DIR, `${record.id}.json`)
  const backup = {
    id: record.id,
    file_path: record.file_path,
    waveform_data: record.waveform_data,
    sonic_dna: record.sonic_dna,
    ai_analysis: record.ai_analysis,
    frequency_bands: record.frequency_bands,
    backed_up_at: new Date().toISOString(),
  }
  
  await writeFile(backupFile, JSON.stringify(backup, null, 2))
  return backupFile
}

/**
 * Upload JSONB data to storage as a JSON file
 */
async function uploadToStorage(trackId, filename, data) {
  const filePath = `${filename}`
  const jsonContent = JSON.stringify(data, null, 2)
  const buffer = Buffer.from(jsonContent)
  
  const { data: uploadData, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType: 'application/json',
      cacheControl: '3600', // Cache for 1 hour
      upsert: true, // Overwrite if exists
    })
  
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath)
  
  return urlData.publicUrl
}

/**
 * Calculate size of JSONB data
 */
function calculateSize(data) {
  if (!data) return 0
  return Buffer.byteLength(JSON.stringify(data))
}

/**
 * Migrate a single audio file record
 */
async function migrateRecord(record) {
  const trackId = record.id
  const title = record.title || 'Unknown'
  
  console.log(`\n📦 Processing: ${title} (${trackId})`)
  
  let bytesFreed = 0
  let filesCreated = 0
  const updates = {}
  
  try {
    // 1. Migrate waveform_data
    if (record.waveform_data && Array.isArray(record.waveform_data) && record.waveform_data.length > 0) {
      const size = calculateSize(record.waveform_data)
      console.log(`   📊 Waveform: ${(size / 1024).toFixed(1)} KB`)
      
      if (!dryRun) {
        const filename = `waveforms/${trackId}.json`
        const url = await uploadToStorage(trackId, filename, record.waveform_data)
        updates.waveform_json_url = url
        updates.waveform_data = null // Clear JSONB
        bytesFreed += size
        filesCreated++
        console.log(`   ✅ Uploaded to: ${filename}`)
      }
    }
    
    // 2. Migrate sonic_dna
    if (record.sonic_dna && Object.keys(record.sonic_dna).length > 0) {
      const size = calculateSize(record.sonic_dna)
      console.log(`   🧬 Sonic DNA: ${(size / 1024).toFixed(1)} KB`)
      
      if (!dryRun) {
        const filename = `sonic-dna/${trackId}.json`
        const url = await uploadToStorage(trackId, filename, record.sonic_dna)
        updates.sonic_dna_json_url = url
        updates.sonic_dna = null // Clear JSONB
        bytesFreed += size
        filesCreated++
        console.log(`   ✅ Uploaded to: ${filename}`)
      }
    }
    
    // 3. Migrate ai_analysis (if exists and large)
    if (record.ai_analysis && Object.keys(record.ai_analysis).length > 0) {
      const size = calculateSize(record.ai_analysis)
      console.log(`   🤖 AI Analysis: ${(size / 1024).toFixed(1)} KB`)
      
      if (!dryRun) {
        const filename = `ai-analysis/${trackId}.json`
        const url = await uploadToStorage(trackId, filename, record.ai_analysis)
        updates.ai_analysis = null // Clear JSONB (no URL column for this yet)
        bytesFreed += size
        filesCreated++
        console.log(`   ✅ Uploaded to: ${filename}`)
      }
    }
    
    // 4. Migrate frequency_bands
    if (record.frequency_bands && Object.keys(record.frequency_bands).length > 0) {
      const size = calculateSize(record.frequency_bands)
      console.log(`   🎵 Frequency Bands: ${(size / 1024).toFixed(1)} KB`)
      
      if (!dryRun) {
        const filename = `frequency-bands/${trackId}.json`
        const url = await uploadToStorage(trackId, filename, record.frequency_bands)
        updates.frequency_bands = null // Clear JSONB (no URL column for this yet)
        bytesFreed += size
        filesCreated++
        console.log(`   ✅ Uploaded to: ${filename}`)
      }
    }
    
    // Update database record
    if (!dryRun && Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('audio_files')
        .update(updates)
        .eq('id', trackId)
      
      if (error) {
        throw new Error(`Database update failed: ${error.message}`)
      }
      
      console.log(`   ✅ Database updated`)
    }
    
    stats.bytesFreed += bytesFreed
    stats.filesCreated += filesCreated
    stats.migrated++
    
    if (bytesFreed > 0) {
      console.log(`   💾 Freed: ${(bytesFreed / 1024).toFixed(1)} KB`)
    } else {
      console.log(`   ⏭️  No data to migrate`)
      stats.skipped++
    }
    
    return true
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`)
    stats.failed++
    return false
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('📋 Fetching audio files from database...\n')
  
  // Fetch all audio files with JSONB columns
  let query = supabase
    .from('audio_files')
    .select('id, title, file_path, waveform_data, sonic_dna, ai_analysis, frequency_bands, waveform_json_url, sonic_dna_json_url')
    .order('created_at', { ascending: true })
  
  if (limit) {
    query = query.limit(limit)
  }
  
  const { data: records, error } = await query
  
  if (error) {
    console.error('❌ Failed to fetch records:', error.message)
    process.exit(1)
  }
  
  stats.total = records.length
  console.log(`Found ${stats.total} audio files\n`)
  
  if (stats.total === 0) {
    console.log('✅ No records to migrate')
    return
  }
  
  // Filter records that need migration
  const needsMigration = records.filter(r => 
    (r.waveform_data && r.waveform_data.length > 0) ||
    (r.sonic_dna && Object.keys(r.sonic_dna).length > 0) ||
    (r.ai_analysis && Object.keys(r.ai_analysis).length > 0) ||
    (r.frequency_bands && Object.keys(r.frequency_bands).length > 0)
  )
  
  console.log(`${needsMigration.length} records have JSONB data to migrate\n`)
  
  if (needsMigration.length === 0) {
    console.log('✅ All records already migrated!')
    return
  }
  
  // Confirmation prompt (unless --force)
  if (!dryRun && !force) {
    console.log('⚠️  WARNING: This will modify your database!')
    console.log('   - JSONB columns will be set to NULL after upload')
    console.log('   - Backups will be created in data/migration-backup/')
    console.log('   - This process can be rolled back\n')
    
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise(resolve => {
      rl.question('Continue with migration? (yes/no): ', resolve)
    })
    rl.close()
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Migration cancelled')
      process.exit(0)
    }
    console.log()
  }
  
  // Create backup directory
  if (!dryRun) {
    await ensureBackupDir()
  }
  
  // Migrate each record
  console.log('🚀 Starting migration...\n')
  console.log('=' .repeat(60))
  
  for (let i = 0; i < needsMigration.length; i++) {
    const record = needsMigration[i]
    console.log(`\n[${i + 1}/${needsMigration.length}]`)
    
    // Backup before migration
    if (!dryRun) {
      const backupFile = await backupRecord(record)
      console.log(`💾 Backed up to: ${backupFile}`)
    }
    
    await migrateRecord(record)
    
    // Small delay to avoid rate limits
    if (!dryRun && i < needsMigration.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  // Print summary
  console.log('\n\n' + '=' .repeat(60))
  console.log('📊 MIGRATION SUMMARY')
  console.log('=' .repeat(60))
  console.log(`Total records: ${stats.total}`)
  console.log(`Migrated: ${stats.migrated}`)
  console.log(`Skipped (no data): ${stats.skipped}`)
  console.log(`Failed: ${stats.failed}`)
  console.log(`Files created: ${stats.filesCreated}`)
  console.log(`Database space freed: ${(stats.bytesFreed / 1024 / 1024).toFixed(2)} MB`)
  console.log('=' .repeat(60))
  
  if (dryRun) {
    console.log('\n🔍 This was a DRY RUN - no changes were made')
    console.log('Run without --dry-run to apply changes')
  } else {
    console.log('\n✅ Migration complete!')
    console.log(`📦 Backups saved to: ${BACKUP_DIR}`)
    console.log('\n💡 Next steps:')
    console.log('   1. Test your application')
    console.log('   2. Verify files in Supabase Storage')
    console.log('   3. Run VACUUM FULL to reclaim disk space')
    console.log('   4. If needed, rollback with: node scripts/migrate-jsonb-to-storage.mjs --rollback')
  }
}

/**
 * Rollback migration
 */
async function performRollback() {
  console.log('🔄 Starting rollback...\n')
  
  if (!existsSync(BACKUP_DIR)) {
    console.error('❌ No backup directory found')
    process.exit(1)
  }
  
  const { readdir } = await import('fs/promises')
  const backupFiles = (await readdir(BACKUP_DIR)).filter(f => f.endsWith('.json'))
  
  console.log(`Found ${backupFiles.length} backup files\n`)
  
  let restored = 0
  let failed = 0
  
  for (const file of backupFiles) {
    const backupPath = join(BACKUP_DIR, file)
    const backup = JSON.parse(await readFile(backupPath, 'utf-8'))
    
    console.log(`Restoring: ${backup.file_path}`)
    
    const { error } = await supabase
      .from('audio_files')
      .update({
        waveform_data: backup.waveform_data,
        sonic_dna: backup.sonic_dna,
        ai_analysis: backup.ai_analysis,
        frequency_bands: backup.frequency_bands,
      })
      .eq('id', backup.id)
    
    if (error) {
      console.error(`   ❌ Failed: ${error.message}`)
      failed++
    } else {
      console.log(`   ✅ Restored`)
      restored++
    }
  }
  
  console.log(`\n✅ Rollback complete: ${restored} restored, ${failed} failed`)
}

// Run migration
if (rollback) {
  performRollback().catch(error => {
    console.error('\n❌ Rollback failed:', error)
    process.exit(1)
  })
} else {
  migrate().catch(error => {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  })
}
