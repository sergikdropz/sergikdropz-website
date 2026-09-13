#!/usr/bin/env node

/**
 * Import local JSON data back into Supabase
 * Useful for restoring data or syncing local changes
 */

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const EXPORT_DIR = join(__dirname, '../data/supabase-export')
const TABLES = ['audio_files', 'purchases']

async function importTable(tableName, data, options = {}) {
  const { clearFirst = false, batchSize = 100 } = options
  
  console.log(`\n📤 Importing ${tableName}...`)
  console.log(`   Records to import: ${data.length}`)
  
  try {
    // Clear existing data if requested
    if (clearFirst) {
      console.log('   🗑️  Clearing existing data...')
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
      
      if (deleteError) {
        throw deleteError
      }
      console.log('   ✅ Cleared existing data')
    }
    
    // Import in batches
    let imported = 0
    let errors = 0
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)
      
      const { error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'id' })
      
      if (error) {
        console.error(`   ❌ Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message)
        errors++
      } else {
        imported += batch.length
        process.stdout.write(`   📦 Imported ${imported}/${data.length} records...\r`)
      }
    }
    
    console.log(`\n   ✅ Imported ${imported} records`)
    if (errors > 0) {
      console.log(`   ⚠️  ${errors} batch(es) had errors`)
    }
    
    return { imported, errors }
  } catch (error) {
    console.error(`   ❌ Error importing ${tableName}:`, error.message)
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  const clearFirst = args.includes('--clear') || args.includes('-c')
  const tableArg = args.find(arg => arg.startsWith('--table='))
  const tablesToImport = tableArg ? [tableArg.split('=')[1]] : TABLES
  
  console.log('🚀 Import Local Data to Supabase')
  console.log('================================\n')
  
  if (clearFirst) {
    console.log('⚠️  WARNING: --clear flag is set. This will DELETE all existing data!')
    console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  try {
    const summaryFile = join(EXPORT_DIR, 'export-summary.json')
    const summary = JSON.parse(await readFile(summaryFile, 'utf-8'))
    
    console.log(`📁 Loading data from: ${EXPORT_DIR}`)
    console.log(`📅 Original export date: ${summary.exportedAt}`)
    console.log(`📊 Original stats: ${summary.stats.totalRecords} total records\n`)
    
    const stats = {
      totalImported: 0,
      totalErrors: 0,
      tables: {}
    }
    
    for (const tableName of tablesToImport) {
      if (!TABLES.includes(tableName)) {
        console.log(`   ⚠️  Skipping unknown table: ${tableName}`)
        continue
      }
      
      const tableFile = join(EXPORT_DIR, `${tableName}.json`)
      const data = JSON.parse(await readFile(tableFile, 'utf-8'))
      
      const result = await importTable(tableName, data, { clearFirst })
      stats.tables[tableName] = result
      stats.totalImported += result.imported
      stats.totalErrors += result.errors
    }
    
    console.log('\n✅ Import Complete!')
    console.log('\n📊 Summary:')
    console.log(`   Total imported: ${stats.totalImported} records`)
    if (stats.totalErrors > 0) {
      console.log(`   Errors: ${stats.totalErrors}`)
    }
    tablesToImport.forEach(table => {
      if (stats.tables[table]) {
        console.log(`   ${table}: ${stats.tables[table].imported} records`)
      }
    })
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ Export files not found!')
      console.error(`   Run 'node scripts/export-supabase-to-local.mjs' first`)
    } else {
      console.error('\n❌ Import failed:', error)
    }
    process.exit(1)
  }
}

main()

