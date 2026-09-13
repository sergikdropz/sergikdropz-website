/**
 * Sonic DNA Analysis - AI-powered deep musical analysis
 * Integrates MusicBrainz data with AI analysis for comprehensive track dissection
 */

import { extractGenres, extractRegionalInfo } from './musicbrainz'

interface SonicDNAAnalysis {
  // Track description and intention
  description?: string // Comprehensive track description
  intention?: string // What's the intention/purpose of this music?
  
  emotional: {
    primaryEmotions: string[]
    emotionalJourney: string
    psychologicalProfile: string
    moodTransitions: Array<{ time: number; emotion: string; intensity: number }>
  }
  musical: {
    keySignature: string
    timeSignature: string
    scale?: string // Musical scale
    harmonicComplexity: string
    rhythmicPatterns: string
    instrumentation: string[]
    productionTechniques: string[]
    musicalInfluences: string[]
  }
  historical: {
    eraInfluences: string[]
    historicalContext: string
    evolutionFrom: string[]
    innovationPoints: string[]
  }
  regional: {
    primaryRegions: string[]
    culturalInfluences: string[]
    regionalCharacteristics: string
    crossCulturalElements: string[]
  }
  genres: {
    primaryGenres: string[]
    subgenres: string[]
    genreFusion: string
    genreEvolution: string
    genreCharacteristics?: string[] // Specific genre characteristics
    genreInfluences?: string[] // Genre influences and references
  }
  technical: {
    bpm: number
    energyLevel: number
    danceability: number
    key?: { key: string; mode: string; scale: string; confidence: number } // Enhanced key info
    timeSignature?: string // Time signature
    technicalDescription?: string // Technical analysis description
    frequencyBands?: {
      kicks: number
      snares: number
      hihats: number
      cymbals: number
    }
  }
  // Enhanced drum pattern
  drums?: {
    patternType: string
    kickPattern: string
    snarePattern: string
    hihatPattern: string
    genreStyles?: string[] // Genre-specific drum styles
    patternRecognition?: string // Pattern recognition description
    complexity?: string
  }
  // Enhanced musicology
  musicology?: {
    description?: string // Musicological description
    era?: { decade: string; description?: string }
    style?: { primaryStyle: string; description?: string }
    production?: { techniques: string[]; description?: string }
  }
  // Enhanced cultural
  cultural?: {
    description?: string // Cultural description
    regions?: string[]
    culturalInfluences?: string[]
    regionalCharacteristics?: string
  }
  summary: string
}

/**
 * Generate comprehensive Sonic DNA analysis using AI
 * @param trackTitle - Title of the track
 * @param artistName - Name of the artist
 * @param audioFeatures - Technical audio features
 * @param musicbrainzData - MusicBrainz metadata
 * @param waveformData - Pre-computed waveform data
 * @returns Complete Sonic DNA analysis
 */
