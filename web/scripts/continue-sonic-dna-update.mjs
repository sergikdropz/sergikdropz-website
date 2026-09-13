#!/usr/bin/env node
/**
 * Continue Sonic DNA Update
 * 
 * Run this script to continue updating tracks with complete Sonic DNA structure.
 * Uses merge functionality to preserve all existing data.
 * 
 * Usage:
 *   node scripts/continue-sonic-dna-update.mjs
 *   node scripts/continue-sonic-dna-update.mjs --batch-size 10
 *   node scripts/continue-sonic-dna-update.mjs --all (process all remaining)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

// Parse command line arguments
const args = process.argv.slice(2)
const processAll = args.includes('--all')
const batchSizeArg = args.find(a => a.startsWith('--batch-size'))
const maxTracks = processAll ? Infinity : (batchSizeArg ? parseInt(batchSizeArg.split('=')[1] || args[args.indexOf('--batch-size') + 1]) : 20)

async function continueUpdate() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('🔄 CONTINUING SONIC DNA UPDATE')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('')
  
  // Get tracks that need update
  const { data: tracks } = await supabase
    .from('audio_files')
    .select('id, title, file_path, sonic_dna')
    .not('sonic_dna', 'is', null)
    .order('title')
  
  // Filter to tracks missing complete structure
  const needsUpdate = tracks.filter(t => {
    const d = t.sonic_dna
    return !d.description || d.description.length < 20 ||
           !d.emotional?.primaryEmotions?.length ||
           !d.historical?.eraInfluences?.length ||
           !d.regional?.primaryRegions?.length ||
           !d.musical?.instrumentation?.length
  })
  
  console.log(`📊 Status: ${tracks.length - needsUpdate.length}/${tracks.length} tracks complete`)
  console.log(`📋 Tracks needing update: ${needsUpdate.length}`)
  console.log(`🎯 Processing: ${processAll ? 'ALL' : Math.min(maxTracks, needsUpdate.length)} tracks`)
  console.log('')
  
  if (needsUpdate.length === 0) {
    console.log('✅ All tracks are already complete!')
    return
  }
  
  let processed = 0
  let succeeded = 0
  let failed = 0
  
  const toProcess = needsUpdate.slice(0, maxTracks)
  
  for (const track of toProcess) {
    process.stdout.write(`🔄 ${track.title.substring(0, 40).padEnd(40)} `)
    
    try {
      // Trigger analysis
      await fetch(`${API_URL}/api/audio/sonic-dna?path=${encodeURIComponent(track.file_path)}&force=true`, {
        method: 'POST'
      })
      
      // Wait for completion
      let completed = false
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000))
        
        const { data: check } = await supabase
          .from('audio_files')
          .select('sonic_dna_status, sonic_dna')
          .eq('id', track.id)
          .single()
        
        if (check?.sonic_dna_status === 'completed') {
          // Verify it has complete data
          const d = check.sonic_dna
          const isComplete = d.description?.length > 20 &&
                            d.emotional?.primaryEmotions?.length > 0 &&
                            d.musical?.instrumentation?.length > 0
          
          if (isComplete) {
            console.log('✅ Complete')
            succeeded++
          } else {
            console.log('⚠️ Partial')
            succeeded++
          }
          completed = true
          break
        }
        
        if (check?.sonic_dna_status === 'failed') {
          console.log('❌ Failed')
          failed++
          completed = true
          break
        }
      }
      
      if (!completed) {
        console.log('⏱️ Timeout')
        failed++
      }
    } catch (err) {
      console.log('❌ Error:', err.message)
      failed++
    }
    
    processed++
  }
  
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('📊 UPDATE SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`Processed:  ${processed}`)
  console.log(`Succeeded:  ${succeeded}`)
  console.log(`Failed:     ${failed}`)
  console.log(`Remaining:  ${needsUpdate.length - processed}`)
  console.log('═══════════════════════════════════════════════════════════════════')
  
  if (needsUpdate.length - processed > 0 && !processAll) {
    console.log('')
    console.log('💡 Run again to process more tracks, or use --all to process all remaining')
  }
}

continueUpdate().catch(console.error)
