#!/usr/bin/env node

/**
 * Migration script to populate Supabase gallery_images table from gallery.json
 * This creates the database entries as the source of truth
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function migrateGallery() {
  console.log('🚀 Starting gallery migration to Supabase...\n')

  try {
    // Read gallery.json
    const galleryPath = join(__dirname, '..', 'data', 'gallery.json')
    const galleryData = JSON.parse(readFileSync(galleryPath, 'utf-8'))
    const images = galleryData.images || []

    console.log(`📸 Found ${images.length} images in gallery.json\n`)

    let successCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (const image of images) {
      try {
        // Check if image already exists
        const { data: existing, error: checkError } = await supabase
          .from('gallery_images')
          .select('id')
          .eq('image_id', image.id)
          .maybeSingle()

        // If error is not "not found", it's a real error
        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError
        }

        if (existing) {
          console.log(`⏭️  Skipping ${image.id} (already exists)`)
          skippedCount++
          continue
        }

        // Determine if stored in Supabase or local
        const isStoredInSupabase = image.src.startsWith('http') && image.src.includes('supabase')
        const storageUrl = isStoredInSupabase ? image.src : null
        const src = image.src

        // Insert into database
        const { data, error } = await supabase
          .from('gallery_images')
          .insert({
            image_id: image.id,
            filename: image.src.split('/').pop() || image.id,
            src: src,
            alt: image.alt,
            category: image.category,
            description: image.description || null,
            storage_url: storageUrl,
            is_stored_in_supabase: isStoredInSupabase,
            is_active: true,
            display_order: 0,
          })
          .select()
          .single()

        if (error) {
          console.error(`❌ Error inserting ${image.id}:`, error.message)
          errorCount++
        } else {
          console.log(`✅ Migrated ${image.id}`)
          successCount++
        }
      } catch (error) {
        console.error(`❌ Error processing ${image.id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n📊 Migration Summary:')
    console.log(`   ✅ Success: ${successCount}`)
    console.log(`   ⏭️  Skipped: ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log(`   📸 Total: ${images.length}\n`)

    if (errorCount === 0) {
      console.log('🎉 Migration completed successfully!')
    } else {
      console.log('⚠️  Migration completed with some errors')
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateGallery()