export async function generateSonicDNA(
  trackTitle: string,
  artistName: string,
  audioFeatures: {
    bpm?: number
    energyLevel?: number
    frequencyBands?: any
    duration: number
    danceability?: number
    key?: string
    comprehensiveAnalysis?: any // Comprehensive analysis context
  },
  musicbrainzData: any,
  waveformData?: number[]
): Promise<SonicDNAAnalysis> {
  // Build comprehensive prompt for AI analysis
  const musicbrainzInfo = musicbrainzData ? `
MusicBrainz Metadata:
- Artist: ${musicbrainzData.name || artistName}
- Area: ${musicbrainzData.area?.name || 'Unknown'}
- Country: ${musicbrainzData.area?.['iso-3166-1-codes']?.[0] || 'Unknown'}
- Begin Area: ${musicbrainzData['begin-area']?.name || 'N/A'}
- Type: ${musicbrainzData.type || 'Unknown'}
- Genres: ${musicbrainzData.genres?.map((g: any) => `${g.name} (${g.count})`).join(', ') || 'Unknown'}
- Tags: ${musicbrainzData.tags?.slice(0, 15).map((t: any) => `${t.name} (${t.count})`).join(', ') || 'None'}
- Aliases: ${musicbrainzData.aliases?.map((a: any) => a.name).join(', ') || 'None'}
- Relations: ${musicbrainzData.relations?.slice(0, 10).map((r: any) => `${r.type}: ${r.artist?.name || r['target-type']}`).join(', ') || 'None'}
- Disambiguation: ${musicbrainzData.disambiguation || 'N/A'}
` : 'No MusicBrainz data available'

  // Add comprehensive analysis context if available
  const comprehensiveContext = audioFeatures.comprehensiveAnalysis ? `
Comprehensive Analysis Context:
- Technical: BPM ${audioFeatures.comprehensiveAnalysis.technical?.bpm || 'Unknown'}, Key: ${audioFeatures.comprehensiveAnalysis.harmony?.keySignature || 'Unknown'}, Scale: ${audioFeatures.comprehensiveAnalysis.harmony?.scale || 'Unknown'}, Time Signature: ${audioFeatures.comprehensiveAnalysis.technical?.timeSignature || 'Unknown'}
- Drum Pattern: ${audioFeatures.comprehensiveAnalysis.drums?.pattern?.patternType || 'Unknown'}, Genre Styles: ${audioFeatures.comprehensiveAnalysis.drums?.genreStyles?.primary?.join(', ') || 'None'}
- Genres: ${audioFeatures.comprehensiveAnalysis.genres?.primary?.join(', ') || 'Unknown'}
- Musicology Era: ${audioFeatures.comprehensiveAnalysis.musicology?.era?.decade || 'Unknown'}
- Cultural Regions: ${audioFeatures.comprehensiveAnalysis.cultural?.regions?.join(', ') || 'Unknown'}
` : ''

  const bpm = audioFeatures.bpm || 'Unknown'
  const isHalfTime = bpm !== 'Unknown' && typeof bpm === 'number' && bpm < 100
  const timingContext = isHalfTime ? 'HALF-TIME (slower, laid-back feel)' : 'FULL-TIME (standard tempo feel)'
  
  const prompt = `You are SERGIK AI, an expert musicologist, ethnomusicologist, and psychoacoustic analyst. Analyze this track with precision and depth:

Track: "${trackTitle}" by ${artistName}
Duration: ${audioFeatures.duration} seconds
BPM: ${bpm}
Energy Level: ${audioFeatures.energyLevel || 'Unknown'}
Timing: ${timingContext}

${musicbrainzInfo}
${comprehensiveContext}

CRITICAL ANALYSIS RULES - READ CAREFULLY:

1. **TIMING DETECTION (HALF-TIME vs FULL-TIME)**:
   - HALF-TIME: BPM typically 60-100, slower feel, laid-back groove, emphasis on rhythm over speed
   - FULL-TIME: Standard tempo feel, can be any BPM but feels at normal speed
   - If BPM is below 100, analyze as HALF-TIME unless explicitly fast-paced
   - HALF-TIME tracks have MODERATE to LOW energy, not high energy
   - FULL-TIME tracks can have high or moderate energy

2. **GENRE DISTINCTION (HIP-HOP vs DRUM & BASS)**:
   - HIP-HOP: 
     * BPM typically 60-100 (half-time feel)
     * 808 drums, trap hi-hats, sparse arrangements
     * Emphasis on groove and rhythm, not speed
     * Energy: Moderate to low (unless aggressive trap/rap)
     * NOT high energy unless explicitly aggressive trap
   - DRUM & BASS:
     * BPM typically 160-180 (fast breakbeats)
     * Complex drum patterns, heavy basslines
     * High energy, fast-paced
     * If BPM is below 100, it's likely NOT drum & bass
   - CRITICAL: If BPM is 60-100 with hip-hop characteristics (808s, trap elements), it's HIP-HOP, NOT drum & bass
   - CRITICAL: Do NOT label hip-hop tracks as "high energy" unless they are explicitly aggressive trap/rap

3. **ENERGY LEVEL ACCURACY**:
   - Match energy level to timing: Half-time = moderate/low, Full-time = can be high
   - Hip-hop at 70-90 BPM should be described as moderate energy, not high energy
   - Only describe as "high energy" if the track is genuinely intense and fast-paced

Provide a comprehensive "Sonic DNA" analysis in JSON format. Use intelligent, context-appropriate descriptions:
- Be SWEET & POTENT: Write what's needed, no more, no less
- Simple facts: Be concise (1-2 sentences)
- Complex concepts: Elaborate naturally (50-150 words when context requires it)
- Don't force length - let the content determine the length
- Every word should add value - no filler
- Be DESCRIPTIVE and DETAILED - provide rich, specific analysis

Sections:

1. **Track Description**:
   - description: Comprehensive track description (50-150 words) - overall sound, production quality, unique characteristics, sonic identity. Be specific and insightful.

2. **Intention**:
   - intention: What is the intention/purpose of this music? (30-100 words) - What does the artist want to achieve? What's the message? What's the function? Be direct and meaningful.

3. **Emotional Intelligence**: 
   - primaryEmotions: Array of 3-5 primary emotions (be specific: "Euphoric", "Melancholic", "Aggressive", "Contemplative", etc.)
   - emotionalJourney: Deep description of emotional arc, how emotions evolve throughout the track, emotional peaks and valleys (80-150 words). Analyze the emotional narrative and how production choices support it.
   - psychologicalProfile: Detailed psychological impact, how the track affects the listener's mental state, cognitive responses, and psychological associations (80-150 words). Consider psychoacoustic effects and emotional resonance.
   - moodTransitions: Array of {time: number, emotion: string, intensity: number} (if applicable, map significant emotional shifts)

4. **Musical Intelligence**:
   - keySignature: Exact key (e.g., "C major", "A minor", "F# minor") - use comprehensive analysis data if available. MUST be accurate.
   - timeSignature: Time signature (e.g., "4/4", "3/4", "6/8", "7/8") - analyze from rhythm patterns
   - scale: Musical scale used (e.g., "Major", "Minor", "Dorian", "Mixolydian", "Phrygian", "Lydian") - be specific
   - harmonicComplexity: Deep description of harmonic structure, chord progressions, voice leading, tension/resolution (80-150 words). Analyze chord types, progressions, modulations, harmonic rhythm, and how harmony supports the track's emotional arc.
   - rhythmicPatterns: Detailed description of rhythmic characteristics, groove, syncopation, polyrhythms, metric modulation (80-150 words). Analyze how rhythm drives the track, time feel, and rhythmic interactions between elements.
   - instrumentation: Array of instruments/sounds with detailed descriptions (e.g., "Analog synthesizer with filter sweeps", "808 kick with heavy compression", "Reverb-drenched vocal samples")
   - productionTechniques: Array of production techniques with specific context (e.g., "Side-chain compression on bass", "Granular synthesis on pads", "Parallel saturation on drums")
   - musicalInfluences: Array of artists/movements with specific explanations of how they influence this track

5. **Technical Analysis**:
   - Include all technical details from comprehensive analysis
   - technicalDescription: Technical analysis covering production, mixing, sound design (50-120 words, only if meaningful)

6. **Drum Pattern Analysis**:
   - patternType: Pattern type (be specific: "Four-on-the-floor", "Breakbeat", "Half-time", "Polyrhythmic", etc.) - MUST accurately reflect timing (half-time vs full-time)
   - kickPattern: Detailed kick pattern description with timing and dynamics - describe if it's half-time (slower, laid-back) or full-time (standard tempo)
   - snarePattern: Detailed snare pattern description with placement and character
   - hihatPattern: Detailed hihat pattern description with variations and groove
   - genreStyles: Array of genre-specific drum styles identified with context (e.g., "Detroit techno kick pattern", "UK garage shuffle", "Hip-hop 808 pattern", "Trap hi-hat pattern") - ACCURATELY distinguish hip-hop from drum & bass
   - patternRecognition: Deep description of drum pattern recognition, genre characteristics, rhythmic signature, and how the pattern defines the track's identity (80-150 words). Analyze groove, swing, ghost notes, fills, and pattern evolution. SPECIFICALLY address timing (half-time vs full-time) and how it affects the track's feel and energy.
   - complexity: Complexity level with explanation

7. **Historical Context**:
   - eraInfluences: Array of musical eras with detailed context (e.g., "1990s UK rave culture - characterized by breakbeats and euphoric melodies")
   - historicalContext: Deep historical significance, how the track relates to music history, cultural movements, and technological developments (80-150 words). Analyze historical references and evolution.
   - evolutionFrom: Array of musical movements/styles with detailed explanations of how they influenced this track
   - innovationPoints: Array of unique innovations with detailed descriptions of what makes them innovative

8. **Regional & Cultural Intelligence**:
   - primaryRegions: Array of geographic/cultural regions with context
   - culturalInfluences: Array of cultural traditions/styles with detailed explanations
   - regionalCharacteristics: Deep description of regional characteristics, how geography and culture shape the sound, regional production techniques, and cultural identity (80-150 words). Analyze sonic geography and cultural markers.
   - crossCulturalElements: Array of cross-cultural fusion elements with explanations of how cultures blend
   - description: Comprehensive cultural analysis covering cultural identity, diaspora influences, and cultural exchange (80-150 words, only if meaningful)

9. **Genre Analysis**:
   - primaryGenres: Array of 2-3 primary genres with confidence levels - ACCURATELY distinguish HIP-HOP from DRUM & BASS based on BPM and characteristics
   - subgenres: Array of subgenres and micro-genres with context
   - genreFusion: Deep description of genre fusion, how genres blend, what makes the fusion unique, and how it creates new sonic territory (80-150 words, shorter if single genre). Address timing characteristics (half-time vs full-time) and how they relate to genre identity.
   - genreEvolution: Detailed analysis of how genres evolved in this track, genre mutations, and forward-looking elements (80-150 words, shorter if straightforward). Include timing analysis and energy characteristics.
   - genreCharacteristics: Array of specific genre characteristics with detailed explanations - be specific about timing, energy, and rhythmic patterns
   - genreInfluences: Array of genre influences and references with context on how they manifest - accurately identify hip-hop vs drum & bass influences

10. **Musicology Analysis**:
    - description: Comprehensive musicological analysis covering compositional structure, form, theoretical aspects, and musicological significance (80-150 words, only if meaningful)
    - era: {decade: string, description: string (50-100 words) - deep analysis of era characteristics, production techniques of the time, and how the track reflects or subverts era conventions}
    - style: {primaryStyle: string, description: string (50-100 words) - detailed analysis of stylistic elements, style conventions, and stylistic innovation}
    - production: {techniques: string[], description: string (50-100 words) - comprehensive analysis of production techniques, mixing approach, sound design, and production philosophy}

11. **Summary**: Synthesis of track's unique sonic identity (50-120 words)

Return ONLY valid JSON. Be musically accurate, culturally aware, and provide deep insights. Write what matters - sweet and potent, not verbose.`

  // Determine which AI API to use
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  
  // Try OpenAI first, then Anthropic, then fallback to basic analysis
  if (openaiKey) {
    try {
      return await generateWithOpenAI(prompt, openaiKey)
    } catch (error: any) {
      console.warn('OpenAI API failed, trying Anthropic:', error.message)
      if (anthropicKey) {
        try {
          return await generateWithAnthropic(prompt, anthropicKey)
        } catch (anthropicError: any) {
          console.warn('Anthropic API also failed, using fallback analysis:', anthropicError.message)
          return generateFallbackAnalysis(trackTitle, artistName, audioFeatures, musicbrainzData)
        }
      } else {
        console.warn('No Anthropic key, using fallback analysis')
        return generateFallbackAnalysis(trackTitle, artistName, audioFeatures, musicbrainzData)
      }
    }
  } else if (anthropicKey) {
    try {
      return await generateWithAnthropic(prompt, anthropicKey)
    } catch (error: any) {
      console.warn('Anthropic API failed, using fallback analysis:', error.message)
      return generateFallbackAnalysis(trackTitle, artistName, audioFeatures, musicbrainzData)
    }
  } else {
    console.warn('No AI API keys configured, using fallback analysis')
    return generateFallbackAnalysis(trackTitle, artistName, audioFeatures, musicbrainzData)
  }
}

