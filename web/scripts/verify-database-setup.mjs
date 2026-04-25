#!/usr/bin/env node

/**
 * Verifies that the music library database tables are set up correctly
 * Run with: node scripts/verify-database-setup.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔍 Verifying database setup...\n')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  console.error('\n💡 Add these to web/.env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function verifyTables() {
  const tables = ['music_library_folders', 'music_library_tracks']
  const results = {}

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1)

      if (error) {
        if (error.message.includes('does not exist') || error.message.includes('relation')) {
          results[table] = { exists: false, error: 'Table does not exist' }
        } else {
          results[table] = { exists: true, error: error.message }
        }
      } else {
        results[table] = { exists: true, count: 'unknown' }
        
        // Get count
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        
        results[table].count = count || 0
      }
    } catch (error) {
      results[table] = { exists: false, error: error.message }
    }
  }

  return results
}

async function main() {
  console.log('📊 Checking tables...\n')

  const results = await verifyTables()

  let allGood = true

  for (const [table, result] of Object.entries(results)) {
    if (result.exists) {
      console.log(`✅ ${table}`)
      if (result.count !== undefined) {
        console.log(`   Records: ${result.count}`)
      }
    } else {
      console.log(`❌ ${table}`)
      console.log(`   Error: ${result.error}`)
      allGood = false
    }
  }

  console.log('\n')

  if (!allGood) {
    console.log('⚠️  Some tables are missing!')
    console.log('\n📝 To fix:')
    console.log('   1. Go to Supabase Dashboard → SQL Editor')
    console.log('   2. Run: web/supabase/music_library_schema.sql')
    console.log('   3. Run this script again to verify\n')
    process.exit(1)
  }

  console.log('✅ All tables exist!')
  console.log('\n📝 Next steps:')
  console.log('   1. Sync JSON to database:')
  console.log('      node scripts/sync-music-library-to-db.mjs')
  console.log('   2. Access admin panel:')
  console.log('      http://localhost:3000/admin/music-library\n')
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
