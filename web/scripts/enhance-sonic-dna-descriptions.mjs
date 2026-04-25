#!/usr/bin/env node
/**
 * Enhance Sonic DNA with AI-generated descriptions and intentions
 * 
 * This script adds:
 * - description: A rich description of the track's sonic qualities
 * - intention: The emotional/creative intention behind the music
 * - Enhanced emotional analysis
 * 
 * Usage: node scripts/enhance-sonic-dna-descriptions.mjs
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

async function generateDescriptionAndIntention(track, existingDna) {
  const genres = existingDna?.genres?.primaryGenres || existingDna?.comprehensive?.genres?.primaryGenres || []
  const bpm = existingDna?.technical?.bpm || existingDna?.comprehensive?.technical?.bpm
  const key = existingDna?.technical?.key?.key || existingDna?.harmony?.keySignature || 'Unknown'
  const fusion = existingDna?.genres?.fusion || existingDna?.comprehensive?.genres?.fusion || ''
  const drums = existingDna?.drums || existingDna?.comprehensive?.drums || {}
  const cultural = existingDna?.cultural || existingDna?.comprehensive?.cultural || {}
  
  const prompt = `You are a music analyst for SERGIK, a music artist and DJ who creates electronic music. Analyze this track and provide a description and intention.

Track: "${track.title}" by ${track.artist || 'SERGIK'}
BPM: ${bpm || 'Unknown'}
Key: ${key}
Genres: ${genres.join(', ') || 'Electronic'}
Genre Fusion: ${fusion || 'N/A'}
Drum Pattern: ${drums.patternType || drums.pattern?.patternType || 'Electronic'}
Cultural Influences: ${cultural.culturalInfluences?.join(', ') || 'N/A'}

Please provide:
1. A rich, evocative description (2-3 sentences) of the track's sonic qualities, production style, and vibe
2. The emotional/creative intention (1-2 sentences) behind the music - what feeling or experience it aims to create
3. A list of 3-5 primary emotions this track evokes
4. An emotional journey description (1 sentence)

Respond in JSON format:
{
  "description": "...",
  "intention": "...",
  "primaryEmotions": ["emotion1", "emotion2", ...],
  "emotionalJourney": "..."
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
    
    const content = response.content[0].text.trim()
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return null
  } catch (error) {
    console.error(`Error generating for ${track.title}:`, error.message)
    return null
  }
}

async function main() {
  console.log('\n🎵 SONIC DNA DESCRIPTION ENHANCEMENT')
  console.log('═'.repeat(60))
  
  // Get all tracks with completed Sonic DNA that are missing description
  const { data: tracks, error } = await supabase
    .from('audio_files')
    .select('id, title, artist, sonic_dna')
    .eq('sonic_dna_status', 'completed')
    .order('title')
  
  if (error) {
    console.error('Error fetching tracks:', error)
    return
  }
  
  console.log(`Found ${tracks.length} tracks with Sonic DNA`)
  
  // Filter tracks that need enhancement
  const needsEnhancement = tracks.filter(t => {
    const dna = t.sonic_dna
    if (!dna) return false
    // Check if already has description
    if (dna.description && dna.description.length > 20) return false
    if (dna.comprehensive?.description && dna.comprehensive.description.length > 20) return false
    return true
  })
  
  console.log(`${needsEnhancement.length} tracks need description enhancement`)
  
  if (needsEnhancement.length === 0) {
    console.log('✅ All tracks already have descriptions!')
    return
  }
  
  // Process in batches to respect rate limits
  const batchSize = 5
  let enhanced = 0
  let failed = 0
  
  for (let i = 0; i < needsEnhancement.length; i += batchSize) {
    const batch = needsEnhancement.slice(i, i + batchSize)
    console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(needsEnhancement.length/batchSize)}...`)
    
    for (const track of batch) {
      process.stdout.write(`  ${track.title}... `)
      
      const aiResult = await generateDescriptionAndIntention(track, track.sonic_dna)
      
      if (aiResult) {
        // Merge with existing sonic_dna
        const updatedDna = {
          ...track.sonic_dna,
          description: aiResult.description,
          intention: aiResult.intention,
          emotional: {
            ...(track.sonic_dna?.emotional || {}),
            primaryEmotions: aiResult.primaryEmotions || [],
            emotionalJourney: aiResult.emotionalJourney || '',
          }
        }
        
        // Update database
        const { error: updateError } = await supabase
          .from('audio_files')
          .update({ sonic_dna: updatedDna })
          .eq('id', track.id)
        
        if (updateError) {
          console.log('❌ DB error')
          failed++
        } else {
          console.log('✅')
          enhanced++
        }
      } else {
        console.log('❌ AI error')
        failed++
      }
      
      // Small delay between tracks
      await new Promise(r => setTimeout(r, 500))
    }
    
    // Larger delay between batches
    if (i + batchSize < needsEnhancement.length) {
      console.log('  Waiting before next batch...')
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  
  console.log('\n' + '═'.repeat(60))
  console.log(`✅ Enhanced: ${enhanced}`)
  console.log(`❌ Failed: ${failed}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
