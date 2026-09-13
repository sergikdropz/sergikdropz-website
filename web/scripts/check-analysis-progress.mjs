#!/usr/bin/env node

/**
 * Check Comprehensive Sonic DNA Analysis Progress
 * Queries the database directly to show current status
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env.local')
config({ path: envPath })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkProgress() {
  console.log('📊 Checking Comprehensive Sonic DNA Analysis Progress\n')
  console.log('='.repeat(70))
  console.log()

  try {
    // Get total tracks
    const { count: totalTracks, error: totalError } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })

    if (totalError) {
      throw new Error(`Failed to get total tracks: ${totalError.message}`)
    }

    // Get all tracks with their sonic_dna status
    const { data: allTracks, error: tracksError } = await supabase
      .from('audio_files')
      .select('id, title, sonic_dna, sonic_dna_status, sonic_dna_analyzed_at, sonic_dna_error')

    if (tracksError) {
      throw new Error(`Failed to get tracks: ${tracksError.message}`)
    }

    // Analyze status
    let comprehensiveCount = 0
    let basicCount = 0
    let noAnalysisCount = 0
    let processingCount = 0
    let failedCount = 0
    let pendingCount = 0

    allTracks.forEach(track => {
      if (track.sonic_dna_status === 'processing') {
        processingCount++
      } else if (track.sonic_dna_status === 'failed') {
        failedCount++
      } else if (track.sonic_dna_status === 'completed' && track.sonic_dna) {
        const hasComprehensive = track.sonic_dna && 
          typeof track.sonic_dna === 'object' && 
          'comprehensive' in track.sonic_dna
        if (hasComprehensive) {
          comprehensiveCount++
        } else {
          basicCount++
        }
      } else {
        pendingCount++
        noAnalysisCount++
      }
    })

    const needsRegeneration = basicCount + noAnalysisCount
    const progress = totalTracks ? ((comprehensiveCount / totalTracks) * 100).toFixed(1) : '0'

    // Display results
    console.log('📈 Status Summary:')
    console.log(`   Total Tracks: ${totalTracks || 0}`)
    console.log()
    console.log('✅ Comprehensive Analysis:')
    console.log(`   Completed: ${comprehensiveCount} (${progress}%)`)
    console.log()
    console.log('⏳ In Progress:')
    console.log(`   Processing: ${processingCount}`)
    console.log()
    console.log('📝 Needs Analysis:')
    console.log(`   Basic (needs upgrade): ${basicCount}`)
    console.log(`   No Analysis: ${noAnalysisCount}`)
    console.log(`   Total Needs Regeneration: ${needsRegeneration}`)
    console.log()
    console.log('❌ Failed:')
    console.log(`   Failed: ${failedCount}`)
    console.log()

    // Show progress bar
    const barLength = 50
    const filled = Math.round((comprehensiveCount / totalTracks) * barLength)
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled)
    console.log(`Progress: [${bar}] ${progress}%`)
    console.log()

    // Show recent activity
    if (processingCount > 0) {
      console.log('🔄 Currently Processing:')
      const processingTracks = allTracks
        .filter(t => t.sonic_dna_status === 'processing')
        .slice(0, 5)
      processingTracks.forEach(track => {
        console.log(`   • ${track.title}`)
      })
      if (processingCount > 5) {
        console.log(`   ... and ${processingCount - 5} more`)
      }
      console.log()
    }

    // Show recent failures
    if (failedCount > 0) {
      console.log('❌ Recent Failures:')
      const failedTracks = allTracks
        .filter(t => t.sonic_dna_status === 'failed')
        .slice(0, 5)
      failedTracks.forEach(track => {
        console.log(`   • ${track.title}`)
        if (track.sonic_dna_error) {
          console.log(`     Error: ${track.sonic_dna_error.substring(0, 60)}...`)
        }
      })
      if (failedCount > 5) {
        console.log(`   ... and ${failedCount - 5} more`)
      }
      console.log()
    }

    // Estimate time remaining
    if (processingCount > 0 || needsRegeneration > 0) {
      const avgTimePerTrack = 45 // seconds
      const remaining = needsRegeneration + processingCount
      const estimatedSeconds = remaining * avgTimePerTrack
      const estimatedMinutes = Math.round(estimatedSeconds / 60)
      const estimatedHours = Math.floor(estimatedMinutes / 60)
      const remainingMinutes = estimatedMinutes % 60

      console.log('⏱️  Estimated Time Remaining:')
      if (estimatedHours > 0) {
        console.log(`   ~${estimatedHours}h ${remainingMinutes}m`)
      } else {
        console.log(`   ~${estimatedMinutes}m`)
      }
      console.log()
    }

    // Show completion status
    if (comprehensiveCount === totalTracks) {
      console.log('🎉 All tracks have comprehensive analysis!')
    } else if (needsRegeneration === 0 && processingCount === 0) {
      console.log('✅ All tracks are processed!')
    }

  } catch (error) {
    console.error('❌ Error checking progress:', error.message)
    process.exit(1)
  }
}

checkProgress()

