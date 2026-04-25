import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { fetchSonicDNA } from '@/lib/fetchFromStorage'
import { buildTrackMetadata } from '@/utils/trackIndexUtils'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

// Cache tracks for 5 minutes to reduce database load
export const revalidate = 300

/**
 * GET /api/music-library/tracks
 * Get tracks, optionally filtered by folder
 * Query params: ?folderId=xxx&includeArchived=true
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response
    const { session: vaultSession } = gate

    const { searchParams: spEarly } = new URL(request.url)
    const includeFullDataEarly = spEarly.get('includeFullData') === 'true'
    const includeDebugEarly = spEarly.get('include_debug') === 'true'
    if ((includeFullDataEarly || includeDebugEarly) && !vaultSession?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let supabase
    try {
      supabase = createSupabaseServerClient()
    } catch (e: any) {
      // Graceful degradation when Supabase is unavailable
      return NextResponse.json(
        { tracks: [] },
        { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' } },
      )
    }
    const { searchParams } = new URL(request.url)
    const folderId = searchParams.get('folderId')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const includeDebug = searchParams.get('include_debug') === 'true'

    // Check if admin/full data is requested
    const includeFullData = searchParams.get('includeFullData') === 'true'
    
    // Base fields for all queries
    const baseFields = [
      'id',
      'folder_id',
      'audio_file_id',
      'title',
      'artist',
      'duration',
      'file_url',
      'artwork_url',
      'bpm',
      'key_signature',
      'energy_level',
      'danceability',
      'created_at',
      'date',
      'year',
      'display_order',
      'is_archived',
      'archived_at',
      'genre',
      'subgenre',
      'track_number',
      'disc_number',
      'rating',
      'play_count',
      'last_played_at',
      'tags',
      'sort_artist',
      'composer',
      'comments',
    ]
    
    // Add full data fields for admin pages (sonic_dna, waveform, metadata)
    const fields = includeFullData 
      ? [...baseFields, 'sonic_dna', 'waveform', 'metadata']
      : baseFields

    let query = supabase
      .from('music_library_tracks')
      .select(fields.join(','))
      .order('display_order', { ascending: true })
      .order('title', { ascending: true })

    if (folderId) {
      query = query.eq('folder_id', folderId)
    }
    if (!includeArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false')
    }

    const { data, error } = await query

    const isHtml = (v: any) => typeof v === 'string' && v.includes('<!DOCTYPE html>')
    if (error || (error && isHtml((error as any)?.message)) || isHtml(data)) {
      console.error('Error fetching tracks:', error)
      // Degrade gracefully so the UI can still load
      return NextResponse.json(
        { tracks: [] },
        { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' } },
      )
    }

    // Cache-first Sonic DNA: fetch cached sonic_dna + analysis fields by track_id
    const trackIds = (data || []).map((t: any) => t.id)
    const sonicDNACacheByTrackId = new Map<string, any>()
    const sonicDNACacheByAudioFileId = new Map<string, any>()

    // Get all audio_file_ids for tracks
    const audioFileIds = (data || [])
      .filter((track: any) => track.audio_file_id)
      .map((track: any) => track.audio_file_id)
      .filter((id: any) => id != null)

    if (trackIds.length > 0) {
      // Use single query with OR condition for both track_id and audio_file_id lookups
      const orConditions: string[] = []
      if (trackIds.length > 0) {
        orConditions.push(`track_id.in.(${trackIds.join(',')})`)
      }
      if (audioFileIds.length > 0) {
        orConditions.push(`audio_file_id.in.(${audioFileIds.join(',')})`)
      }

      if (orConditions.length > 0) {
        const { data: cachedRows } = await supabase
          .from('sonic_dna_cache')
          .select('track_id, audio_file_id, sonic_dna, bpm, key_signature, energy_level, danceability')
          .or(orConditions.join(','))

        cachedRows?.forEach((row: any) => {
          sonicDNACacheByTrackId.set(row.track_id, row)
          if (row.audio_file_id) {
            sonicDNACacheByAudioFileId.set(row.audio_file_id, row)
          }
        })
      }
    }

    // Get all audio_file_ids to fetch audio meta (waveform/duration/artwork) + fallback sonic_dna

    // Always fetch lightweight audio meta for stable output shape
    const audioFilesMetaMap = new Map<string, any>()
    if (audioFileIds.length > 0) {
      const { data: audioMeta } = await supabase
        .from('audio_files')
        // Avoid pulling `waveform_data` / large JSON blobs here; they are the top Disk IO drivers.
        .select('id, duration_seconds, artwork_url, created_at')
        .in('id', audioFileIds)

      audioMeta?.forEach((file: any) => {
        audioFilesMetaMap.set(file.id, file)
      })
    }

    const audioFilesFullMap = new Map<string, any>()
    if (audioFileIds.length > 0) {
      const { data: audioFull } = await supabase
        .from('audio_files')
        .select('id, sonic_dna, sonic_dna_json_url, bpm, key_signature, energy_level, danceability')
        .in('id', audioFileIds)

      audioFull?.forEach((file: any) => {
        audioFilesFullMap.set(file.id, file)
      })
    }

    // Helper to check if sonic_dna has actual analysis data
    const hasAnalysisData = (sonicDna: any): boolean => {
      if (!sonicDna) return false
      try {
        const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
        // Check if it's just status metadata (has status/hasData but no actual analysis)
        if (dna.status && dna.hasData && !dna.genres && !dna.musical && !dna.technical && !dna.drums && !dna.comprehensive) {
          return false
        }
        // Check if it has actual analysis data
        return !!(dna.genres || dna.musical || dna.technical || dna.drums || dna.comprehensive)
      } catch {
        return false
      }
    }

    const extractKeyFromSonicDna = (sonicDna: any): string | null => {
      if (!sonicDna) return null
      const dna = typeof sonicDna === 'string' ? safeJsonParse(sonicDna) : sonicDna
      if (!dna) return null
      const key =
        dna?.harmony?.keySignature ||
        dna?.musical?.keySignature ||
        dna?.comprehensive?.harmony?.keySignature ||
        dna?.technical?.key?.key ||
        dna?.comprehensive?.technical?.key?.key ||
        dna?.key?.key ||
        dna?.analysis?.key ||
        dna?.harmony?.camelot ||
        dna?.technical?.camelot ||
        null
      if (!key || key === 'Unknown') return null
      return String(key).trim()
    }

    const safeJsonParse = (value: string) => {
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    }

    // Map database fields to frontend format (snake_case to match front-end expectations)
    let debugTotal = 0
    let debugKeyFromDna = 0
    let debugKeyFromField = 0
    let debugKeyMissing = 0

    const tracks = await Promise.all((data || []).map(async (track: any) => {
      // Prefer audio_files data as source of truth (it has the most complete Sonic DNA analysis)
      let sonicDna = track.sonic_dna
      let bpm = track.bpm
      let keySignature = track.key_signature
      let energyLevel = track.energy_level
      let danceability = track.danceability
      let waveform = undefined
      let duration = track.duration
      let artwork = track.artwork_url
      let createdAt = track.created_at
      let trackMetadata = {}

      // Fast path: cache first (by track id or audio file id)
      const cached = sonicDNACacheByTrackId.get(track.id) ||
        (track.audio_file_id ? sonicDNACacheByAudioFileId.get(track.audio_file_id) : null)

      if (cached?.sonic_dna) {
        sonicDna = cached.sonic_dna
        if (cached.bpm !== null && cached.bpm !== undefined) bpm = cached.bpm
        if (cached.key_signature) keySignature = cached.key_signature
        if (cached.energy_level !== null && cached.energy_level !== undefined) energyLevel = cached.energy_level
        if (cached.danceability !== null && cached.danceability !== undefined) danceability = cached.danceability
      }

      // Always merge lightweight audio meta (waveform/duration/artwork/createdAt/metadata) if available
      if (track.audio_file_id && audioFilesMetaMap.has(track.audio_file_id)) {
        const audioMeta = audioFilesMetaMap.get(track.audio_file_id)
        if (audioMeta.duration_seconds) duration = audioMeta.duration_seconds
        if (audioMeta.artwork_url) artwork = audioMeta.artwork_url
        if (audioMeta.created_at) createdAt = audioMeta.created_at
      }

      // Fallback: if cache miss and we have a full audio row, prefer it
      if (track.audio_file_id && audioFilesFullMap.has(track.audio_file_id)) {
        const audioFile = audioFilesFullMap.get(track.audio_file_id)
        // Always prefer audio_files sonic_dna if it has actual analysis data
        if (audioFile.sonic_dna && hasAnalysisData(audioFile.sonic_dna)) {
          sonicDna = audioFile.sonic_dna
        } else if (!track.sonic_dna || !hasAnalysisData(track.sonic_dna)) {
          // If track doesn't have analysis data, use audio_file even if it's just status
          if (audioFile.sonic_dna) {
            sonicDna = audioFile.sonic_dna
          }
        }
        // If still missing, try fetching from storage URL
        if ((!sonicDna || !hasAnalysisData(sonicDna)) && audioFile.sonic_dna_json_url) {
          const fetched = await fetchSonicDNA({
            sonic_dna: audioFile.sonic_dna,
            sonic_dna_json_url: audioFile.sonic_dna_json_url,
          })
          if (fetched) {
            sonicDna = fetched
          }
        }
        // Otherwise keep track.sonic_dna if it has analysis data
        // Prefer audio_files data for other fields if available
        if (audioFile.bpm) {
          bpm = audioFile.bpm
        }
        if (audioFile.key_signature) {
          keySignature = audioFile.key_signature
        }
        if (audioFile.energy_level !== null && audioFile.energy_level !== undefined) {
          energyLevel = audioFile.energy_level
        }
        if (audioFile.danceability !== null && audioFile.danceability !== undefined) {
          danceability = audioFile.danceability
        }
        // (waveform/duration/artwork/createdAt/metadata are handled via audioFilesMetaMap)
      }

      // Always ensure sonic DNA is in metadata
      const analysisData = {
        bpm: bpm,
        key_signature: keySignature,
        energy_level: energyLevel,
        danceability: danceability,
        waveform_data: waveform,
        duration_seconds: duration,
        artwork_url: artwork
      }

      // Seed metadata with cached sonic_dna if present (fast path)
      if (!sonicDna && cached?.sonic_dna) {
        (analysisData as any).sonic_dna = cached.sonic_dna
      }
      
      // Merge sonic DNA into metadata to ensure it's always available
      const finalMetadata = mergeSonicDNAIntoMetadata(
        trackMetadata,
        sonicDna,
        analysisData
      )

      // Backfill key_signature from sonic DNA if missing or Unknown
      if (!keySignature || keySignature === 'Unknown') {
        const keyFromDna = extractKeyFromSonicDna(sonicDna)
        if (keyFromDna) keySignature = keyFromDna
      }

      debugTotal += 1
      if (keySignature && keySignature !== 'Unknown') {
        if (track.key_signature && track.key_signature !== 'Unknown') debugKeyFromField += 1
        else debugKeyFromDna += 1
      } else {
        debugKeyMissing += 1
      }

      return {
        id: track.id,
        folderId: track.folder_id, // Keep camelCase for folderId (used in API)
        audioFileId: track.audio_file_id, // Keep camelCase for audioFileId (used in API)
        title: track.title,
        artist: track.artist,
        duration: duration || track.duration, // Use audio_files duration if available
        file: track.file_url,
        artwork: artwork || track.artwork_url, // Use audio_files artwork if available
        bpm: bpm,
        key_signature: keySignature, // snake_case to match front-end Track interface
        sonic_dna: sonicDna, // snake_case to match front-end Track interface - contains ALL column data
        waveform: waveform,
        energy_level: energyLevel, // snake_case for consistency
        danceability: danceability,
        created_at: createdAt || track.created_at, // snake_case to match front-end Track interface
        date: track.date,
        year: track.year,
        display_order: track.display_order, // snake_case for consistency
        is_archived: track.is_archived,
        archived_at: track.archived_at,
        metadata: finalMetadata,
        genre: track.genre,
        subgenre: track.subgenre,
        track_number: track.track_number,
        disc_number: track.disc_number,
        rating: track.rating,
        play_count: track.play_count,
        last_played_at: track.last_played_at,
        tags: track.tags,
        sort_artist: track.sort_artist,
        composer: track.composer,
        comments: track.comments,
      }
    }))

    return NextResponse.json(
      {
        tracks,
        ...(includeDebug
          ? {
              debug: {
                total: debugTotal,
                key_from_field: debugKeyFromField,
                key_from_dna: debugKeyFromDna,
                key_missing: debugKeyMissing,
              },
            }
          : {}),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error: any) {
    console.error('Error in GET /api/music-library/tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tracks' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/music-library/tracks
 * Create a new track
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const {
      id,
      folderId,
      audioFileId,
      title,
      artist,
      duration,
      fileUrl,
      file, // Also support 'file' field name
      artwork,
      bpm,
      keySignature,
      key_signature, // Support snake_case
      sonicDna,
      sonic_dna, // Support snake_case
      waveform,
      energyLevel,
      energy_level, // Support snake_case
      danceability,
      createdAt,
      created_at, // Support snake_case
      date,
      year,
      displayOrder,
      display_order, // Support snake_case
      metadata,
      is_archived,
      archived_at,
      beat_grid_offset,
    } = body

    // Support both 'fileUrl' (camelCase) and 'file' (snake_case)
    const fileUrlValue = fileUrl || file

    if (!id || !title || !fileUrlValue) {
      return NextResponse.json(
        { error: 'id, title, and fileUrl (or file) are required' },
        { status: 400 }
      )
    }

    // Get final sonic DNA value
    const finalSonicDNA = sonicDna || sonic_dna || null
    
    // Prepare analysis data
    const analysisData = {
      bpm: bpm || null,
      key_signature: keySignature || key_signature || null,
      energy_level: energyLevel || energy_level || null,
      danceability: danceability || null,
      waveform_data: waveform || null,
      duration_seconds: duration || null,
      artwork_url: artwork || null
    }
    
    // Merge sonic DNA and analysis data into metadata
    const finalMetadata = mergeSonicDNAIntoMetadata(
      metadata || {},
      finalSonicDNA,
      analysisData
    )
    
    const trackData: any = {
      id,
      folder_id: folderId || null,
      audio_file_id: audioFileId || null,
      title,
      artist: artist || 'SERGIK',
      duration: duration || null,
      file_url: fileUrlValue,
      artwork_url: artwork || null,
      bpm: bpm || null,
      key_signature: keySignature || key_signature || null, // Support both formats
      sonic_dna: finalSonicDNA, // Support both formats
      waveform: waveform || null,
      energy_level: energyLevel || energy_level || null, // Support both formats
      danceability: danceability || null,
      created_at: createdAt || created_at || null, // Support both formats
      date: date || null,
      year: year || null,
      is_archived: is_archived || false,
      archived_at: archived_at || null,
      display_order: displayOrder || display_order || 0, // Support both formats
      metadata: finalMetadata // Always includes sonic DNA and all analysis data
    }
    
    // Only include beat_grid_offset if it's provided (column may not exist in all schemas)
    if (beat_grid_offset !== undefined && beat_grid_offset !== null) {
      trackData.beat_grid_offset = beat_grid_offset
    }

    const { data, error } = await supabase
      .from('music_library_tracks')
      .insert(trackData)
      .select()
      .single()

    if (error) {
      console.error('Error creating track:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ track: data }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/music-library/tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create track' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/music-library/tracks
 * Update a track
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400 }
      )
    }

    // Get current track to merge metadata properly
    const { data: currentTrack } = await supabase
      .from('music_library_tracks')
      .select('*')
      .eq('id', id)
      .single()
    
    // Map frontend field names to database field names (support both camelCase and snake_case)
    const dbUpdates: any = {}
    if (updates.folderId !== undefined) dbUpdates.folder_id = updates.folderId
    if (updates.audioFileId !== undefined) dbUpdates.audio_file_id = updates.audioFileId
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.artist !== undefined) dbUpdates.artist = updates.artist
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration
    if (updates.fileUrl !== undefined) dbUpdates.file_url = updates.fileUrl
    if (updates.file !== undefined) dbUpdates.file_url = updates.file // Also support 'file' field
    if (updates.artwork !== undefined) dbUpdates.artwork_url = updates.artwork
    if (updates.bpm !== undefined) dbUpdates.bpm = updates.bpm
    // Support both camelCase (from admin) and snake_case (from front-end)
    if (updates.keySignature !== undefined) dbUpdates.key_signature = updates.keySignature
    if (updates.key_signature !== undefined) dbUpdates.key_signature = updates.key_signature
    if (updates.sonicDna !== undefined) dbUpdates.sonic_dna = updates.sonicDna
    if (updates.sonic_dna !== undefined) dbUpdates.sonic_dna = updates.sonic_dna
    if (updates.waveform !== undefined) dbUpdates.waveform = updates.waveform
    if (updates.energyLevel !== undefined) dbUpdates.energy_level = updates.energyLevel
    if (updates.energy_level !== undefined) dbUpdates.energy_level = updates.energy_level
    if (updates.danceability !== undefined) dbUpdates.danceability = updates.danceability
    if (updates.date !== undefined) dbUpdates.date = updates.date
    if (updates.year !== undefined) dbUpdates.year = updates.year
    if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder
    if (updates.display_order !== undefined) dbUpdates.display_order = updates.display_order
    if (updates.createdAt !== undefined) dbUpdates.created_at = updates.createdAt
    if (updates.created_at !== undefined) dbUpdates.created_at = updates.created_at
    if (updates.is_archived !== undefined) dbUpdates.is_archived = updates.is_archived
    if (updates.archived_at !== undefined) dbUpdates.archived_at = updates.archived_at
    if (updates.beatGridOffset !== undefined) dbUpdates.beat_grid_offset = updates.beatGridOffset
    if (updates.beat_grid_offset !== undefined) dbUpdates.beat_grid_offset = updates.beat_grid_offset
    if (updates.genre !== undefined) dbUpdates.genre = updates.genre
    if (updates.subgenre !== undefined) dbUpdates.subgenre = updates.subgenre
    if (updates.track_number !== undefined) dbUpdates.track_number = updates.track_number
    if (updates.disc_number !== undefined) dbUpdates.disc_number = updates.disc_number
    if (updates.composer !== undefined) dbUpdates.composer = updates.composer
    if (updates.rating !== undefined) dbUpdates.rating = updates.rating
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags
    if (updates.comments !== undefined) dbUpdates.comments = updates.comments
    if (updates.sort_artist !== undefined) dbUpdates.sort_artist = updates.sort_artist

    const audioFileId = currentTrack?.audio_file_id
    const shouldUpdateAudioFile =
      !!audioFileId &&
      (
        updates.title !== undefined ||
        updates.artist !== undefined ||
        updates.fileUrl !== undefined ||
        updates.file !== undefined ||
        updates.artwork !== undefined ||
        (updates as any).artwork_url !== undefined ||
        updates.bpm !== undefined ||
        updates.keySignature !== undefined ||
        updates.key_signature !== undefined ||
        updates.sonicDna !== undefined ||
        updates.sonic_dna !== undefined ||
        updates.energyLevel !== undefined ||
        updates.energy_level !== undefined ||
        updates.danceability !== undefined ||
        updates.duration !== undefined
      )

    if (shouldUpdateAudioFile) {
      const { data: audioFile } = await supabase
        .from('audio_files')
        .select('id, title, artist, file_url, artwork_url, bpm, key_signature, energy_level, danceability, duration_seconds, sonic_dna, metadata')
        .eq('id', audioFileId)
        .single()

      const finalSonicDNA = dbUpdates.sonic_dna !== undefined
        ? dbUpdates.sonic_dna
        : (audioFile?.sonic_dna ?? currentTrack?.sonic_dna ?? null)

      const analysisData = {
        bpm: dbUpdates.bpm !== undefined ? dbUpdates.bpm : (audioFile?.bpm ?? null),
        key_signature: dbUpdates.key_signature !== undefined ? dbUpdates.key_signature : (audioFile?.key_signature ?? null),
        energy_level: dbUpdates.energy_level !== undefined ? dbUpdates.energy_level : (audioFile?.energy_level ?? null),
        danceability: dbUpdates.danceability !== undefined ? dbUpdates.danceability : (audioFile?.danceability ?? null),
        waveform_data: undefined,
        duration_seconds: dbUpdates.duration !== undefined ? dbUpdates.duration : (audioFile?.duration_seconds ?? null),
        artwork_url: dbUpdates.artwork_url !== undefined ? dbUpdates.artwork_url : (audioFile?.artwork_url ?? null),
      }

      const mergedMetadata = mergeSonicDNAIntoMetadata(
        audioFile?.metadata || {},
        finalSonicDNA,
        analysisData
      )

      const audioUpdates: any = {
        metadata: mergedMetadata,
      }

      if (updates.title !== undefined) audioUpdates.title = updates.title
      if (updates.artist !== undefined) audioUpdates.artist = updates.artist
      if (updates.fileUrl !== undefined) audioUpdates.file_url = updates.fileUrl
      if (updates.file !== undefined) audioUpdates.file_url = updates.file
      if (updates.artwork !== undefined) audioUpdates.artwork_url = updates.artwork
      if ((updates as any).artwork_url !== undefined) audioUpdates.artwork_url = (updates as any).artwork_url
      if (updates.bpm !== undefined) audioUpdates.bpm = updates.bpm
      if (updates.keySignature !== undefined) audioUpdates.key_signature = updates.keySignature
      if (updates.key_signature !== undefined) audioUpdates.key_signature = updates.key_signature
      if (updates.sonicDna !== undefined) audioUpdates.sonic_dna = updates.sonicDna
      if (updates.sonic_dna !== undefined) audioUpdates.sonic_dna = updates.sonic_dna
      if (updates.energyLevel !== undefined) audioUpdates.energy_level = updates.energyLevel
      if (updates.energy_level !== undefined) audioUpdates.energy_level = updates.energy_level
      if (updates.danceability !== undefined) audioUpdates.danceability = updates.danceability
      if (updates.duration !== undefined) audioUpdates.duration_seconds = updates.duration

      await supabase
        .from('audio_files')
        .update(audioUpdates)
        .eq('id', audioFileId)
    }
    
    // Build final track state for index
    const finalTrackState = {
      bpm: dbUpdates.bpm !== undefined ? dbUpdates.bpm : (currentTrack?.bpm || null),
      key_signature: dbUpdates.key_signature !== undefined ? dbUpdates.key_signature : (currentTrack?.key_signature || null),
      sonic_dna: dbUpdates.sonic_dna !== undefined ? dbUpdates.sonic_dna : (currentTrack?.sonic_dna || null),
      waveform: dbUpdates.waveform !== undefined ? dbUpdates.waveform : (currentTrack?.waveform || null),
      artwork_url: dbUpdates.artwork_url !== undefined ? dbUpdates.artwork_url : (currentTrack?.artwork_url || null),
      energy_level: dbUpdates.energy_level !== undefined ? dbUpdates.energy_level : (currentTrack?.energy_level || null),
      danceability: dbUpdates.danceability !== undefined ? dbUpdates.danceability : (currentTrack?.danceability || null),
      audio_file_id: currentTrack?.audio_file_id || null
    }
    
    // If metadata is explicitly provided, use it and add index flags
    if (updates.metadata !== undefined) {
      // Rebuild index flags and merge with provided metadata
      dbUpdates.metadata = buildTrackMetadata(finalTrackState, updates.metadata)
    } else {
      // Get existing metadata and rebuild with index
      const existingMetadata = currentTrack?.metadata || {}
      
      // Merge sonic DNA into metadata if sonic DNA exists
      if (finalTrackState.sonic_dna) {
        const analysisData = {
          bpm: finalTrackState.bpm,
          key_signature: finalTrackState.key_signature,
          energy_level: finalTrackState.energy_level,
          danceability: finalTrackState.danceability,
          waveform_data: finalTrackState.waveform,
          duration_seconds: dbUpdates.duration !== undefined ? dbUpdates.duration : (currentTrack?.duration || null),
          artwork_url: finalTrackState.artwork_url
        }
        const mergedMetadata = mergeSonicDNAIntoMetadata(existingMetadata, finalTrackState.sonic_dna, analysisData)
        // Add index flags to merged metadata
        dbUpdates.metadata = buildTrackMetadata(finalTrackState, mergedMetadata)
      } else {
        // Just rebuild index
        dbUpdates.metadata = buildTrackMetadata(finalTrackState, existingMetadata)
      }
    }

    const { data, error } = await supabase
      .from('music_library_tracks')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating track:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ track: data })
  } catch (error: any) {
    console.error('Error in PUT /api/music-library/tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update track' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/music-library/tracks
 * Archive a track (no hard deletes)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'id query parameter is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('music_library_tracks')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deleting track:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/music-library/tracks:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete track' },
      { status: 500 }
    )
  }
}
