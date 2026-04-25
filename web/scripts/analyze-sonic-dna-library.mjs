#!/usr/bin/env node

/**
 * Comprehensive Sonic DNA Library Analysis
 * 
 * Analyzes all tracks in the database to generate comprehensive Sonic DNA data.
 * This creates a complete dataset so no refetching is needed.
 * 
 * Usage:
 *   node scripts/analyze-sonic-dna-library.mjs [options]
 * 
 * Options:
 *   --force: Re-analyze tracks that already have Sonic DNA
 *   --limit: Limit number of tracks to analyze (default: all)
 *   --batch-size: Number of tracks to process in parallel (default: 3)
 *   --delay: Delay between batches in ms (default: 2000)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env.local')

try {
  const envFile = readFileSync(envPath, 'utf-8')
  const envVars = {}
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      envVars[key] = value
    }
  })
  Object.assign(process.env, envVars)
} catch (err) {
  console.warn('Could not load .env.local, using system environment variables')
}

config({ path: envPath })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials!')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Parse command line arguments
const args = process.argv.slice(2)
const forceReanalyze = args.includes('--force')
const limitArg = args.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='))
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 3
const delayArg = args.find(arg => arg.startsWith('--delay='))
const delay = delayArg ? parseInt(delayArg.split('=')[1]) : 2000

// Note: This script can either:
// 1. Use the API endpoint for batch analysis (recommended)
// 2. Trigger individual track analysis via API
const API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

/**
 * Trigger analysis for a single track via API
 */
