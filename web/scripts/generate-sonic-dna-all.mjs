#!/usr/bin/env node

/**
 * Generate Sonic DNA for all tracks in the database
 * Processes all tracks that don't have Sonic DNA yet
 * 
 * Run with: node scripts/generate-sonic-dna-all.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { join } from 'path'

// Load environment variables
dotenv.config({ path: join(process.cwd(), '.env.local') })

// ============================================================================
// SUPABASE SETUP
// ============================================================================

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ============================================================================
// MUSICBRAINZ INTEGRATION
// ============================================================================

const USER_AGENT = 'SERGIK-Website/1.0 (https://sergikdropz.com)'

async function searchMusicBrainzArtist(artistName) {
  try {
    const response = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=artist:"${encodeURIComponent(artistName)}"&fmt=json&limit=1`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    if (data.artists && data.artists.length > 0) {
      return data.artists[0]
    }
    
    return null
  } catch (error) {
    return null
  }
}

async function getMusicBrainzArtistDetails(mbid) {
  try {
    const response = await fetch(
      `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=genres+tags+area-rels+artist-rels`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) {
      return null
    }
    
    return await response.json()
  } catch (error) {
    return null
  }
}

async function getMusicBrainzData(artistName, supabase) {
  try {
    // Check if we already have MusicBrainz data for this artist
    const { data: existing } = await supabase
      .from('audio_files')
      .select('musicbrainz_id, musicbrainz_data')
      .eq('artist', artistName)
      .not('musicbrainz_data', 'is', null)
      .limit(1)
      .maybeSingle()

    if (existing?.musicbrainz_data) {
      return {
        id: existing.musicbrainz_id,
        data: existing.musicbrainz_data
      }
    }

    // Search for artist in MusicBrainz
    const artist = await searchMusicBrainzArtist(artistName)
    if (!artist) {
      return null
    }

    // Get detailed artist information
    const details = await getMusicBrainzArtistDetails(artist.id)
    if (!details) {
      return {
        id: artist.id,
        data: artist
      }
    }

    return {
      id: details.id,
      data: details
    }
  } catch (error) {
    return null
  }
}

// ============================================================================
// DRUM GENRE STYLE CLASSIFICATION
// ============================================================================

function analyzeDrumGenreStyles(frequencyBands, bpm) {
  if (!frequencyBands) {
    return {
      primary: [],
      secondary: [],
      characteristics: [],
      confidence: 0
    }
  }

  const kicks = frequencyBands.kicks || 0
  const snares = frequencyBands.snares || 0
  const hihats = frequencyBands.hihats || 0
  const cymbals = frequencyBands.cymbals || 0

  const primary = []
  const secondary = []
  const characteristics = []
  let confidence = 0.5

  // Pattern-based classification
  if (kicks > 0.7 && hihats > 0.5) {
    primary.push('Four-on-the-Floor', 'House')
    if (bpm && bpm >= 120 && bpm <= 130) {
      primary.push('Disco')
      secondary.push('Classic House', 'Garage')
    }
    if (hihats > 0.6) {
      characteristics.push('Driving kick pattern', 'Open hi-hats', 'Steady rhythm')
      confidence = 0.8
    }
  }

  if (kicks > 0.6 && hihats > 0.4 && kicks <= 0.7) {
    primary.push('House')
    if (bpm && bpm >= 120 && bpm <= 128) {
      primary.push('Deep House', 'Classic House')
    }
    if (hihats > 0.5 && snares > 0.3) {
      characteristics.push('Shuffle hi-hats', 'Snare backbeat', 'Groovy rhythm')
      confidence = 0.75
    }
  }

  if (kicks > 0.8 && hihats < 0.3) {
    primary.push('Techno')
    if (bpm && bpm >= 128 && bpm <= 140) {
      primary.push('Detroit Techno', 'Minimal Techno')
    }
    if (kicks > 0.8) {
      characteristics.push('Heavy kick', 'Minimal hi-hats', 'Driving bass')
      confidence = 0.8
    }
  }

  if (snares > 0.6 && kicks > 0.4) {
    primary.push('Breakbeat')
    if (bpm && bpm >= 130 && bpm <= 150) {
      primary.push('Drum & Bass', 'Jungle')
      secondary.push('Breakbeat Hardcore')
    }
    if (snares > 0.6) {
      characteristics.push('Complex snare patterns', 'Syncopated kicks', 'Rolling breaks')
      confidence = 0.75
    }
  }

  // BPM-based classification
  if (bpm) {
    if (bpm >= 140 && bpm <= 180) {
      if (kicks > 0.6 && snares > 0.5) {
        primary.push('Drum & Bass', 'Jungle')
        secondary.push('Hardcore', 'Gabber')
        characteristics.push('Fast tempo', 'Complex breaks', 'High energy')
        confidence = 0.85
      }
    } else if (bpm >= 128 && bpm <= 140) {
      if (kicks > 0.7) {
        primary.push('Trance', 'Progressive House')
        secondary.push('Big Room', 'Festival House')
        characteristics.push('Uplifting tempo', 'Driving bass')
        confidence = 0.7
      }
    } else if (bpm >= 100 && bpm <= 120) {
      if (snares > 0.5 && kicks > 0.4) {
        primary.push('Hip Hop', 'Trap')
        secondary.push('Boom Bap', 'Lo-Fi')
        characteristics.push('Laid-back groove', 'Snare backbeat', 'Syncopated')
        confidence = 0.75
      }
    } else if (bpm >= 90 && bpm <= 110) {
      if (snares > 0.4 && hihats > 0.3) {
        primary.push('Trap', 'Hip Hop')
        secondary.push('Southern Hip Hop', 'Crunk')
        characteristics.push('Slow tempo', 'Heavy 808s', 'Triplet hi-hats')
        confidence = 0.7
      }
    } else if (bpm >= 60 && bpm <= 90) {
      if (snares > 0.3) {
        primary.push('Downtempo', 'Trip Hop')
        secondary.push('Ambient', 'Chillout')
        characteristics.push('Relaxed tempo', 'Atmospheric', 'Minimal drums')
        confidence = 0.65
      }
    }
  }

  // Frequency-based classification
  if (kicks > 0.7 && snares < 0.3 && hihats < 0.3) {
    primary.push('Minimal Techno', 'Industrial')
    characteristics.push('Kick-focused', 'Sparse arrangement')
    confidence = 0.7
  }

  if (snares > 0.7 && kicks > 0.5) {
    primary.push('Breakbeat', 'Jungle')
    secondary.push('Drum & Bass', 'Hardcore')
    characteristics.push('Snare-heavy', 'Complex breaks')
    confidence = 0.8
  }

  if (hihats > 0.7 && kicks > 0.5) {
    primary.push('House', 'Garage')
    secondary.push('UK Garage', '2-Step')
    characteristics.push('Hi-hat focused', 'Shuffle rhythm')
    confidence = 0.75
  }

  if (cymbals > 0.6) {
    secondary.push('Rock', 'Live Drums', 'Acoustic')
    characteristics.push('Cymbal-heavy', 'Natural sound')
    confidence = 0.6
  }

  // Pattern complexity
  const complexity = (kicks + snares + hihats + cymbals) / 4
  if (complexity > 0.7) {
    characteristics.push('Complex arrangement', 'Layered percussion')
    secondary.push('Progressive', 'Experimental')
  } else if (complexity < 0.3) {
    characteristics.push('Minimal arrangement', 'Sparse drums')
    secondary.push('Minimal', 'Ambient')
  }

  // Remove duplicates
  const uniquePrimary = Array.from(new Set(primary))
  const uniqueSecondary = Array.from(new Set(secondary))
  const uniqueCharacteristics = Array.from(new Set(characteristics))

  // If no primary styles found, add generic ones
  if (uniquePrimary.length === 0) {
    if (bpm && bpm > 120) {
      uniquePrimary.push('Electronic')
    } else {
      uniquePrimary.push('Acoustic', 'Organic')
    }
    confidence = 0.4
  }

  return {
    primary: uniquePrimary,
    secondary: uniqueSecondary,
    characteristics: uniqueCharacteristics,
    confidence: Math.min(confidence, 0.95)
  }
}

// ============================================================================
// SONIC DNA GENERATION
// ============================================================================

async function generateSonicDNA(track, audioFeatures, musicbrainzData) {
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!openaiKey && !anthropicKey) {
    throw new Error('No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY')
  }

  // Build comprehensive prompt for AI analysis
  const musicbrainzInfo = musicbrainzData ? `
MusicBrainz Metadata:
- Area: ${musicbrainzData.data?.area?.name || 'Unknown'}
- Genres: ${musicbrainzData.data?.genres?.map((g) => g.name).join(', ') || 'Unknown'}
- Tags: ${musicbrainzData.data?.tags?.slice(0, 10).map((t) => t.name).join(', ') || 'None'}
` : 'No MusicBrainz data available'

  const prompt = `You are SERGIK AI, an expert musicologist, ethnomusicologist, and psychoacoustic analyst. Analyze this track with surgical precision:

Track: "${track.title}" by ${track.artist}
Duration: ${audioFeatures.duration} seconds
BPM: ${audioFeatures.bpm || 'Unknown'}
Energy Level: ${audioFeatures.energyLevel || 'Unknown'}

${musicbrainzInfo}

Provide a comprehensive "Sonic DNA" analysis in JSON format with this EXACT structure:

{
  "emotional": {
    "primaryEmotions": ["emotion1", "emotion2", "emotion3"],
    "emotionalJourney": "Description of emotional arc",
    "psychologicalProfile": "Psychological impact description",
    "moodTransitions": []
  },
  "musical": {
    "keySignature": "C major or A minor",
    "timeSignature": "4/4",
    "harmonicComplexity": "Description of harmonic structure",
    "rhythmicPatterns": "Description of rhythmic characteristics",
    "instrumentation": ["instrument1", "instrument2"],
    "productionTechniques": ["technique1", "technique2"],
    "musicalInfluences": ["influence1", "influence2"]
  },
  "historical": {
    "eraInfluences": ["1980s House", "1990s Techno"],
    "historicalContext": "Historical significance description",
    "evolutionFrom": ["movement1", "movement2"],
    "innovationPoints": ["innovation1", "innovation2"]
  },
  "regional": {
    "primaryRegions": ["region1", "region2"],
    "culturalInfluences": ["culture1", "culture2"],
    "regionalCharacteristics": "Description of regional characteristics",
    "crossCulturalElements": ["element1", "element2"]
  },
  "genres": {
    "primaryGenres": ["genre1", "genre2"],
    "subgenres": ["subgenre1", "subgenre2"],
    "genreFusion": "Description of genre fusion",
    "genreEvolution": "Description of genre evolution"
  },
  "summary": "2-3 sentence synthesis of the track's unique sonic identity"
}

CRITICAL REQUIREMENTS:
- Use EXACT field names as shown above (lowercase: emotional, musical, historical, regional, genres)
- primaryEmotions MUST be an array with 3-5 actual emotion strings (not "Unknown")
- primaryGenres MUST be an array with 2-3 actual genre strings (not empty)
- All arrays must contain actual values, not be empty
- Return ONLY the JSON object, no markdown code blocks, no explanations
- Ensure all fields are populated with real analysis, not placeholders`

  // Use Anthropic if available, otherwise OpenAI
  if (anthropicKey) {
    return await generateWithAnthropic(prompt, anthropicKey)
  } else {
    return await generateWithOpenAI(prompt, openaiKey)
  }
}

async function generateWithAnthropic(prompt, apiKey) {
  // Try different models in order of preference with appropriate token limits
  const models = [
    { name: 'claude-3-5-sonnet-20241022', maxTokens: 8000 },
    { name: 'claude-3-opus-20240229', maxTokens: 4096 },
    { name: 'claude-3-sonnet-20240229', maxTokens: 4096 },
    { name: 'claude-3-haiku-20240307', maxTokens: 4096 }
  ]
  
  let lastError = null
  
  for (const modelConfig of models) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: modelConfig.name,
          max_tokens: modelConfig.maxTokens,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        lastError = new Error(`Anthropic API error (${modelConfig.name}): ${response.statusText} - ${errorText}`)
        // Try next model if this one fails
        continue
      }
      
      const data = await response.json()
      const content = data.content[0].text
      
      // Extract JSON from response (may include markdown code blocks or text before/after)
      let jsonText = content.trim()
      
      // Try to find JSON in code blocks first
      const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonBlockMatch) {
        jsonText = jsonBlockMatch[1].trim()
      } else {
        // Try to find JSON object directly - find the first { and last }
        const firstBrace = jsonText.indexOf('{')
        const lastBrace = jsonText.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.substring(firstBrace, lastBrace + 1)
        }
      }
      
      // If still no valid JSON, try to extract just the JSON part
      if (!jsonText.startsWith('{')) {
        const jsonStart = jsonText.indexOf('{')
        if (jsonStart !== -1) {
          jsonText = jsonText.substring(jsonStart)
        }
      }
      
      // Find the matching closing brace - handle incomplete JSON by finding the deepest complete structure
      let braceCount = 0
      let endPos = -1
      let maxDepth = 0
      let bestEndPos = -1
      
      for (let i = 0; i < jsonText.length; i++) {
        if (jsonText[i] === '{') {
          braceCount++
          if (braceCount > maxDepth) {
            maxDepth = braceCount
          }
        }
        if (jsonText[i] === '}') {
          braceCount--
          if (braceCount === 0) {
            endPos = i + 1
            break
          }
          // Track the deepest point where we had a complete structure
          if (braceCount === 1 && bestEndPos === -1) {
            bestEndPos = i + 1
          }
        }
      }
      
      if (endPos > 0) {
        jsonText = jsonText.substring(0, endPos)
      } else if (bestEndPos > 0) {
        // Use the best complete structure we found
        jsonText = jsonText.substring(0, bestEndPos) + '}'
      }
      
      // Clean up any incomplete strings at the end
      jsonText = jsonText.replace(/"[^"]*$/, '"') // Fix incomplete strings
      jsonText = jsonText.replace(/,\s*$/, '') // Remove trailing commas
      
      let analysis
      try {
        analysis = JSON.parse(jsonText)
      } catch (parseError) {
        // If parsing fails, try to fix common JSON issues and complete truncated structures
        let fixedJson = jsonText
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote unquoted keys
          .replace(/'/g, '"')       // Replace single quotes with double quotes
        
        // Try to complete truncated JSON by closing open structures
        let openBraces = (fixedJson.match(/{/g) || []).length
        let closeBraces = (fixedJson.match(/}/g) || []).length
        let openBrackets = (fixedJson.match(/\[/g) || []).length
        let closeBrackets = (fixedJson.match(/\]/g) || []).length
        
        // Close incomplete arrays
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          fixedJson += ']'
        }
        
        // Close incomplete objects
        for (let i = 0; i < openBraces - closeBraces; i++) {
          fixedJson += '}'
        }
        
        // Fix incomplete string values
        fixedJson = fixedJson.replace(/:\s*"([^"]*)$/, ': "$1"')
        fixedJson = fixedJson.replace(/:\s*"([^"]*)"\s*$/, ': "$1"')
        
        try {
          analysis = JSON.parse(fixedJson)
        } catch (e) {
          // If still failing, try to extract just the parts we can parse
          // Extract emotional data if available
          const emotionalMatch = fixedJson.match(/"emotional"\s*:\s*\{[^}]*"primaryEmotions"\s*:\s*\[([^\]]+)\]/)
          const genresMatch = fixedJson.match(/"genres"\s*:\s*\{[^}]*"primaryGenres"\s*:\s*\[([^\]]+)\]/)
          const summaryMatch = fixedJson.match(/"summary"\s*:\s*"([^"]+)"/)
          
          // If we can extract at least summary, create a partial structure
          if (summaryMatch) {
            analysis = {
              summary: summaryMatch[1],
              emotional: emotionalMatch ? {
                primaryEmotions: JSON.parse(`[${emotionalMatch[1]}]`)
              } : undefined,
              genres: genresMatch ? {
                primaryGenres: JSON.parse(`[${genresMatch[1]}]`)
              } : undefined
            }
          } else {
            // Log the actual content for debugging
            console.error(`\n   ⚠️  JSON parsing failed for model ${modelConfig.name}`)
            console.error(`   Content preview: ${content.substring(0, 500)}`)
            throw new Error(`JSON parsing failed: ${parseError.message}. Tried to fix but still failed.`)
          }
        }
      }
      
      // Validate that we got a valid structure (but allow empty arrays/strings as they're valid AI responses)
      if (!analysis || typeof analysis !== 'object') {
        throw new Error('AI returned invalid data structure')
      }
      
      // Normalize field names - AI might use different casing or section names
      if (analysis['Emotional Intelligence'] && !analysis.emotional) {
        analysis.emotional = analysis['Emotional Intelligence']
      }
      if (analysis['Musical Intelligence'] && !analysis.musical) {
        analysis.musical = analysis['Musical Intelligence']
      }
      if (analysis['Historical Context'] && !analysis.historical) {
        analysis.historical = analysis['Historical Context']
      }
      if (analysis['Regional & Cultural Intelligence'] && !analysis.regional) {
        analysis.regional = analysis['Regional & Cultural Intelligence']
      }
      if (analysis['Genre Analysis'] && !analysis.genres) {
        analysis.genres = analysis['Genre Analysis']
      }
      
      return validateAndCompleteAnalysis(analysis)
    } catch (error) {
      lastError = error
      // If it's a rate limit or token limit error, wait a bit before trying next model
      if (error.message.includes('rate_limit') || error.message.includes('max_tokens')) {
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
      // Continue to next model
      continue
    }
  }
  
  // If all models failed, throw the last error
  throw lastError || new Error('All Anthropic models failed')
}

async function generateWithOpenAI(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are SERGIK AI, an expert musicologist specializing in electronic music, cultural analysis, and psychoacoustics. Provide detailed, accurate, and insightful musical analysis. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.statusText} - ${error}`)
  }
  
  const data = await response.json()
  const analysis = JSON.parse(data.choices[0].message.content)
  return validateAndCompleteAnalysis(analysis)
}

function validateAndCompleteAnalysis(analysis) {
  // Only use defaults if field is truly missing/undefined, preserve actual AI responses (even if empty)
  return {
    emotional: {
      primaryEmotions: Array.isArray(analysis.emotional?.primaryEmotions) 
        ? analysis.emotional.primaryEmotions 
        : (analysis.emotional?.primaryEmotions ? [analysis.emotional.primaryEmotions] : ['Unknown']),
      emotionalJourney: analysis.emotional?.emotionalJourney !== undefined 
        ? analysis.emotional.emotionalJourney 
        : 'Analysis pending',
      psychologicalProfile: analysis.emotional?.psychologicalProfile !== undefined 
        ? analysis.emotional.psychologicalProfile 
        : 'Analysis pending',
      moodTransitions: Array.isArray(analysis.emotional?.moodTransitions) 
        ? analysis.emotional.moodTransitions 
        : []
    },
    musical: {
      keySignature: analysis.musical?.keySignature !== undefined 
        ? analysis.musical.keySignature 
        : 'Unknown',
      timeSignature: analysis.musical?.timeSignature !== undefined 
        ? analysis.musical.timeSignature 
        : '4/4',
      harmonicComplexity: analysis.musical?.harmonicComplexity !== undefined 
        ? analysis.musical.harmonicComplexity 
        : 'Analysis pending',
      rhythmicPatterns: analysis.musical?.rhythmicPatterns !== undefined 
        ? analysis.musical.rhythmicPatterns 
        : 'Analysis pending',
      instrumentation: Array.isArray(analysis.musical?.instrumentation) 
        ? analysis.musical.instrumentation 
        : [],
      productionTechniques: Array.isArray(analysis.musical?.productionTechniques) 
        ? analysis.musical.productionTechniques 
        : [],
      musicalInfluences: Array.isArray(analysis.musical?.musicalInfluences) 
        ? analysis.musical.musicalInfluences 
        : []
    },
    historical: {
      eraInfluences: Array.isArray(analysis.historical?.eraInfluences) 
        ? analysis.historical.eraInfluences 
        : [],
      historicalContext: analysis.historical?.historicalContext !== undefined 
        ? analysis.historical.historicalContext 
        : 'Analysis pending',
      evolutionFrom: Array.isArray(analysis.historical?.evolutionFrom) 
        ? analysis.historical.evolutionFrom 
        : [],
      innovationPoints: Array.isArray(analysis.historical?.innovationPoints) 
        ? analysis.historical.innovationPoints 
        : []
    },
    regional: {
      primaryRegions: Array.isArray(analysis.regional?.primaryRegions) 
        ? analysis.regional.primaryRegions 
        : [],
      culturalInfluences: Array.isArray(analysis.regional?.culturalInfluences) 
        ? analysis.regional.culturalInfluences 
        : [],
      regionalCharacteristics: analysis.regional?.regionalCharacteristics !== undefined 
        ? analysis.regional.regionalCharacteristics 
        : 'Analysis pending',
      crossCulturalElements: Array.isArray(analysis.regional?.crossCulturalElements) 
        ? analysis.regional.crossCulturalElements 
        : []
    },
    genres: {
      primaryGenres: Array.isArray(analysis.genres?.primaryGenres) 
        ? analysis.genres.primaryGenres 
        : [],
      subgenres: Array.isArray(analysis.genres?.subgenres) 
        ? analysis.genres.subgenres 
        : [],
      genreFusion: analysis.genres?.genreFusion !== undefined 
        ? analysis.genres.genreFusion 
        : 'Analysis pending',
      genreEvolution: analysis.genres?.genreEvolution !== undefined 
        ? analysis.genres.genreEvolution 
        : 'Analysis pending'
    },
    technical: analysis.technical || {
      bpm: 0,
      energyLevel: 0,
      danceability: 0,
      frequencyBands: {}
    },
    summary: analysis.summary !== undefined 
      ? analysis.summary 
      : 'Analysis pending'
  }
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processTrack(track, supabase, stats, index, total) {
  const forceReanalyze = process.argv.includes('--force') || process.argv.includes('-f')
  
  try {
    // Skip if already completed (unless forcing)
    if (!forceReanalyze && track.sonic_dna_status === 'completed' && track.sonic_dna) {
      stats.skipped++
      process.stdout.write(`\r   ⏭️  [${index + 1}/${total}] ${track.title} - Already has Sonic DNA`)
      return
    }

    process.stdout.write(`\r   🔍 [${index + 1}/${total}] ${track.title} - Generating Sonic DNA...`)

    // Mark as processing
    await supabase
      .from('audio_files')
      .update({ sonic_dna_status: 'processing' })
      .eq('id', track.id)

    // Get MusicBrainz data
    const musicbrainzData = await getMusicBrainzData(track.artist, supabase)

    // Prepare audio features
    const audioFeatures = {
      bpm: track.bpm,
      energyLevel: track.energy_level,
      frequencyBands: track.frequency_bands,
      duration: track.duration_seconds || 0
    }

    // Analyze drum patterns and classify genre styles
    const drumGenreStyles = analyzeDrumGenreStyles(
      track.frequency_bands,
      track.bpm
    )

    // Generate Sonic DNA
    const sonicDNA = await generateSonicDNA(
      track,
      audioFeatures,
      musicbrainzData
    )

    // Enhance Sonic DNA with drum genre styles
    if (sonicDNA.technical) {
      sonicDNA.technical.drumGenreStyles = drumGenreStyles
    } else {
      sonicDNA.technical = { drumGenreStyles }
    }

    // Update database
    const updateData = {
      sonic_dna: sonicDNA,
      sonic_dna_status: 'completed',
      sonic_dna_analyzed_at: new Date().toISOString(),
      ai_analysis: sonicDNA,
      sonic_dna_error: null
    }

    if (musicbrainzData) {
      updateData.musicbrainz_id = musicbrainzData.id
      updateData.musicbrainz_data = musicbrainzData.data
    }

    await supabase
      .from('audio_files')
      .update(updateData)
      .eq('id', track.id)

    stats.completed++
    process.stdout.write(`\r   ✅ [${index + 1}/${total}] ${track.title} - Sonic DNA generated\n`)

  } catch (error) {
    stats.errors++
    process.stdout.write(`\r   ❌ [${index + 1}/${total}] ${track.title} - Error: ${error.message}\n`)
    
    // Mark as failed
    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'failed',
        sonic_dna_error: error.message
      })
      .eq('id', track.id)
  }
}

async function processBatch(tracks, batch, supabase, stats, batchSize = 3) {
  const batchTracks = tracks.slice(batch * batchSize, (batch + 1) * batchSize)
  
  // Process tracks sequentially to avoid rate limits
  for (let i = 0; i < batchTracks.length; i++) {
    const track = batchTracks[i]
    const globalIndex = batch * batchSize + i
    await processTrack(track, supabase, stats, globalIndex, tracks.length)
    
    // Small delay between tracks to avoid rate limits
    if (i < batchTracks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧬 Sonic DNA Generation for All Tracks\n')
  console.log('='.repeat(60))

  // Initialize Supabase
  let supabase
  try {
    supabase = createSupabaseClient()
    console.log('✅ Connected to Supabase\n')
  } catch (error) {
    console.error(`❌ Supabase connection failed: ${error.message}`)
    process.exit(1)
  }

  // Check for AI keys
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!openaiKey && !anthropicKey) {
    console.error('❌ No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY')
    process.exit(1)
  }

  console.log(`✅ AI API configured: ${openaiKey ? 'OpenAI' : 'Anthropic'}\n`)

  // Fetch all tracks that need Sonic DNA
  console.log('📥 Fetching tracks from database...')
  const { data: tracks, error } = await supabase
    .from('audio_files')
    .select('*')
    .eq('analysis_status', 'completed')
    .order('title', { ascending: true })

  if (error) {
    console.error(`❌ Error fetching tracks: ${error.message}`)
    process.exit(1)
  }

  if (!tracks || tracks.length === 0) {
    console.log('⚠️  No tracks found. Exiting.')
    process.exit(0)
  }

  console.log(`✅ Found ${tracks.length} tracks\n`)

  // Statistics
  const stats = {
    total: tracks.length,
    completed: 0,
    skipped: 0,
    errors: 0
  }

  // Process tracks in batches
  const batchSize = 3 // Process 3 at a time to avoid rate limits
  const totalBatches = Math.ceil(tracks.length / batchSize)
  console.log(`📦 Processing ${tracks.length} tracks in ${totalBatches} batches (${batchSize} tracks per batch)\n`)
  console.log('💡 Generating comprehensive Sonic DNA analysis for each track...\n')

  for (let batch = 0; batch < totalBatches; batch++) {
    console.log(`\n📦 Batch ${batch + 1}/${totalBatches}`)
    await processBatch(tracks, batch, supabase, stats, batchSize)
    
    // Delay between batches to avoid overwhelming the API
    if (batch < totalBatches - 1) {
      console.log('   ⏸️  Pausing 5 seconds between batches...\n')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Sonic DNA Generation Complete!\n')
  console.log(`   Total tracks: ${stats.total}`)
  console.log(`   ✅ Generated: ${stats.completed}`)
  console.log(`   ⏭️  Skipped: ${stats.skipped}`)
  console.log(`   ❌ Errors: ${stats.errors}`)
  console.log('\n🧬 All Sonic DNA data stored in Supabase database!')
  console.log('🚀 Complete musical intelligence ready for instant access!')
  console.log('='.repeat(60) + '\n')
}

// Run
main().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})

