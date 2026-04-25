#!/usr/bin/env node
/**
 * AI-Powered Track Date Detection
 * 
 * Uses SERGIK AI knowledge base to analyze tracks and determine
 * their creation dates based on title, style, and metadata context.
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (!supabaseUrl || !supabaseKey || !anthropicKey) {
  console.error('Missing credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const anthropic = new Anthropic({ apiKey: anthropicKey })

/**
 * Analyze tracks and determine creation dates
 */
async function analyzeTrackDates(tracks) {
  const trackList = tracks.map((t, i) => {
    const genres = t.metadata?.genres?.join(', ') || t.sonic_dna?.genres?.primaryGenres?.join(', ') || 'Electronic'
    const bpm = t.bpm || 'Unknown'
    const key = t.key_signature || 'Unknown'
    return `${i + 1}. "${t.title}" by ${t.artist || 'SERGIK'} | BPM: ${bpm} | Key: ${key} | Genres: ${genres}`
  }).join('\n')

  const prompt = `You are SERGIK's AI assistant with deep knowledge of SERGIK's music production history.

SERGIK is an electronic music producer who has been making music since around 2018-2019. Their style has evolved:
- 2018-2019: Early experiments, simpler productions, learning phase
- 2020-2021: More refined house/disco sounds, collaborations began
- 2022-2023: Mature sound, complex productions, more experimental
- 2024-2025: Peak creativity, diverse styles, EP releases
- 2026: Current year, latest releases

Based on track titles, collaborators, and style indicators, estimate when each track was CREATED (not released):

TRACKS TO ANALYZE:
${trackList}

Consider these patterns:
- "v1", "v2", "VIP" versions indicate later iterations
- Collaborations with specific artists may indicate certain time periods
- More experimental titles often indicate recent work
- Simple/raw titles often indicate earlier work
- EP tracks are typically from 2023-2025

Return ONLY a JSON array:
[
  {"index": 1, "year": 2023, "month": 6, "confidence": 0.7, "reasoning": "Style and title suggest mid-2023"},
  ...
]

Use years from 2018-2026. Be realistic - most tracks are likely from 2022-2025.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return null
  } catch (error) {
    console.error('AI analysis error:', error.message)
    return null
  }
}

async function main() {
  console.log('📅 AI-Powered Track Date Detection')
  console.log('═'.repeat(60))
  console.log('')

  // Get all tracks without dates
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, artist, bpm, key_signature, sonic_dna, metadata, date, year')
    .or('date.is.null,year.is.null')
    .order('title')

  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }

  console.log(`Found ${tracks?.length || 0} tracks needing date detection\n`)

  if (!tracks || tracks.length === 0) {
    console.log('✅ All tracks already have dates!')
    return
  }

  const stats = { total: tracks.length, analyzed: 0, updated: 0, errors: 0 }

  // Process in batches of 15
  const BATCH_SIZE = 15
  const batches = []
  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    batches.push(tracks.slice(i, i + BATCH_SIZE))
  }

  console.log(`Processing ${batches.length} batches...\n`)

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    console.log(`Batch ${batchIndex + 1}/${batches.length} (${batch.length} tracks)...`)

    const aiResults = await analyzeTrackDates(batch)

    if (!aiResults) {
      console.error(`  ❌ AI analysis failed for batch ${batchIndex + 1}`)
      stats.errors += batch.length
      continue
    }

    // Update each track
    for (const result of aiResults) {
      const track = batch[result.index - 1]
      if (!track) continue

      stats.analyzed++

      // Create date string (YYYY-MM-DD format)
      const month = result.month || 6 // Default to June if no month
      const day = 15 // Default to middle of month
      const dateStr = `${result.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      // Update metadata with date info
      const updatedMetadata = {
        ...(track.metadata || {}),
        creation_year: result.year,
        creation_month: month,
        date_confidence: result.confidence,
        date_reasoning: result.reasoning,
        date_analyzed_at: new Date().toISOString()
      }

      // Apply update
      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update({
          date: dateStr,
          year: result.year,
          metadata: updatedMetadata
        })
        .eq('id', track.id)

      if (updateError) {
        console.error(`  ❌ Error updating "${track.title}":`, updateError.message)
        stats.errors++
      } else {
        stats.updated++
        process.stdout.write('.')
      }
    }

    // Delay between batches
    if (batchIndex < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log('\n')
  console.log('═'.repeat(60))
  console.log('📊 DATE DETECTION SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Total tracks processed: ${stats.total}`)
  console.log(`Successfully analyzed:  ${stats.analyzed}`)
  console.log(`Updated with dates:     ${stats.updated}`)
  console.log(`Errors:                 ${stats.errors}`)
  console.log('═'.repeat(60))
  console.log('\n✅ Date detection complete!')
}

main().catch(console.error)
