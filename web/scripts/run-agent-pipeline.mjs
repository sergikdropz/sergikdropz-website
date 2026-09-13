#!/usr/bin/env node

/**
 * Run Sonic DNA Analysis Using Agent Pipeline
 * 
 * This script uses specialized AI agents for efficient, parallel analysis
 * 
 * Usage:
 *   node scripts/run-agent-pipeline.mjs
 *   node scripts/run-agent-pipeline.mjs --force
 *   node scripts/run-agent-pipeline.mjs --limit 50
 *   node scripts/run-agent-pipeline.mjs --trackId abc123
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
const limitIndex = process.argv.indexOf('--limit')
const limit = limitIndex !== -1 ? parseInt(process.argv[limitIndex + 1]) : null
const batchSizeIndex = process.argv.indexOf('--batchSize')
const batchSize = batchSizeIndex !== -1 ? parseInt(process.argv[batchSizeIndex + 1]) : 3
const trackIdIndex = process.argv.indexOf('--trackId')
const trackId = trackIdIndex !== -1 ? process.argv[trackIdIndex + 1] : null

async function checkServerStatus() {
  try {
    const response = await fetch(`${API_URL}/api/health`)
    return response.ok
  } catch (error) {
    return false
  }
}

async function analyzeSingleTrack(trackId) {
  console.log(`🎯 Analyzing single track: ${trackId}\n`)
  
  let endpoint = `${API_URL}/api/audio/sonic-dna-agents?trackId=${trackId}`
  if (force) {
    endpoint += '&force=true'
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error || errorData.message}`)
    }

    const result = await response.json()
    console.log('✅ Analysis completed!')
    console.log(`   Status: ${result.status}`)
    console.log(`   Cached: ${result.cached ? 'Yes' : 'No'}`)
    if (result.sonicDNA) {
      console.log(`   Description: ${result.sonicDNA.description ? 'Yes' : 'No'}`)
      console.log(`   Intention: ${result.sonicDNA.intention ? 'Yes' : 'No'}`)
    }
  } catch (error) {
    console.error(`\n❌ Failed: ${error.message}`)
    process.exit(1)
  }
}

async function analyzeAllTracks() {
  console.log('🧬 Sonic DNA Agent Pipeline Analysis\n')
  console.log('='.repeat(70))
  console.log()

  console.log('📡 Checking server status...')
  const isServerRunning = await checkServerStatus()

  if (!isServerRunning) {
    console.error('❌ Next.js server is not running. Please start it with `npm run dev` or `npm start`.')
    process.exit(1)
  }
  console.log('✅ Server is running')
  console.log()

  let endpoint = `${API_URL}/api/audio/regenerate-all-sonic-dna-agents`
  const params = new URLSearchParams()
  if (force) {
    params.append('force', 'true')
  }
  if (limit) {
    params.append('limit', limit.toString())
  }
  if (batchSize) {
    params.append('batchSize', batchSize.toString())
  }
  if (params.toString()) {
    endpoint += `?${params.toString()}`
  }

  console.log('🚀 Starting agent pipeline analysis...')
  console.log(`   API: ${endpoint}`)
  console.log(`   Force: ${force ? 'Yes (regenerate all)' : 'No (only missing/incomplete)'}`)
  if (limit) console.log(`   Limit: ${limit} tracks`)
  if (batchSize) console.log(`   Batch Size: ${batchSize}`)
  console.log()

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error || errorData.message}`)
    }

    const result = await response.json()
    console.log('✅ Agent pipeline started successfully!\n')
    console.log('📊 Statistics:')
    console.log(`   Total tracks to analyze: ${result.total}`)
    console.log(`   Batch size: ${result.batchSize}`)
    console.log(`   Status: ${result.status}`)
    console.log(`   Method: ${result.method}`)
    console.log()
    console.log('⏳ Analysis is running in the background...')
    console.log('   This may take a while depending on the number of tracks.')
    console.log()
    console.log('💡 Monitor progress:')
    console.log(`   curl "${API_URL}/api/audio/regenerate-all-sonic-dna-agents"`)
    console.log()
    console.log('🤖 Agent Team:')
    console.log('   ✓ Technical Analyzer (BPM, key, time signature)')
    console.log('   ✓ Harmony Analyst (scale, tonality)')
    console.log('   ✓ Intention Analyst (purpose & message)')
    console.log('   ✓ Description Writer (comprehensive description)')
    console.log('   ✓ Drum Pattern Expert (genre styles, recognition)')
    console.log('   ✓ Genre Specialist (characteristics, influences)')
    console.log('   ✓ Musicologist (era, style, production)')
    console.log('   ✓ Cultural Analyst (regional, cultural context)')
    console.log('   ✓ Emotional Psychologist (emotional intelligence)')
    console.log()
    console.log('⚡ Benefits:')
    console.log('   • Parallel processing (3 agents at once)')
    console.log('   • Specialized expertise per domain')
    console.log('   • Intelligent caching')
    console.log('   • Faster overall processing')
    console.log()

  } catch (error) {
    console.error(`\n❌ Failed to start analysis: ${error.message}`)
    process.exit(1)
  }
}

async function main() {
  if (trackId) {
    await analyzeSingleTrack(trackId)
  } else {
    await analyzeAllTracks()
  }
}

main()

