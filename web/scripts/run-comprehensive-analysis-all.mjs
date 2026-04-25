#!/usr/bin/env node

/**
 * Run Comprehensive Sonic DNA Analysis on All Tracks
 * 
 * This script triggers comprehensive analysis for all tracks in Supabase,
 * ensuring all tracks have:
 * - Proper BPM detection and storage
 * - Complete Sonic DNA with description, intention, and all enhanced fields
 * - Comprehensive analysis data (musicology, cultural, technical)
 * - Linked to tempo tool for auto-update
 * 
 * Usage:
 *   node scripts/run-comprehensive-analysis-all.mjs
 *   node scripts/run-comprehensive-analysis-all.mjs --force
 *   node scripts/run-comprehensive-analysis-all.mjs --limit 50
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env.local')
config({ path: envPath })

const API_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const force = process.argv.includes('--force') || process.argv.includes('-f')
const limitIndex = process.argv.findIndex(arg => arg === '--limit' || arg === '-l')
const limit = limitIndex !== -1 && process.argv[limitIndex + 1] 
  ? parseInt(process.argv[limitIndex + 1]) 
  : null

async function checkServerStatus() {
  try {
    const response = await fetch(`${API_URL}/api/health`)
    return response.ok
  } catch (error) {
    return false
  }
}

async function startAnalysis() {
  console.log('🧬 Comprehensive Sonic DNA Analysis for All Tracks\n')
  console.log('='.repeat(70))
  console.log()

  // Check if server is running
  console.log('📡 Checking server status...')
  const serverRunning = await checkServerStatus()
  
  if (!serverRunning) {
    console.error('❌ Server is not running!')
    console.error(`   Please start the Next.js server first:`)
    console.error(`   cd web && npm run dev`)
    process.exit(1)
  }
  console.log('✅ Server is running\n')

  // Build API URL
  let apiUrl = `${API_URL}/api/audio/regenerate-all-sonic-dna?force=${force}`
  if (limit) {
    apiUrl += `&limit=${limit}`
  }
  apiUrl += '&batchSize=3' // Process 3 at a time to avoid rate limits

  console.log('🚀 Starting comprehensive analysis...')
  console.log(`   API: ${apiUrl}`)
  console.log(`   Force: ${force ? 'Yes (regenerate all)' : 'No (only missing)'}`)
  if (limit) {
    console.log(`   Limit: ${limit} tracks`)
  }
  console.log()

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    
    if (data.message === 'No tracks to analyze') {
      console.log('✅ All tracks already have comprehensive analysis!')
      console.log(`   Total tracks: ${data.total || 0}`)
      return
    }

    if (data.message === 'All tracks already have comprehensive analysis') {
      console.log('✅ All tracks already have comprehensive analysis!')
      console.log(`   Total tracks: ${data.total || 0}`)
      return
    }

    console.log('✅ Analysis started successfully!')
    console.log()
    console.log('📊 Statistics:')
    console.log(`   Total tracks to analyze: ${data.total}`)
    console.log(`   Batch size: ${data.batchSize}`)
    console.log(`   Status: ${data.status}`)
    console.log()
    console.log('⏳ Analysis is running in the background...')
    console.log('   This may take a while depending on the number of tracks.')
    console.log()
    console.log('💡 Monitor progress:')
    console.log(`   curl "${API_URL}/api/audio/regenerate-all-sonic-dna"`)
    console.log()
    console.log('📝 What\'s being analyzed:')
    console.log('   ✓ Track description and intention')
    console.log('   ✓ Technical analysis (BPM, key, scale, time signature)')
    console.log('   ✓ Drum pattern analysis with genre styles')
    console.log('   ✓ Musicology and cultural analysis')
    console.log('   ✓ Enhanced genre analysis')
    console.log('   ✓ All data saved to database for instant playback')
    console.log()

  } catch (error) {
    console.error('❌ Error starting analysis:', error.message)
    process.exit(1)
  }
}

async function checkProgress() {
  try {
    const response = await fetch(`${API_URL}/api/audio/regenerate-all-sonic-dna`)
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = await response.json()
    
    console.log('\n📊 Current Progress:')
    console.log(`   Total: ${data.total || 0}`)
    console.log(`   Comprehensive: ${data.comprehensive || 0}`)
    console.log(`   Basic: ${data.basic || 0}`)
    console.log(`   No Analysis: ${data.noAnalysis || 0}`)
    console.log(`   Needs Regeneration: ${data.needsRegeneration || 0}`)
    
    if (data.progress) {
      console.log(`   Progress: ${data.progress}%`)
    }
  } catch (error) {
    console.error('Error checking progress:', error.message)
  }
}

// Main execution
async function main() {
  await startAnalysis()
  
  // If not forcing and limit is set, wait a bit then show progress
  if (!force && limit) {
    console.log('⏳ Waiting 5 seconds to check initial progress...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    await checkProgress()
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

