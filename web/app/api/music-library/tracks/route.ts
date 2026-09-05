import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { buildTrackMetadata } from '@/utils/trackIndexUtils'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { applyPreferredGenreToSonicDna } from '@/lib/audio/groove-class-options'
import {
  applyCatalogLock,
  catalogLockFromTrack,
  stampCatalogOverrides,
} from '@/lib/catalog-lock'
import { bumpMusicLibraryPublishVersion, isUsableCatalogValue, preferCatalogValue } from '@/lib/music-library-publish'
import { syncCatalogFieldsToCache } from '@/utils/sonicDNACache'
import { mapLibraryTrackToListItem } from '@/lib/music-library/track-list-fields'
import { persistedCreatedDateFields, normalizeTrackCreatedDate } from '@/lib/music-library/track-created-date'
import { persistSystemicCover } from '@/lib/catalog-sync/persist-systemic-cover'

export const dynamic = 'force-dynamic'

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
    const idsParam = searchParams.get('ids')
    const requestedIds = (idsParam || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const includeDebug = searchParams.get('include_debug') === 'true'

    // Public list requires a scope — unbounded full-table reads hammer cold vault loads.
    if (requestedIds.length === 0 && !folderId) {
      if (!vaultSession?.isAdmin) {
        return NextResponse.json(
          { error: 'folderId or ids query param required' },
          { status: 400, headers: { 'Cache-Control': 'no-cache' } },
        )
      }
    }

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
      'date_created',
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
      'beat_grid_offset',
    ]
    
    // List endpoints stay lean: never TOAST-read sonic_dna / waveform for many rows
    // unless hydrating sparse playlist/folder rows that lack bpm/key.
    // Full DNA + waveform are fetched per selected track via /api/audio/sonic-dna and /api/audio/waveform.
    // Always include metadata so created/original_date is available without a second fetch.
    // Folder join keeps Album column in sync with Songs browse.
    const fields = [
      ...baseFields,
      'metadata',
      'music_library_folders(name, type, artwork_url)',
    ]

    let query = supabase
      .from('music_library_tracks')
      .select(fields.join(','))
      .order('display_order', { ascending: true })
      .order('title', { ascending: true })

    if (requestedIds.length > 0) {
      query = query.in('id', requestedIds)
    } else if (folderId) {
      query = query.eq('folder_id', folderId)
    } else if (vaultSession?.isAdmin) {
      // Admin unscoped: hard cap to avoid accidental full-table dumps
      const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 500, 1), 1000)
      const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)
      query = query.range(offset, offset + limit - 1)
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

    const audioFileIds = (data || [])
      .filter((track: any) => track.audio_file_id)
      .map((track: any) => track.audio_file_id)
      .filter((id: any) => id != null)

    const needsDnaHydration = (track: any) => {
      const bpmMissing = track.bpm == null || !Number.isFinite(Number(track.bpm))
      const keyMissing =
        !track.key_signature ||
        String(track.key_signature).trim() === '' ||
        String(track.key_signature).toLowerCase() === 'unknown'
      return bpmMissing || keyMissing
    }

    const hydrateDna =
      requestedIds.length > 0 || (data || []).some((t: any) => needsDnaHydration(t))

    const audioFilesMetaMap = new Map<string, any>()
    if (audioFileIds.length > 0) {
      const audioSelect = hydrateDna
        ? 'id, duration_seconds, artwork_url, created_at, sonic_dna_status, bpm, key_signature, sonic_dna'
        : 'id, duration_seconds, artwork_url, created_at, sonic_dna_status, bpm, key_signature'
      const { data: audioMeta } = await supabase
        .from('audio_files')
        .select(audioSelect)
        .in('id', audioFileIds)
      audioMeta?.forEach((file: any) => audioFilesMetaMap.set(file.id, file))
    }

    // Prefer richer catalog twins (same title+artist) when playlist-ingest rows are sparse.
    const twinByKey = new Map<string, any>()
    const sparse = (data || []).filter((t: any) => needsDnaHydration(t) || !t.duration)
    if (sparse.length > 0 && sparse.length <= 80) {
      const titles = [...new Set(sparse.map((t: any) => String(t.title || '').trim()).filter(Boolean))]
      if (titles.length > 0) {
        const { data: twins } = await supabase
          .from('music_library_tracks')
          .select(
            'id, title, artist, bpm, key_signature, genre, subgenre, duration, year, date, date_created, artwork_url, rating, play_count, folder_id, metadata, music_library_folders(name, type, artwork_url)',
          )
          .in('title', titles)
          .or('is_archived.is.null,is_archived.eq.false')
          .limit(200)
        for (const twin of twins || []) {
          const key = `${String(twin.title || '').trim().toLowerCase()}::${String(twin.artist || '').trim().toLowerCase()}`
          const score =
            (twin.bpm != null ? 4 : 0) +
            (twin.key_signature && String(twin.key_signature).toLowerCase() !== 'unknown' ? 2 : 0) +
            (twin.duration != null ? 2 : 0) +
            (twin.artwork_url ? 1 : 0)
          const prev = twinByKey.get(key)
          const prevScore = prev
            ? (prev.bpm != null ? 4 : 0) +
              (prev.key_signature && String(prev.key_signature).toLowerCase() !== 'unknown' ? 2 : 0) +
              (prev.duration != null ? 2 : 0) +
              (prev.artwork_url ? 1 : 0)
            : -1
          if (score > prevScore) twinByKey.set(key, twin)
        }
      }
    }

    const tracks = (data || []).map((track: any) => {
      const folder = track.music_library_folders || null
      const audio = track.audio_file_id ? audioFilesMetaMap.get(track.audio_file_id) : null
      const twinKey = `${String(track.title || '').trim().toLowerCase()}::${String(track.artist || '').trim().toLowerCase()}`
      const twin = twinByKey.get(twinKey)
      const merged =
        twin && twin.id !== track.id
          ? {
              ...track,
              bpm: track.bpm ?? twin.bpm,
              key_signature: track.key_signature || twin.key_signature,
              genre: track.genre || twin.genre,
              subgenre: track.subgenre || twin.subgenre,
              duration: track.duration ?? twin.duration,
              year: track.year ?? twin.year,
              date: track.date || twin.date,
              date_created: track.date_created || twin.date_created,
              artwork_url: track.artwork_url || twin.artwork_url,
              rating: track.rating ?? twin.rating,
              play_count: track.play_count ?? twin.play_count,
              metadata: track.metadata || twin.metadata,
              music_library_folders: folder || twin.music_library_folders,
            }
          : track

      return mapLibraryTrackToListItem(merged, {
        audio,
        folder: merged.music_library_folders || folder,
        includeFullMetadata: includeFullData,
      })
    })
    return NextResponse.json(
      { tracks },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
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

    const persistedCreated = persistedCreatedDateFields({
      incoming: {
        metadata: finalMetadata,
        date_created: (body as any).date_created || (body as any).dateCreated,
        year,
      },
    })
    trackData.metadata = persistedCreated.metadata
    trackData.date_created = persistedCreated.date_created
    if (!trackData.year && persistedCreated.year) trackData.year = persistedCreated.year
    
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
    if (updates.sonic_dna_status !== undefined) dbUpdates.sonic_dna_status = updates.sonic_dna_status
    if (updates.sonicDnaStatus !== undefined) dbUpdates.sonic_dna_status = updates.sonicDnaStatus
    if (updates.waveform !== undefined) dbUpdates.waveform = updates.waveform
    if (updates.energyLevel !== undefined) dbUpdates.energy_level = updates.energyLevel
    if (updates.energy_level !== undefined) dbUpdates.energy_level = updates.energy_level
    if (updates.danceability !== undefined) dbUpdates.danceability = updates.danceability
    if (updates.date !== undefined) dbUpdates.date = updates.date
    if (updates.year !== undefined) dbUpdates.year = updates.year
    {
      const nextCreated = normalizeTrackCreatedDate(
        updates.date_created !== undefined ? updates.date_created : updates.dateCreated,
      )
      // Never stage a null write — empty form fields must not erase a stored created date.
      if (nextCreated) dbUpdates.date_created = nextCreated
    }
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

    const nextGenre = dbUpdates.genre !== undefined ? dbUpdates.genre : currentTrack?.genre
    const nextSubgenre = dbUpdates.subgenre !== undefined ? dbUpdates.subgenre : currentTrack?.subgenre
    if (
      isUsableCatalogValue(nextGenre) &&
      (
        updates.genre !== undefined ||
        updates.subgenre !== undefined ||
        updates.sonicDna !== undefined ||
        updates.sonic_dna !== undefined
      )
    ) {
      const baseDna = dbUpdates.sonic_dna !== undefined
        ? dbUpdates.sonic_dna
        : currentTrack?.sonic_dna
      dbUpdates.sonic_dna = applyPreferredGenreToSonicDna(baseDna, String(nextGenre || ''), String(nextSubgenre || ''))
    }

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
        updates.duration !== undefined ||
        updates.genre !== undefined ||
        updates.subgenre !== undefined
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
      if (dbUpdates.sonic_dna !== undefined) audioUpdates.sonic_dna = dbUpdates.sonic_dna

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
    
    // If metadata is explicitly provided, merge onto existing then add index flags
    if (updates.metadata !== undefined) {
      dbUpdates.metadata = buildTrackMetadata(finalTrackState, {
        ...(currentTrack?.metadata && typeof currentTrack.metadata === 'object'
          ? currentTrack.metadata
          : {}),
        ...updates.metadata,
      })
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

    dbUpdates.metadata = stampCatalogOverrides(dbUpdates.metadata || currentTrack?.metadata, {
      bpm: dbUpdates.bpm,
      key_signature: dbUpdates.key_signature,
      genre: dbUpdates.genre,
      subgenre: dbUpdates.subgenre,
      title: dbUpdates.title,
      artist: dbUpdates.artist,
      year: dbUpdates.year,
    })

    const persistedCreated = persistedCreatedDateFields({
      existing: currentTrack,
      incoming: {
        metadata: dbUpdates.metadata,
        date_created: dbUpdates.date_created ?? updates.date_created ?? updates.dateCreated,
        year: dbUpdates.year,
      },
    })
    dbUpdates.metadata = persistedCreated.metadata
    if (persistedCreated.date_created) dbUpdates.date_created = persistedCreated.date_created
    if (dbUpdates.year == null && persistedCreated.year) dbUpdates.year = persistedCreated.year

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

    const saved = data || currentTrack
    let systemic: { folderId: string | null; playlistId: string | null; tracksUpdated: number } | null = null
    if (updates.artwork !== undefined) {
      const folderIdForCover = (dbUpdates.folder_id as string | undefined) || currentTrack?.folder_id || null
      if (folderIdForCover) {
        try {
          systemic = await persistSystemicCover(
            supabase,
            folderIdForCover,
            (updates.artwork as string) || null,
          )
        } catch (propagateError) {
          console.error('[tracks PUT] Failed to persist systemic cover:', propagateError)
        }
      }
    }

    await syncCatalogFieldsToCache(id, audioFileId || saved?.audio_file_id || null, {
      bpm: saved?.bpm,
      key_signature: saved?.key_signature,
      genre: saved?.genre,
      subgenre: saved?.subgenre,
      sonic_dna: saved?.sonic_dna,
    })

    // Only bump when browse-facing catalog fields change.
    // Playback always rewrites metadata (and often sonic_dna / beat_grid_offset) for grid
    // lock — that must NOT invalidate the vault UI or SergBrowser flashes "Loading…".
    const catalogBumpFields = [
      'bpm',
      'key_signature',
      'genre',
      'subgenre',
      'title',
      'artist',
      'year',
      'date',
      'date_created',
      'artwork_url',
    ] as const
    const catalogChanged =
      catalogBumpFields.some((field) => dbUpdates[field] !== undefined) ||
      updates.metadata !== undefined ||
      updates.artwork !== undefined
    let publishVersion: number | null = null
    if (catalogChanged) {
      try {
        publishVersion = await bumpMusicLibraryPublishVersion()
      } catch (bumpError) {
        console.warn('[tracks PUT] Failed to bump catalog version:', bumpError)
      }
    }

    return NextResponse.json({
      track: data,
      folderId: systemic?.folderId || currentTrack?.folder_id || null,
      playlistId: systemic?.playlistId || null,
      tracksUpdated: systemic?.tracksUpdated || 0,
      publishVersion,
    })
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