async function triggerTrackAnalysis(track, apiBaseUrl) {
  try {
    const normalizedPath = track.file_path.replace(/^\//, '')
    const response = await fetch(`${apiBaseUrl}/api/audio/sonic-dna?path=${encodeURIComponent(normalizedPath)}`, {
      method: 'POST'
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.status === 'processing') {
      // Wait a bit and check if it completed
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Check status
      const statusResponse = await fetch(`${apiBaseUrl}/api/audio/sonic-dna?path=${encodeURIComponent(normalizedPath)}`)
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        if (statusData.status === 'completed') {
          return { success: true, track: track.title, cached: false }
        }
      }
      
      // If still processing, mark as started (will complete in background)
      return { success: true, track: track.title, processing: true }
    }
    
    return { success: true, track: track.title }
  } catch (error) {
    return { success: false, track: track.title, error: error.message }
  }
}

/**
 * Process tracks in batches
 */
async function processBatch(tracks, batchNumber, totalBatches, apiBaseUrl) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Batch ${batchNumber}/${totalBatches} (${tracks.length} tracks)`)
  console.log(`${'='.repeat(60)}`)
  
  const results = await Promise.allSettled(
    tracks.map(track => triggerTrackAnalysis(track, apiBaseUrl))
  )
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
  const failed = results.length - successful
  
  // Log individual results
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        console.log(`   ✅ ${tracks[index].title}`)
      } else {
        console.log(`   ❌ ${tracks[index].title}: ${result.value.error}`)
      }
    } else {
      console.log(`   ❌ ${tracks[index].title}: ${result.reason}`)
    }
  })
  
  return { successful, failed, total: tracks.length }
}

/**
 * Main analysis function - uses API endpoint for batch processing
 */
async function analyzeLibrary() {
  console.log('🚀 Starting Comprehensive Sonic DNA Library Analysis')
  console.log(`   Force reanalyze: ${forceReanalyze}`)
  console.log(`   Batch size: ${batchSize}`)
  if (limit) console.log(`   Limit: ${limit} tracks`)
  
  // Option 1: Use batch API endpoint (recommended - faster, server-side processing)
  console.log('\n📡 Using batch API endpoint for analysis...')
  
  const params = new URLSearchParams({
    force: forceReanalyze.toString(),
    batchSize: batchSize.toString()
  })
  if (limit) params.append('limit', limit.toString())
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/audio/analyze-all-sonic-dna?${params}`, {
      method: 'POST'
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`)
    }
    
    const data = await response.json()
    console.log(`\n✅ Analysis started!`)
    console.log(`   Total tracks: ${data.total}`)
    console.log(`   Batch size: ${data.batchSize}`)
    console.log(`\n📊 Analysis is running in the background.`)
    console.log(`   Check progress: GET ${API_BASE_URL}/api/audio/analyze-all-sonic-dna`)
    
    // Monitor progress
    console.log('\n📈 Monitoring progress...')
    let lastCompleted = 0
    
    const progressInterval = setInterval(async () => {
      try {
        const progressResponse = await fetch(`${API_BASE_URL}/api/audio/analyze-all-sonic-dna`)
        if (progressResponse.ok) {
          const progress = await progressResponse.json()
          const newCompleted = progress.completed
          
          if (newCompleted > lastCompleted) {
            console.log(`   Progress: ${progress.completed}/${progress.total} (${progress.progress}%) - Completed: ${progress.completed}, Processing: ${progress.processing}, Failed: ${progress.failed}, Pending: ${progress.pending}`)
            lastCompleted = newCompleted
          }
          
          // Stop monitoring when all are done
          if (progress.completed + progress.failed >= progress.total) {
            clearInterval(progressInterval)
            console.log(`\n🎉 Analysis complete!`)
            console.log(`   ✅ Completed: ${progress.completed}`)
            console.log(`   ❌ Failed: ${progress.failed}`)
            console.log(`   📊 Success rate: ${((progress.completed / progress.total) * 100).toFixed(1)}%`)
          }
        }
      } catch (err) {
        console.error('   Error checking progress:', err.message)
      }
    }, 5000) // Check every 5 seconds
    
    // Stop monitoring after 1 hour max
    setTimeout(() => {
      clearInterval(progressInterval)
      console.log('\n⏱️  Progress monitoring stopped (1 hour timeout)')
    }, 3600000)
    
  } catch (error) {
    console.error('❌ Failed to start batch analysis:', error.message)
    console.log('\n🔄 Falling back to individual track analysis...')
    
    // Fallback: Process tracks individually
    await analyzeLibraryIndividual()
  }
}

/**
 * Fallback: Analyze tracks individually (slower but more reliable)
 */
async function analyzeLibraryIndividual() {
  // Get all tracks
  let query = supabase
    .from('audio_files')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
  
  // Filter out tracks that already have Sonic DNA (unless force)
  if (!forceReanalyze) {
    query = query.or('sonic_dna_status.is.null,sonic_dna_status.neq.completed')
  }
  
  if (limit) {
    query = query.limit(limit)
  }
  
  const { data: tracks, error, count } = await query
  
  if (error) {
    console.error('❌ Failed to fetch tracks:', error)
    process.exit(1)
  }
  
  if (!tracks || tracks.length === 0) {
    console.log('✅ No tracks to analyze!')
    return
  }
  
  const totalTracks = count || tracks.length
  console.log(`\n📦 Found ${totalTracks} tracks to analyze`)
  
  // Calculate batches
  const batches = []
  for (let i = 0; i < tracks.length; i += batchSize) {
    batches.push(tracks.slice(i, i + batchSize))
  }
  
  console.log(`📊 Processing in ${batches.length} batches of ${batchSize} tracks each\n`)
  
  // Process batches
  let totalSuccessful = 0
  let totalFailed = 0
  const startTime = Date.now()
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const result = await processBatch(batch, i + 1, batches.length, API_BASE_URL)
    
    totalSuccessful += result.successful
    totalFailed += result.failed
    
    // Progress summary
    const processed = totalSuccessful + totalFailed
    const progress = ((processed / totalTracks) * 100).toFixed(1)
    console.log(`\n📈 Progress: ${processed}/${totalTracks} (${progress}%)`)
    console.log(`   ✅ Successful: ${totalSuccessful}`)
    console.log(`   ❌ Failed: ${totalFailed}`)
    
    // Delay between batches (except last one)
    if (i < batches.length - 1) {
      console.log(`\n⏳ Waiting ${delay}ms before next batch...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  // Final summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n${'='.repeat(60)}`)
  console.log('🎉 Analysis Complete!')
  console.log(`${'='.repeat(60)}`)
  console.log(`Total tracks: ${totalTracks}`)
  console.log(`✅ Successful: ${totalSuccessful}`)
  console.log(`❌ Failed: ${totalFailed}`)
  console.log(`⏱️  Duration: ${duration}s`)
  console.log(`📊 Success rate: ${((totalSuccessful / totalTracks) * 100).toFixed(1)}%`)
}

// Run analysis
analyzeLibrary()
  .then(() => {
    console.log('\n✅ All done!')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })

