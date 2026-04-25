#!/usr/bin/env node

/**
 * Export all Supabase database data to local JSON files
 * This allows you to work with the data locally without needing Supabase connection
 */

import { createClient } from '@supabase/supabase-js'
import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
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

async function ensureDirectory(dir) {
  try {
    await mkdir(dir, { recursive: true })
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error
    }
  }
}

async function exportTable(tableName) {
  console.log(`\n📥 Exporting ${tableName}...`)
  
  try {
    // Get total count first
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
    
    if (countError) {
      throw countError
    }
    
    console.log(`   Found ${count || 0} records`)
    
    if (count === 0) {
      console.log(`   ⚠️  No data to export for ${tableName}`)
      return { table: tableName, count: 0, data: [] }
    }
    
    // Fetch all data in batches
    const BATCH_SIZE = 1000
    let allData = []
    let offset = 0
    let hasMore = true
    
    while (hasMore) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(offset, offset + BATCH_SIZE - 1)
        .order('created_at', { ascending: true })
      
      if (error) {
        throw error
      }
      
      if (data && data.length > 0) {
        allData = allData.concat(data)
        offset += BATCH_SIZE
        hasMore = data.length === BATCH_SIZE
        process.stdout.write(`   📦 Fetched ${allData.length}/${count} records...\r`)
      } else {
        hasMore = false
      }
    }
    
    console.log(`   ✅ Exported ${allData.length} records`)
    
    return { table: tableName, count: allData.length, data: allData }
  } catch (error) {
    console.error(`   ❌ Error exporting ${tableName}:`, error.message)
    throw error
  }
}

async function exportSchema() {
  console.log('\n📋 Exporting database schema...')
  
  try {
    // Get table schemas
    const schema = {}
    
    for (const tableName of TABLES) {
      const { data, error } = await supabase.rpc('get_table_schema', { table_name: tableName })
      
      // Alternative: Use information_schema query
      const schemaQuery = `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ORDER BY ordinal_position;
      `
      
      // For now, we'll just note the tables exist
      schema[tableName] = {
        exists: true,
        note: 'Schema details available in supabase/schema.sql'
      }
    }
    
    return schema
  } catch (error) {
    console.error('   ⚠️  Could not export schema details:', error.message)
    return {}
  }
}

async function main() {
  console.log('🚀 Supabase Data Export to Local')
  console.log('================================\n')
  
  try {
    // Ensure export directory exists
    await ensureDirectory(EXPORT_DIR)
    console.log(`📁 Export directory: ${EXPORT_DIR}`)
    
    // Export each table
    const exports = {}
    const stats = {
      totalRecords: 0,
      tables: {}
    }
    
    for (const tableName of TABLES) {
      const result = await exportTable(tableName)
      exports[tableName] = result.data
      stats.tables[tableName] = result.count
      stats.totalRecords += result.count
      
      // Save individual table file
      const tableFile = join(EXPORT_DIR, `${tableName}.json`)
      await writeFile(tableFile, JSON.stringify(result.data, null, 2), 'utf-8')
      console.log(`   💾 Saved to ${tableFile}`)
    }
    
    // Export schema info
    const schema = await exportSchema()
    
    // Create summary file
    const summary = {
      exportedAt: new Date().toISOString(),
      supabaseUrl: SUPABASE_URL,
      tables: TABLES,
      stats: stats,
      schema: schema,
      files: TABLES.map(t => `${t}.json`)
    }
    
    const summaryFile = join(EXPORT_DIR, 'export-summary.json')
    await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8')
    
    // Create combined export
    const combinedFile = join(EXPORT_DIR, 'all-data.json')
    await writeFile(combinedFile, JSON.stringify(exports, null, 2), 'utf-8')
    
    console.log('\n✅ Export Complete!')
    console.log('\n📊 Summary:')
    console.log(`   Total records: ${stats.totalRecords}`)
    TABLES.forEach(table => {
      console.log(`   ${table}: ${stats.tables[table]} records`)
    })
    console.log(`\n📁 Files saved to: ${EXPORT_DIR}`)
    console.log(`   - export-summary.json (metadata)`)
    console.log(`   - all-data.json (combined export)`)
    TABLES.forEach(table => {
      console.log(`   - ${table}.json (individual table)`)
    })
    
  } catch (error) {
    console.error('\n❌ Export failed:', error)
    process.exit(1)
  }
}

main()

