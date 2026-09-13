#!/usr/bin/env node

/**
 * Restore all gallery images from gallery.json to Supabase database
 * - Creates missing images
 * - Reactivates soft-deleted images (sets is_active = true)
 * - Updates metadata if changed
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from .env.local
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '')
        process.env[key.trim()] = cleanValue
      }
    }
  })
}

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

async function restoreGallery() {
  console.log('🔄 Starting gallery restoration...\n')

  try {
    // Read gallery.json
    const galleryPath = join(__dirname, '..', 'data', 'gallery.json')
    const galleryData = JSON.parse(readFileSync(galleryPath, 'utf-8'))
    const images = galleryData.images || []

    console.log(`📸 Found ${images.length} images in gallery.json\n`)

    let createdCount = 0
    let reactivatedCount = 0
    let updatedCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (const image of images) {
      try {
        // Check if image exists in database
        const { data: existing, error: checkError } = await supabase
          .from('gallery_images')
          .select('*')
          .eq('image_id', image.id)
          .maybeSingle()

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError
        }

        if (existing) {
          // Image exists - check if it needs updating or reactivating
          const needsUpdate = 
            existing.alt !== image.alt ||
            existing.category !== image.category ||
            existing.description !== (image.description || null) ||
            existing.src !== image.src ||
            existing.is_active === false

          if (needsUpdate) {
            const updateData = {
              alt: image.alt,
              category: image.category,
              description: image.description || null,
              src: image.src,
              is_active: true, // Always reactivate
            }

            // Only update if values actually changed
            if (existing.alt !== image.alt) updateData.alt = image.alt
            if (existing.category !== image.category) updateData.category = image.category
            if (existing.description !== (image.description || null)) {
              updateData.description = image.description || null
            }
            if (existing.src !== image.src) updateData.src = image.src
            if (existing.is_active === false) {
              updateData.is_active = true
              reactivatedCount++
              console.log(`♻️  Reactivating ${image.id}`)
            } else {
              updatedCount++
              console.log(`✏️  Updating ${image.id}`)
            }

            const { error: updateError } = await supabase
              .from('gallery_images')
              .update(updateData)
              .eq('image_id', image.id)

            if (updateError) {
              console.error(`❌ Error updating ${image.id}:`, updateError.message)
              errorCount++
            }
          } else {
            skippedCount++
            console.log(`✓ ${image.id} (already up to date)`)
          }
        } else {
          // Image doesn't exist - create it
          const isStoredInSupabase = image.src.startsWith('http') && image.src.includes('supabase')
          const storageUrl = isStoredInSupabase ? image.src : null

          const { data, error } = await supabase
            .from('gallery_images')
            .insert({
              image_id: image.id,
              filename: image.src.split('/').pop() || image.id,
              src: image.src,
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
            console.error(`❌ Error creating ${image.id}:`, error.message)
            errorCount++
          } else {
            createdCount++
            console.log(`✅ Created ${image.id}`)
          }
        }
      } catch (error) {
        console.error(`❌ Error processing ${image.id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n📊 Restoration Summary:')
    console.log(`   ✅ Created: ${createdCount}`)
    console.log(`   ♻️  Reactivated: ${reactivatedCount}`)
    console.log(`   ✏️  Updated: ${updatedCount}`)
    console.log(`   ✓ Skipped (up to date): ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log(`   📸 Total: ${images.length}\n`)

    if (errorCount === 0) {
      console.log('🎉 Gallery restoration completed successfully!')
      console.log(`\n📈 Active images in database: ${createdCount + reactivatedCount + updatedCount + skippedCount}`)
    } else {
      console.log('⚠️  Restoration completed with some errors')
    }

    // Show final count
    const { count } = await supabase
      .from('gallery_images')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    console.log(`\n📊 Total active images in database: ${count || 0}`)
  } catch (error) {
    console.error('❌ Restoration failed:', error)
    process.exit(1)
  }
}

// Run restoration
restoreGallery()
