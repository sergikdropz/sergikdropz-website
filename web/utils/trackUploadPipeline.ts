/**
 * Comprehensive Track Upload Pipeline
 * 
 * Automatically handles end-to-end track processing:
 * 1. Upload audio file to storage
 * 2. Extract metadata (BPM, duration, etc.)
 * 3. Generate waveform data
 * 4. Run comprehensive Sonic DNA analysis
 * 5. Detect/infer key signature
 * 6. Create track in database with all fields populated
 * 7. Sync to music_library_tracks with full data
 */

import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from './generateSonicDNAWithAgents'
import { extractMetadataFromBuffer } from './extractMetadataFromBuffer'
import { generateWaveformFromBuffer } from './generateWaveformFromBuffer'
import { analyzeComprehensive } from './comprehensiveMusicAnalysis'
import { buildTrackMetadata } from './trackIndexUtils'

export interface TrackUploadInput {
  file: File | Buffer
  filename: string
  title?: string
  artist?: string
  folderId?: string
  existingAudioFileId?: string
}

export interface TrackUploadResult {
  success: boolean
  trackId?: string
  audioFileId?: string
  error?: string
  data?: {
    title: string
    artist: string
    bpm: number | null
    keySignature: string | null
    energyLevel: number | null
    danceability: number | null
    duration: number | null
    genres: string[]
    sonicDna: any
    waveform: any
  }
}

export interface PipelineProgress {
  stage: string
  progress: number
  message: string
}

type ProgressCallback = (progress: PipelineProgress) => void

// Valid musical keys for validation
const VALID_KEYS = [
  'C major', 'C minor', 'C# major', 'C# minor', 'Db major', 'Db minor',
  'D major', 'D minor', 'D# major', 'D# minor', 'Eb major', 'Eb minor',
  'E major', 'E minor', 'F major', 'F minor', 'F# major', 'F# minor',
  'Gb major', 'Gb minor', 'G major', 'G minor', 'G# major', 'G# minor',
  'Ab major', 'Ab minor', 'A major', 'A minor', 'A# major', 'A# minor',
  'Bb major', 'Bb minor', 'B major', 'B minor'
]

// Camelot wheel mapping
const CAMELOT_MAP: Record<string, string> = {
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
 * Parse track info from filename
 */
function parseTrackInfo(filename: string): { title: string; artist: string } {
  const name = filename.replace(/\.(wav|mp3|aiff|flac|m4a)$/i, '')
  
  let artist = 'SERGIK'
  let title = name
  
  // Pattern: "Artist - Title"
  const dashMatch = name.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (dashMatch) {
    const beforeDash = dashMatch[1].trim()
    const afterDash = dashMatch[2].trim()
    
    if (beforeDash.toLowerCase().includes('sergik') || 
        beforeDash.includes(' x ') ||
        beforeDash.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)) {
      artist = beforeDash
      title = afterDash
    }
  }
  
  return { title, artist }
}

/**
 * Normalize energy level to 1-5 scale
 */
function normalizeEnergy(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (value >= 1 && value <= 5) return Math.round(value * 10) / 10
  if (value >= 0 && value <= 10) return Math.round(((value / 10) * 4 + 1) * 10) / 10
  if (value >= 0 && value <= 1) return Math.round((value * 4 + 1) * 10) / 10
  return Math.max(1, Math.min(5, value))
}

/**
 * Normalize danceability to 0-1 scale
 */
function normalizeDanceability(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (value >= 0 && value <= 1) return Math.round(value * 100) / 100
  if (value >= 0 && value <= 10) return Math.round((value / 10) * 100) / 100
  return Math.max(0, Math.min(1, value))
}

/**
 * Get Camelot notation for a key
 */
function getCamelot(key: string): string | null {
  return CAMELOT_MAP[key] || null
}

/**
 * Main upload pipeline
 */
