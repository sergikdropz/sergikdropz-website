#!/usr/bin/env node

/**
 * Update folder parent relationships in database
 * Moves playlists under "All Tracks"
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = resolve(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Check web/.env.local or web/.env files')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function updateFolderParents() {
  console.log('🔄 Updating folder parent relationships...\n')

  // Folders to move under "All Tracks"
  const foldersToMove = [
    { id: 'folder-playlists', name: 'Curated ID Playlists' },
    { id: 'artist-sergik', name: 'SERGIK EP Collection' }
  ]

  // First, verify "All Tracks" folder exists
  const { data: allTracksFolder, error: checkError } = await supabase
    .from('music_library_folders')
    .select('id, name')
    .eq('id', 'folder-all-tracks')
    .single()

  if (checkError || !allTracksFolder) {
    console.error('❌ "All Tracks" folder not found in database!')
    console.error('   Please run the sync from admin panel first to create it.')
    return
  }

  console.log(`✅ Found "All Tracks" folder (${allTracksFolder.name})\n`)

  // Update each folder's parent_id
  for (const folder of foldersToMove) {
    console.log(`📁 Updating "${folder.name}" (${folder.id})...`)
    
    const { data, error } = await supabase
      .from('music_library_folders')
      .update({ parent_id: 'folder-all-tracks' })
      .eq('id', folder.id)
      .select()

    if (error) {
      console.error(`   ❌ Error: ${error.message}`)
    } else if (data && data.length > 0) {
      console.log(`   ✅ Moved "${data[0].name}" under "All Tracks"`)
    } else {
      console.log(`   ⚠️  Folder ${folder.id} not found in database`)
    }
  }

  console.log('\n✅ Database update complete!')
  console.log('\n💡 Next steps:')
  console.log('   1. Use the "Sync" button in /admin/music to sync track references')
  console.log('   2. Or the sync will happen automatically when you sync JSON to database')
}

updateFolderParents().catch(console.error)
