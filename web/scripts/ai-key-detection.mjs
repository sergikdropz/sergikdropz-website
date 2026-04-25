#!/usr/bin/env node
/**
 * AI-Powered Key Detection for All Tracks
 * 
 * Uses OpenAI/Anthropic to analyze track metadata and infer musical keys
 * based on title, artist, genre, BPM, and other contextual data.
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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

if (!anthropicKey) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const anthropic = new Anthropic({ apiKey: anthropicKey })

// Valid musical keys
const VALID_KEYS = [
  'C major', 'C minor', 'C# major', 'C# minor', 'Db major', 'Db minor',
  'D major', 'D minor', 'D# major', 'D# minor', 'Eb major', 'Eb minor',
  'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor',
  'Gb major', 'Gb minor', 'G major', 'G minor', 'G# major', 'G# minor',
  'Ab major', 'Ab minor', 'A major', 'A minor', 'A# major', 'A# minor',
  'Bb major', 'Bb minor', 'B major', 'B minor'
]

// Camelot wheel notation
const CAMELOT_MAP = {
  'Ab minor': '1A', 'B major': '1B',
  'Eb minor': '2A', 'Gb major': '2B', 'F# major': '2B',
  'Bb minor': '3A', 'Db major': '3B', 'C# major': '3B',
  'F minor': '4A', 'Ab major': '4B', 'G# major': '4B',
  'C minor': '5A', 'Eb major': '5B', 'D# major': '5B',
  'G minor': '6A', 'Bb major': '6B', 'A# major': '6B',
  'D minor': '7A', 'F major': '7B',
  'A minor': '8A', 'C major': '8B',
  'E minor': '9A', 'G major': '9B',
  'B minor': '10A', 'D major': '10B',
  'F# minor': '11A', 'Gb minor': '11A', 'A major': '11B',
  'C# minor': '12A', 'Db minor': '12A', 'E major': '12B'
}

/**
 * Analyze a batch of tracks using AI
 */
async function analyzeTracksWithAI(tracks) {
  const trackList = tracks.map((t, i) => {
    const genres = t.metadata?.genres?.join(', ') || t.sonic_dna?.genres?.primaryGenres?.join(', ') || 'Unknown'
    return `${i + 1}. "${t.title}" by ${t.artist || 'SERGIK'} | BPM: ${t.bpm || 'Unknown'} | Energy: ${t.energy_level || 'Unknown'} | Genres: ${genres}`
  }).join('\n')

  const prompt = `You are an expert music producer and DJ with deep knowledge of electronic music theory.

Analyze these tracks and determine the most likely musical key for each based on:
- Track title (emotional/tonal cues)
- Artist style
- BPM (faster BPMs often correlate with certain keys in electronic music)
- Genre (House often uses Am/Cm/Gm, Techno uses Am/Em/Dm, etc.)
- Energy level (higher energy often correlates with major keys)

TRACKS TO ANALYZE:
${trackList}

For each track, provide your best estimate of the musical key.

IMPORTANT RULES:
1. Use standard notation: "C major", "A minor", "F# minor", etc.
2. Consider genre conventions (e.g., deep house often uses A minor, F minor)
3. Consider BPM patterns (124-128 BPM house tracks often in Am, Gm, Fm)
4. If truly uncertain, make an educated guess based on genre - don't say "Unknown"
5. Electronic dance music has strong key preferences by genre

Return ONLY a JSON array with objects containing:
- index: track number (1-based)
- key: the musical key (e.g., "A minor", "G major")
- confidence: your confidence 0.0-1.0
- reasoning: brief explanation (20 words max)

Example:
[
  {"index": 1, "key": "A minor", "confidence": 0.7, "reasoning": "House track at 124 BPM, typical A minor territory"},
  {"index": 2, "key": "F minor", "confidence": 0.65, "reasoning": "Deep house vibes, F minor common for funky bass"}
]`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
    
    // Extract JSON from response
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

/**
 * Get Camelot notation for a key
 */
function getCamelot(key) {
  return CAMELOT_MAP[key] || null
}

async function main() {
  console.log('🎹 AI-Powered Key Detection')
  console.log('═'.repeat(60))
  console.log('')

  // Get all tracks with missing or unknown key signatures
  const { data: tracks, error } = await supabase
    .from('music_library_tracks')
    .select('id, title, artist, bpm, energy_level, danceability, key_signature, sonic_dna, metadata')
    .or('key_signature.is.null,key_signature.eq.Unknown')
    .order('title')

  if (error) {
    console.error('Error fetching tracks:', error.message)
    process.exit(1)
  }

  console.log(`Found ${tracks?.length || 0} tracks needing key detection\n`)

  if (!tracks || tracks.length === 0) {
    console.log('✅ All tracks already have key signatures!')
    return
  }

  const stats = {
    total: tracks.length,
    analyzed: 0,
    updated: 0,
    errors: 0
  }

  // Process in batches of 15
  const BATCH_SIZE = 15
  const batches = []
  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    batches.push(tracks.slice(i, i + BATCH_SIZE))
  }

  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} tracks...\n`)

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    console.log(`\nBatch ${batchIndex + 1}/${batches.length} (${batch.length} tracks)...`)

    const aiResults = await analyzeTracksWithAI(batch)

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

      // Validate key
      let key = result.key
      if (!VALID_KEYS.includes(key)) {
        // Try to normalize
        const normalizedKey = key.replace(/\s+/g, ' ').trim()
        if (VALID_KEYS.includes(normalizedKey)) {
          key = normalizedKey
        } else {
          console.log(`  ⚠️ Invalid key "${key}" for "${track.title}", skipping`)
          continue
        }
      }

      const camelot = getCamelot(key)

      // Update sonic_dna with key info
      const updatedSonicDna = {
        ...(track.sonic_dna || {}),
        harmony: {
          ...(track.sonic_dna?.harmony || {}),
          keySignature: key,
          camelot: camelot,
          keyConfidence: result.confidence,
          keyAnalysisMethod: 'ai-inference'
        },
        technical: {
          ...(track.sonic_dna?.technical || {}),
          keySignature: key,
          key: {
            key: key.split(' ')[0],
            mode: key.includes('minor') ? 'minor' : 'major',
            confidence: result.confidence
          }
        }
      }

      // Update metadata
      const updatedMetadata = {
        ...(track.metadata || {}),
        key_signature: key,
        camelot: camelot,
        key_confidence: result.confidence,
        key_reasoning: result.reasoning
      }

      // Apply update
      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update({
          key_signature: key,
          sonic_dna: updatedSonicDna,
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

    // Small delay between batches to avoid rate limits
    if (batchIndex < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log('\n')
  console.log('═'.repeat(60))
  console.log('📊 KEY DETECTION SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Total tracks processed: ${stats.total}`)
  console.log(`Successfully analyzed:  ${stats.analyzed}`)
  console.log(`Updated with key:       ${stats.updated}`)
  console.log(`Errors:                 ${stats.errors}`)
  console.log('═'.repeat(60))
  console.log('\n✅ Key detection complete!')
}

main().catch(console.error)