export async function runTrackUploadPipeline(
  input: TrackUploadInput,
  onProgress?: ProgressCallback
): Promise<TrackUploadResult> {
  const supabase = createSupabaseServerClient()
  
  const progress = (stage: string, pct: number, message: string) => {
    onProgress?.({ stage, progress: pct, message })
    console.log(`[Pipeline] ${stage}: ${message} (${pct}%)`)
  }

  try {
    progress('init', 0, 'Starting upload pipeline...')
    
    // Parse filename for initial info
    const { title: parsedTitle, artist: parsedArtist } = parseTrackInfo(input.filename)
    const title = input.title || parsedTitle
    const artist = input.artist || parsedArtist

    // Convert File to Buffer if needed
    let buffer: Buffer
    if (Buffer.isBuffer(input.file)) {
      buffer = input.file
    } else {
      const arrayBuffer = await (input.file as File).arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    }

    // Step 1: Extract metadata
    progress('metadata', 10, 'Extracting metadata...')
    let metadata: any = {}
    try {
      metadata = await extractMetadataFromBuffer(buffer, input.filename)
    } catch (e) {
      console.warn('Metadata extraction failed:', e)
    }

    // Step 2: Generate waveform
    progress('waveform', 20, 'Generating waveform...')
    let waveformData: any = null
    try {
      waveformData = await generateWaveformFromBuffer(buffer, input.filename)
    } catch (e) {
      console.warn('Waveform generation failed:', e)
    }

    // Step 3: Upload to storage (if not already uploaded)
    let audioFileId = input.existingAudioFileId
    let fileUrl = ''

    if (!audioFileId) {
      progress('upload', 30, 'Uploading to storage...')
      
      const fileName = `${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(fileName, buffer, {
          contentType: 'audio/wav',
          upsert: false
        })

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('audio-files')
        .getPublicUrl(fileName)
      
      fileUrl = urlData?.publicUrl || ''

      // Create audio_files record
      progress('database', 40, 'Creating audio file record...')
      const { data: audioFile, error: audioError } = await supabase
        .from('audio_files')
        .insert({
          title,
          artist,
          file_name: input.filename,
          file_url: fileUrl,
          format: 'wav',
          size_bytes: buffer.length,
          duration_seconds: metadata.duration || null,
          bpm: metadata.bpm || null,
          waveform_data: waveformData,
          sonic_dna_status: 'pending'
        })
        .select('id')
        .single()

      if (audioError) {
        throw new Error(`Audio file record creation failed: ${audioError.message}`)
      }

      audioFileId = audioFile.id
    } else {
      // Get existing file URL
      const { data: existingFile } = await supabase
        .from('audio_files')
        .select('file_url')
        .eq('id', audioFileId)
        .single()
      
      fileUrl = existingFile?.file_url || ''
    }

    // Step 4: Run comprehensive analysis
    progress('analysis', 50, 'Running comprehensive analysis...')
    let comprehensiveData: any = null
    try {
      comprehensiveData = await analyzeComprehensive(title, artist, fileUrl, {
        bpm: metadata.bpm,
        duration: metadata.duration
      })
    } catch (e) {
      console.warn('Comprehensive analysis failed:', e)
    }

    // Step 5: Generate Sonic DNA with AI agents
    progress('sonic-dna', 60, 'Generating Sonic DNA...')
    let sonicDna: any = null
    try {
      sonicDna = await generateSonicDNAWithAgents(title, artist, audioFileId!, {
        bpm: metadata.bpm || comprehensiveData?.technical?.bpm,
        key: comprehensiveData?.harmony?.keySignature,
        duration: metadata.duration,
        energyLevel: comprehensiveData?.technical?.energy?.level,
        audioFileUrl: fileUrl
      })
    } catch (e) {
      console.warn('Sonic DNA generation failed:', e)
    }

    // Step 6: Extract and validate key signature
    progress('key', 75, 'Determining key signature...')
    let keySignature = comprehensiveData?.harmony?.keySignature || 
                       sonicDna?.harmony?.keySignature ||
                       metadata.key || 
                       'Unknown'
    
    let camelot: string | null = null
    if (keySignature && VALID_KEYS.includes(keySignature)) {
      camelot = getCamelot(keySignature)
    }

    // Step 7: Compile all data
    progress('compile', 85, 'Compiling track data...')
    
    const bpm = metadata.bpm || comprehensiveData?.technical?.bpm || sonicDna?.technical?.bpm
    const energyLevel = normalizeEnergy(
      comprehensiveData?.technical?.energy?.level || sonicDna?.technical?.energyLevel
    )
    const danceability = normalizeDanceability(
      comprehensiveData?.technical?.danceability || sonicDna?.technical?.danceability
    )
    const duration = metadata.duration || comprehensiveData?.technical?.duration
    
    const genres = sonicDna?.genres?.primaryGenres || 
                   comprehensiveData?.genres?.primary || 
                   []

    // Ensure sonic_dna has all required sections
    const completeSonicDna = {
      drums: sonicDna?.drums || {
        timing: { groove: 'straight', swingAmount: 0, syncopation: 0 },
        pattern: { complexity: 'moderate', kickPattern: 'varied', patternType: 'other', hihatPattern: 'varied', snarePattern: 'varied' },
        complexity: 'moderate',
        genreStyles: genres.length > 0 ? genres : ['Electronic'],
        patternType: 'other'
      },
      genres: sonicDna?.genres || {
        primary: genres,
        primaryGenres: genres,
        subgenres: [],
        fusion: genres.length > 1 ? `${genres[0]} + ${genres[1]} fusion` : null
      },
      harmony: {
        ...sonicDna?.harmony,
        keySignature,
        camelot,
        timeSignature: sonicDna?.harmony?.timeSignature || '4/4',
        scale: sonicDna?.harmony?.scale || 'major'
      },
      technical: {
        ...sonicDna?.technical,
        bpm,
        keySignature,
        energyLevel,
        danceability,
        timeSignature: '4/4'
      },
      emotional: sonicDna?.emotional || { primaryEmotions: [], moodTransitions: [] },
      cultural: sonicDna?.cultural || { regions: [], culturalInfluences: [] },
      musical: sonicDna?.musical || { instrumentation: [], productionTechniques: [] },
      musicology: sonicDna?.musicology || { era: {}, style: {} },
      _metadata: {
        processedAt: new Date().toISOString(),
        pipelineVersion: '2.0',
        qualityScore: sonicDna?._metadata?.qualityScore || 70
      }
    }

    // Step 8: Update audio_files with analysis results
    progress('update', 90, 'Updating audio file with analysis...')
    await supabase
      .from('audio_files')
      .update({
        bpm,
        key_signature: keySignature,
        energy_level: energyLevel,
        danceability,
        waveform_data: waveformData,
        sonic_dna: completeSonicDna,
        sonic_dna_status: 'completed',
        sonic_dna_analyzed_at: new Date().toISOString()
      })
      .eq('id', audioFileId)

    // Step 9: Create or update music_library_tracks
    progress('track', 95, 'Creating/updating track record...')
    
    // Build track data with auto-indexed metadata
    const trackDataForIndex = {
      bpm,
      key_signature: keySignature,
      sonic_dna: completeSonicDna,
      waveform: waveformData,
      artwork_url: null,
      energy_level: energyLevel,
      danceability,
      audio_file_id: audioFileId
    }
    
    // Build indexed metadata for fast stats queries
    const indexedMetadata = buildTrackMetadata(trackDataForIndex, {
      genres,
      camelot,
      sonic_dna_synced_at: new Date().toISOString(),
      pipeline_processed: true
    })
    
    const trackData = {
      title,
      artist,
      audio_file_id: audioFileId,
      file_url: fileUrl,
      folder_id: input.folderId || 'folder-all-tracks',
      bpm,
      key_signature: keySignature,
      energy_level: energyLevel,
      danceability,
      duration,
      sonic_dna: completeSonicDna,
      waveform: waveformData,
      year: new Date().getFullYear(),
      date: new Date().toISOString().split('T')[0],
      metadata: indexedMetadata
    }

    // Check if track already exists
    const { data: existingTrack } = await supabase
      .from('music_library_tracks')
      .select('id')
      .eq('audio_file_id', audioFileId)
      .single()

    let trackId: string
    if (existingTrack) {
      // Update existing track
      const { error: updateError } = await supabase
        .from('music_library_tracks')
        .update(trackData)
        .eq('id', existingTrack.id)
      
      if (updateError) {
        throw new Error(`Track update failed: ${updateError.message}`)
      }
      trackId = existingTrack.id
    } else {
      // Create new track
      const newId = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const { error: insertError } = await supabase
        .from('music_library_tracks')
        .insert({ id: newId, ...trackData })
      
      if (insertError) {
        throw new Error(`Track creation failed: ${insertError.message}`)
      }
      trackId = newId
    }

    progress('complete', 100, 'Pipeline complete!')

    return {
      success: true,
      trackId,
      audioFileId,
      data: {
        title,
        artist,
        bpm,
        keySignature,
        energyLevel,
        danceability,
        duration,
        genres,
        sonicDna: completeSonicDna,
        waveform: waveformData
      }
    }

  } catch (error: any) {
    console.error('[Pipeline] Error:', error)
    return {
      success: false,
      error: error.message || 'Pipeline failed'
    }
  }
}

/**
 * Process existing track with full analysis
 * Use this to re-analyze tracks already in the database
 */
export async function reprocessExistingTrack(
  trackId: string,
  onProgress?: ProgressCallback
): Promise<TrackUploadResult> {
  const supabase = createSupabaseServerClient()
  
  const progress = (stage: string, pct: number, message: string) => {
    onProgress?.({ stage, progress: pct, message })
  }

  try {
    progress('fetch', 5, 'Fetching track data...')
    
    const { data: track, error } = await supabase
      .from('music_library_tracks')
      .select('*, audio_files(*)')
      .eq('id', trackId)
      .single()

    if (error || !track) {
      throw new Error('Track not found')
    }

    // Re-run pipeline with existing audio file
    return await runTrackUploadPipeline({
      file: Buffer.alloc(0), // Not used when existingAudioFileId is provided
      filename: track.title + '.wav',
      title: track.title,
      artist: track.artist,
      folderId: track.folder_id,
      existingAudioFileId: track.audio_file_id
    }, onProgress)

  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Batch process multiple tracks
 */
export async function batchProcessTracks(
  trackIds: string[],
  onProgress?: (trackId: string, progress: PipelineProgress) => void
): Promise<Map<string, TrackUploadResult>> {
  const results = new Map<string, TrackUploadResult>()
  
  for (let i = 0; i < trackIds.length; i++) {
    const trackId = trackIds[i]
    console.log(`[Batch] Processing track ${i + 1}/${trackIds.length}: ${trackId}`)
    
    const result = await reprocessExistingTrack(trackId, (progress) => {
      onProgress?.(trackId, progress)
    })
    
    results.set(trackId, result)
    
    // Small delay between tracks to avoid overwhelming the API
    if (i < trackIds.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  
  return results
}

export default runTrackUploadPipeline