async function generateWithOpenAI(prompt: string, apiKey: string): Promise<SonicDNAAnalysis> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview', // or 'gpt-4' for better analysis
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
  
  // Validate and ensure all required fields exist
  return validateAndCompleteAnalysis(analysis)
}

async function generateWithAnthropic(prompt: string, apiKey: string): Promise<SonicDNAAnalysis> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.statusText} - ${error}`)
  }
  
  const data = await response.json()
  const content = data.content[0].text
  
  // Extract JSON from response (may include markdown code blocks)
  let jsonText = content
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    jsonText = jsonMatch[1]
  }
  
  const analysis = JSON.parse(jsonText)
  return validateAndCompleteAnalysis(analysis)
}

function validateAndCompleteAnalysis(analysis: any): SonicDNAAnalysis {
  // Ensure all required fields exist with defaults
  return {
    description: analysis.description,
    intention: analysis.intention,
    emotional: {
      primaryEmotions: analysis.emotional?.primaryEmotions || ['Unknown'],
      emotionalJourney: analysis.emotional?.emotionalJourney || 'Analysis pending',
      psychologicalProfile: analysis.emotional?.psychologicalProfile || 'Analysis pending',
      moodTransitions: analysis.emotional?.moodTransitions || []
    },
    musical: {
      keySignature: analysis.musical?.keySignature || 'Unknown',
      timeSignature: analysis.musical?.timeSignature || '4/4',
      scale: analysis.musical?.scale,
      harmonicComplexity: analysis.musical?.harmonicComplexity || 'Analysis pending',
      rhythmicPatterns: analysis.musical?.rhythmicPatterns || 'Analysis pending',
      instrumentation: analysis.musical?.instrumentation || [],
      productionTechniques: analysis.musical?.productionTechniques || [],
      musicalInfluences: analysis.musical?.musicalInfluences || []
    },
    historical: {
      eraInfluences: analysis.historical?.eraInfluences || [],
      historicalContext: analysis.historical?.historicalContext || 'Analysis pending',
      evolutionFrom: analysis.historical?.evolutionFrom || [],
      innovationPoints: analysis.historical?.innovationPoints || []
    },
    regional: {
      primaryRegions: analysis.regional?.primaryRegions || [],
      culturalInfluences: analysis.regional?.culturalInfluences || [],
      regionalCharacteristics: analysis.regional?.regionalCharacteristics || 'Analysis pending',
      crossCulturalElements: analysis.regional?.crossCulturalElements || []
    },
    genres: {
      primaryGenres: analysis.genres?.primaryGenres || [],
      subgenres: analysis.genres?.subgenres || [],
      genreFusion: analysis.genres?.genreFusion || 'Analysis pending',
      genreEvolution: analysis.genres?.genreEvolution || 'Analysis pending',
      genreCharacteristics: analysis.genres?.genreCharacteristics,
      genreInfluences: analysis.genres?.genreInfluences
    },
    technical: {
      ...(analysis.technical || {}),
      bpm: analysis.technical?.bpm || 0,
      energyLevel: analysis.technical?.energyLevel || 0,
      danceability: analysis.technical?.danceability || 0,
      key: analysis.technical?.key,
      timeSignature: analysis.technical?.timeSignature,
      technicalDescription: analysis.technical?.technicalDescription,
      frequencyBands: analysis.technical?.frequencyBands || {}
    },
    drums: analysis.drums,
    musicology: analysis.musicology,
    cultural: analysis.cultural,
    summary: analysis.summary || 'Analysis pending'
  }
}

/**
 * Generate fallback analysis when AI APIs are unavailable
 * Uses comprehensive analysis data to create a basic Sonic DNA
 */
function generateFallbackAnalysis(
  trackTitle: string,
  artistName: string,
  audioFeatures: any,
  musicbrainzData: any
): SonicDNAAnalysis {
  const genres = extractGenres(musicbrainzData)
  const regional = extractRegionalInfo(musicbrainzData)
  
  // Infer emotions from BPM and genre
  const bpm = audioFeatures.bpm || 0
  let primaryEmotions: string[] = []
  if (bpm >= 120 && bpm <= 140) {
    primaryEmotions = ['Energetic', 'Uplifting', 'Danceable']
  } else if (bpm > 140) {
    primaryEmotions = ['Intense', 'Driving', 'Powerful']
  } else {
    primaryEmotions = ['Relaxed', 'Groovy', 'Smooth']
  }

  // Infer genre from BPM
  let inferredGenres: string[] = []
  if (bpm >= 120 && bpm <= 130) {
    inferredGenres = ['House', 'Disco']
  } else if (bpm >= 128 && bpm <= 135) {
    inferredGenres = ['Techno', 'Trance']
  } else if (bpm >= 140 && bpm <= 150) {
    inferredGenres = ['Drum and Bass', 'Dubstep']
  } else if (bpm >= 90 && bpm <= 110) {
    inferredGenres = ['Hip Hop', 'Trap']
  }

  const allGenres = Array.from(new Set([...genres, ...inferredGenres]))

  return {
    emotional: {
      primaryEmotions,
      emotionalJourney: `This ${bpm > 0 ? `${bpm} BPM` : ''} track creates a ${primaryEmotions[0].toLowerCase()} atmosphere with ${primaryEmotions.length > 1 ? primaryEmotions.slice(1).join(' and ') : 'dynamic'} elements throughout.`,
      psychologicalProfile: `The track's ${bpm > 120 ? 'high-energy' : 'moderate'} tempo and ${allGenres[0] || 'electronic'} characteristics suggest a ${bpm > 120 ? 'motivational and energizing' : 'contemplative and engaging'} psychological impact.`,
      moodTransitions: []
    },
    musical: {
      keySignature: audioFeatures.key || 'Unknown',
      timeSignature: '4/4',
      harmonicComplexity: 'Moderate',
      rhythmicPatterns: bpm > 0 ? `${bpm} BPM ${bpm >= 120 ? 'driving' : 'steady'} rhythm` : 'Rhythmic patterns detected',
      instrumentation: ['Electronic', 'Synthesizers', 'Drum Machine'],
      productionTechniques: ['Electronic Production', 'Sequencing', 'Synthesis'],
      musicalInfluences: musicbrainzData?.tags?.slice(0, 5).map((t: any) => t.name) || []
    },
    historical: {
      eraInfluences: [],
      historicalContext: `Contemporary electronic music production with ${allGenres[0] || 'electronic'} influences.`,
      evolutionFrom: [],
      innovationPoints: []
    },
    regional: {
      primaryRegions: regional.area ? [regional.area] : [],
      culturalInfluences: [],
      regionalCharacteristics: regional.area ? `Music from ${regional.area}` : 'Electronic music',
      crossCulturalElements: []
    },
    genres: {
      primaryGenres: allGenres.slice(0, 3),
      subgenres: allGenres.slice(3),
      genreFusion: allGenres.length > 1 ? `${allGenres.slice(0, 2).join(' and ')} fusion` : allGenres[0] || 'Electronic',
      genreEvolution: 'Contemporary electronic music'
    },
    technical: {
      bpm: bpm,
      energyLevel: audioFeatures.energyLevel || 0.5,
      danceability: bpm >= 120 && bpm <= 140 ? 0.9 : bpm > 140 ? 0.8 : 0.6,
      frequencyBands: audioFeatures.frequencyBands || {}
    },
    summary: `${trackTitle} by ${artistName} is a ${bpm > 0 ? `${bpm} BPM` : ''} ${allGenres[0] || 'electronic'} track${allGenres.length > 1 ? ` blending ${allGenres.slice(0, 2).join(' and ')}` : ''}${regional.area ? ` from ${regional.area}` : ''}.`
  }
}

