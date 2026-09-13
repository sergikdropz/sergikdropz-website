#!/usr/bin/env node

/**
 * Regenerate Comprehensive Sonic DNA for All Tracks
 * 
 * This script regenerates comprehensive Sonic DNA analysis for all tracks
 * that don't have the full comprehensive analysis (with drums, harmony, musicology, etc.)
 * 
 * Usage:
 *   node scripts/regenerate-comprehensive-sonic-dna.mjs
 *   node scripts/regenerate-comprehensive-sonic-dna.mjs --force  # Regenerate all
 *   node scripts/regenerate-comprehensive-sonic-dna.mjs --limit=50
 */

import 'dotenv/config'

const API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

async function regenerateAll(force = false, limit = null) {
  console.log('🔄 Regenerating Comprehensive Sonic DNA Analysis\n')
  
  try {
    // Check current status
    console.log('📊 Checking current status...')
    const statusResponse = await fetch(`${API_BASE_URL}/api/audio/regenerate-all-sonic-dna`)
    const status = await statusResponse.json()
    
    console.log(`   Total tracks: ${status.total}`)
    console.log(`   Comprehensive: ${status.comprehensive}`)
    console.log(`   Basic analysis: ${status.basic}`)
    console.log(`   No analysis: ${status.noAnalysis}`)
    console.log(`   Needs regeneration: ${status.needsRegeneration}\n`)

    if (status.needsRegeneration === 0 && !force) {
      console.log('✅ All tracks already have comprehensive analysis!')
      console.log('   Use --force to regenerate all tracks anyway.\n')
      return
    }

    // Start regeneration
    console.log(`🚀 Starting comprehensive regeneration${force ? ' (force mode)' : ''}...\n`)
    
    const params = new URLSearchParams()
    if (force) params.append('force', 'true')
    if (limit) params.append('limit', limit.toString())
    params.append('batchSize', '3')

    const response = await fetch(`${API_BASE_URL}/api/audio/regenerate-all-sonic-dna?${params}`, {
      method: 'POST'
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const result = await response.json()
    console.log(`✅ Regeneration started!`)
    console.log(`   Processing ${result.total} tracks in batches of ${result.batchSize}\n`)
    console.log(`   This will take some time. Check progress with:`)
    console.log(`   curl "${API_BASE_URL}/api/audio/regenerate-all-sonic-dna"\n`)

    // Poll for progress
    let lastProgress = 0
    const progressInterval = setInterval(async () => {
      try {
        const progressResponse = await fetch(`${API_BASE_URL}/api/audio/regenerate-all-sonic-dna`)
        const progress = await progressResponse.json()
        
        const currentProgress = parseFloat(progress.progress || '0')
        if (currentProgress !== lastProgress) {
          console.log(`📈 Progress: ${progress.comprehensive}/${progress.total} (${progress.progress}%)`)
          lastProgress = currentProgress
        }

        if (progress.needsRegeneration === 0) {
          clearInterval(progressInterval)
          console.log('\n✅ Comprehensive regeneration complete!')
        }
      } catch (err) {
        console.error('Error checking progress:', err.message)
      }
    }, 5000)

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Parse command line arguments
const force = process.argv.includes('--force') || process.argv.includes('-f')
const limitMatch = process.argv.find(arg => arg.startsWith('--limit='))
const limit = limitMatch ? parseInt(limitMatch.split('=')[1]) : null

regenerateAll(force, limit)

