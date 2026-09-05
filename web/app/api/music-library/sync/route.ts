import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { getMusicLibraryPublishVersion } from '@/lib/music-library-publish'
import {
  getCatalogSnapshot,
  matchCatalogEtag,
  setCatalogSnapshot,
} from '@/lib/music-library/catalog-snapshot-cache'
import { persistedCreatedDateFields } from '@/lib/music-library/track-created-date'

/** PostgREST default max-rows is typically 1000 — page past it on sync. */
const SYNC_TRACK_PAGE_SIZE = 1000

// Logging utility (must be defined before use)
// Use absolute path to avoid issues with process.cwd() in Next.js
const getLogPath = () => {
  try {
    // Try to use the workspace root if available
    if (typeof process !== 'undefined' && process.cwd) {
      return join(process.cwd(), '.cursor', 'debug.log')
    }
    // Fallback to a safe path
    return '/tmp/debug.log'
  } catch {
    return '/tmp/debug.log'
  }
}
const log = async (_obj: any) => {
  // Hot-path no-op: previous debug appendFile to missing .cursor/debug.log
  // added latency and flooded logs on every vault sync request.
}

/**
 * POST /api/music-library/sync
 * Sync music-library.json to database
 * This imports the JSON structure into the database
 */
export async function POST(request: NextRequest) {
  // #region agent log
  await log({location:'sync/route.ts:12',message:'POST /api/music-library/sync entry',data:{},hypothesisId:'A'})
  // #endregion
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fail fast during Supabase outages (prevents partial/corrupt writes)
    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse()
    }

    const supabase = createSupabaseServerClient()
    const body = await request.json()
    const { filePath, includeAnalysis } = body

    // Safety snapshot (DB → JSON) before mutating anything. If snapshot fails, abort sync.
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const backupsDir = join(process.cwd(), 'data', 'backups')
      await mkdir(backupsDir, { recursive: true })

      // IMPORTANT: keep snapshots lean by default (avoid TOAST-heavy columns like waveform/sonic_dna/metadata).
      // You can opt-in to a full snapshot by sending { includeAnalysis: true }.
      const foldersSelect = includeAnalysis
        ? '*'
        : 'id,name,type,parent_id,hidden,is_archived,archived_at,artwork_url,year,display_order,created_at,updated_at'
      const tracksSelect = includeAnalysis
        ? '*'
        : 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,genre,subgenre,tags,track_number,disc_number,created_at,date,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at'
      const playlistsSelect = includeAnalysis
        ? '*'
        : 'id,name,description,artwork_url,track_ids,is_archived,archived_at,created_at,updated_at'

      const [foldersRes, tracksRes, playlistsRes] = await Promise.all([
        supabase.from('music_library_folders').select(foldersSelect),
        supabase.from('music_library_tracks').select(tracksSelect),
        supabase.from('music_library_playlists').select(playlistsSelect),
      ])

      if (foldersRes.error || tracksRes.error || playlistsRes.error) {
        throw new Error(
          foldersRes.error?.message ||
            tracksRes.error?.message ||
            playlistsRes.error?.message ||
            'Failed to snapshot database',
        )
      }

      const snapshot = {
        description: 'Pre-sync backup (auto-generated)',
        createdAt: new Date().toISOString(),
        folders: foldersRes.data || [],
        tracks: tracksRes.data || [],
        playlists: playlistsRes.data || [],
      }

      const snapshotPath = join(backupsDir, `music-library-db-snapshot-${ts}.json`)
      await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8')

      // #region agent log
      await log({location:'sync/route.ts:40',message:'Pre-sync snapshot created',data:{snapshotPath},hypothesisId:'D'})
      // #endregion
    } catch (snapshotErr: any) {
      // #region agent log
      await log({location:'sync/route.ts:52',message:'Pre-sync snapshot FAILED; aborting',data:{error:snapshotErr?.message},hypothesisId:'D'})
      // #endregion
      return NextResponse.json(
        { error: `Pre-sync snapshot failed (aborting to prevent data loss): ${snapshotErr?.message || 'unknown error'}` },
        { status: 500 },
      )
    }

    // Read JSON file
    const jsonPath = filePath || join(process.cwd(), 'data', 'music-library.json')
    // #region agent log
    await log({location:'sync/route.ts:19',message:'Reading JSON file',data:{jsonPath},hypothesisId:'D'})
    // #endregion
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf8'))

    const folders = jsonData.folders || []
    // #region agent log
    await log({location:'sync/route.ts:22',message:'JSON parsed',data:{foldersCount:folders.length,tracksCount:folders.reduce((acc:number,f:any)=>acc+(f.tracks?.length||0),0)},hypothesisId:'D'})
    // #endregion
    let foldersCreated = 0
    let tracksCreated = 0
    const errors: string[] = []

    // Recursive function to process folders and tracks
    const processFolder = async (folder: any, parentId: string | null = null) => {
      try {
        // Insert or update folder
        const folderData = {
          id: folder.id,
          name: folder.name,
          type: folder.type,
          parent_id: parentId,
          hidden: folder.hidden || false,
          artwork_url: folder.artwork || null,
          year: folder.year || null,
          display_order: 0,
          metadata: {}
        }

        const { error: folderError } = await supabase
          .from('music_library_folders')
          .upsert(folderData, { onConflict: 'id' })

        if (folderError) {
          errors.push(`Error upserting folder ${folder.id}: ${folderError.message}`)
          return
        }

        foldersCreated++

        // Process tracks in this folder
        // Strategy:
        // 1. "All Tracks" folder: Use original track ID, store all unique tracks
        // 2. Subfolders of "All Tracks": Reference tracks from "All Tracks" (ensure track exists in All Tracks first)
        // 3. Other folders: Create folder-specific IDs
        if (folder.tracks && Array.isArray(folder.tracks)) {
          for (const track of folder.tracks) {
            try {
              // Check if this folder is a child of "All Tracks"
              const isChildOfAllTracks = parentId === 'folder-all-tracks'
              
              let trackId = track.id
              let trackData: any
              let preservedRow: any = {}

              if (folder.id === 'folder-all-tracks') {
                // All Tracks: use original ID, store complete track data
                trackId = track.id
                
                // Preserve existing audio_file_id if track already exists
                let preservedAudioFileId = null
                let preservedAnalysis: any = {}
                try {
                  const { data: existingTrack } = await supabase
                    .from('music_library_tracks')
                    .select('audio_file_id, sonic_dna, bpm, key_signature, waveform, energy_level, danceability, duration, artwork_url, created_at, date, year, date_created, metadata')
                    .eq('id', trackId)
                    .maybeSingle()
                  if (existingTrack?.audio_file_id) {
                    preservedAudioFileId = existingTrack.audio_file_id
                  }
                  if (existingTrack) {
                    preservedAnalysis = existingTrack
                    preservedRow = existingTrack
                  }
                } catch (e) {
                  // If lookup fails, continue with null
                }
                
                trackData = {
                  id: trackId,
                  folder_id: folder.id,
                  audio_file_id: preservedAudioFileId, // Preserve existing link
                  title: track.title,
                  artist: track.artist || 'SERGIK',
                  duration: track.duration ?? preservedAnalysis.duration ?? null,
                  file_url: track.file,
                  artwork_url: track.artwork ?? preservedAnalysis.artwork_url ?? null,
                  bpm: track.bpm ?? preservedAnalysis.bpm ?? null,
                  key_signature: track.key_signature ?? preservedAnalysis.key_signature ?? null,
                  sonic_dna: track.sonic_dna ?? preservedAnalysis.sonic_dna ?? null,
                  waveform: track.waveform ?? preservedAnalysis.waveform ?? null,
                  energy_level: track.energy_level ?? preservedAnalysis.energy_level ?? null,
                  danceability: track.danceability ?? preservedAnalysis.danceability ?? null,
                  created_at: track.created_at ?? track.date ?? preservedAnalysis.created_at ?? null,
                  date: track.date ?? preservedAnalysis.date ?? null,
                  year: track.year ?? preservedAnalysis.year ?? null,
                  display_order: 0,
                  metadata: {}
                }
                // #region agent log
                await log({location:'sync/route.ts:125',message:'All Tracks track data',data:{trackId,fileUrl:track.file,preservedAudioFileId:!!preservedAudioFileId,audioFileId:preservedAudioFileId},hypothesisId:'A'})
                // #endregion
              } else if (isChildOfAllTracks) {
                // Subfolder of All Tracks: ensure track exists in All Tracks first, then create reference
                // Check if track exists in All Tracks
                const { data: existingTrack } = await supabase
                  .from('music_library_tracks')
                  .select('id')
                  .eq('id', track.id)
                  .eq('folder_id', 'folder-all-tracks')
                  .maybeSingle()
                
                if (!existingTrack) {
                  // Track doesn't exist in All Tracks yet, add it there first
                  // Preserve audio_file_id + created date if it exists elsewhere
                  let preservedAudioFileId = null
                  let preservedAnywhere: any = null
                  try {
                    const { data: existingTrackAnywhere } = await supabase
                      .from('music_library_tracks')
                      .select('audio_file_id, date_created, metadata, year')
                      .eq('id', track.id)
                      .maybeSingle()
                    preservedAnywhere = existingTrackAnywhere
                    if (existingTrackAnywhere?.audio_file_id) {
                      preservedAudioFileId = existingTrackAnywhere.audio_file_id
                    }
                  } catch (e) {
                    // If lookup fails, continue with null
                  }

                  const allTracksCreated = persistedCreatedDateFields({
                    existing: preservedAnywhere,
                    incoming: {
                      metadata: track.metadata,
                      date_created: track.date_created,
                      year: track.year,
                    },
                  })
                  
                  const allTracksTrackData = {
                    id: track.id,
                    folder_id: 'folder-all-tracks',
                    audio_file_id: preservedAudioFileId, // Preserve existing link
                    title: track.title,
                    artist: track.artist || 'SERGIK',
                    duration: track.duration || null,
                    file_url: track.file,
                    artwork_url: track.artwork || null,
                    bpm: track.bpm || null,
                    key_signature: track.key_signature || null,
                    sonic_dna: track.sonic_dna || null,
                    waveform: track.waveform || null,
                    energy_level: track.energy_level || null,
                    danceability: track.danceability || null,
                    created_at: track.created_at || track.date || null,
                    date: track.date || null,
                    year: track.year || allTracksCreated.year || null,
                    date_created: allTracksCreated.date_created,
                    display_order: 0,
                    metadata: allTracksCreated.metadata,
                  }
                  
                  const { error: allTracksError } = await supabase
                    .from('music_library_tracks')
                    .upsert(allTracksTrackData, { onConflict: 'id' })
                  
                  if (allTracksError) {
                    errors.push(`Error adding track to All Tracks ${track.id}: ${allTracksError.message}`)
                  }
                }
                
                // Create reference in subfolder
                trackId = `${track.id}-ref-${folder.id}`
                try {
                  const { data: existingRef } = await supabase
                    .from('music_library_tracks')
                    .select('audio_file_id, sonic_dna, bpm, key_signature, waveform, energy_level, danceability, duration, artwork_url, created_at, date, year, date_created, metadata')
                    .eq('id', trackId)
                    .maybeSingle()
                  if (existingRef) preservedRow = existingRef
                } catch {
                  // continue
                }
                trackData = {
                  id: trackId,
                  folder_id: folder.id,
                  audio_file_id: null,
                  title: track.title,
                  artist: track.artist || 'SERGIK',
                  duration: track.duration || null,
                  file_url: track.file,
                  artwork_url: track.artwork || null,
                  bpm: track.bpm || null,
                  key_signature: track.key_signature || null,
                  sonic_dna: track.sonic_dna || null,
                  waveform: track.waveform || null,
                  energy_level: track.energy_level || null,
                  danceability: track.danceability || null,
                  created_at: track.created_at || track.date || null,
                  date: track.date || null,
                  year: track.year || null,
                  display_order: 0,
                  metadata: {
                    referencesAllTracks: true,
                    originalTrackId: track.id
                  }
                }
              } else {
                // Other folders: create unique ID
                trackId = `${track.id}-in-${folder.id}`
                
                // Preserve existing audio_file_id if track already exists
                let preservedAudioFileId = null
                let preservedAnalysis: any = {}
                try {
                  const { data: existingTrack } = await supabase
                    .from('music_library_tracks')
                    .select('audio_file_id, sonic_dna, bpm, key_signature, waveform, energy_level, danceability, duration, artwork_url, created_at, date, year, date_created, metadata')
                    .eq('id', trackId)
                    .maybeSingle()
                  if (existingTrack?.audio_file_id) {
                    preservedAudioFileId = existingTrack.audio_file_id
                  }
                  if (existingTrack) {
                    preservedAnalysis = existingTrack
                    preservedRow = existingTrack
                  }
                } catch (e) {
                  // If lookup fails, continue with null
                }
                
                trackData = {
                  id: trackId,
                  folder_id: folder.id,
                  audio_file_id: preservedAudioFileId, // Preserve existing link
                  title: track.title,
                  artist: track.artist || 'SERGIK',
                  duration: track.duration ?? preservedAnalysis.duration ?? null,
                  file_url: track.file,
                  artwork_url: track.artwork ?? preservedAnalysis.artwork_url ?? null,
                  bpm: track.bpm ?? preservedAnalysis.bpm ?? null,
                  key_signature: track.key_signature ?? preservedAnalysis.key_signature ?? null,
                  sonic_dna: track.sonic_dna ?? preservedAnalysis.sonic_dna ?? null,
                  waveform: track.waveform ?? preservedAnalysis.waveform ?? null,
                  energy_level: track.energy_level ?? preservedAnalysis.energy_level ?? null,
                  danceability: track.danceability ?? preservedAnalysis.danceability ?? null,
                  created_at: track.created_at ?? track.date ?? preservedAnalysis.created_at ?? null,
                  date: track.date ?? preservedAnalysis.date ?? null,
                  year: track.year ?? preservedAnalysis.year ?? null,
                  display_order: 0,
                  metadata: {}
                }
              }

              const persistedCreated = persistedCreatedDateFields({
                existing: preservedRow,
                incoming: {
                  metadata: track.metadata || trackData.metadata,
                  date_created: track.date_created,
                  year: trackData.year,
                },
              })
              trackData.metadata = persistedCreated.metadata
              trackData.date_created = persistedCreated.date_created
              if (trackData.year == null && persistedCreated.year) {
                trackData.year = persistedCreated.year
              }

              // Use upsert to handle both new tracks and updates
              // #region agent log
              await log({location:'sync/route.ts:188',message:'Before upsert track',data:{trackId,folderId:folder.id,audioFileId:trackData.audio_file_id,fileUrl:trackData.file_url},hypothesisId:'A'})
              // #endregion
              const { error: trackError } = await supabase
                .from('music_library_tracks')
                .upsert(trackData, { onConflict: 'id' })

              if (trackError) {
                // #region agent log
                await log({location:'sync/route.ts:193',message:'Track upsert error',data:{trackId,error:trackError.message},hypothesisId:'B'})
                // #endregion
                errors.push(`Error upserting track ${trackId}: ${trackError.message}`)
              } else {
                // #region agent log
                await log({location:'sync/route.ts:195',message:'Track upsert success',data:{trackId},hypothesisId:'A'})
                // #endregion
                tracksCreated++
              }
            } catch (trackErr: any) {
              errors.push(`Error processing track ${track.id}: ${trackErr.message}`)
            }
          }
        }

        // Process children recursively, but process "All Tracks" last
        if (folder.children && Array.isArray(folder.children)) {
          const allTracksChild = folder.children.find((c: any) => c.id === 'folder-all-tracks')
          const otherChildren = folder.children.filter((c: any) => c.id !== 'folder-all-tracks')
          
          // Process other children first
          for (const child of otherChildren) {
            await processFolder(child, folder.id)
          }
          
          // Process "All Tracks" last to ensure it's the source of truth
          if (allTracksChild) {
            await processFolder(allTracksChild, folder.id)
          }
        }
      } catch (folderErr: any) {
        errors.push(`Error processing folder ${folder.id}: ${folderErr.message}`)
      }
    }

    // Process all root folders
    // The recursive processing will handle "All Tracks" last within each parent folder
    // #region agent log
    await log({location:'sync/route.ts:225',message:'Starting folder processing',data:{rootFoldersCount:folders.length},hypothesisId:'E'})
    // #endregion
    for (const folder of folders) {
      await processFolder(folder, null)
    }
    // #region agent log
    await log({location:'sync/route.ts:229',message:'Folder processing complete',data:{foldersCreated,tracksCreated,errorsCount:errors.length},hypothesisId:'D'})
    // #endregion

    // Process playlists
    let playlistsCreated = 0
    const playlists = jsonData.playlists || []
    for (const playlist of playlists) {
      try {
        const playlistData = {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description || null,
          artwork_url: playlist.artwork || null,
          track_ids: playlist.trackIds || [],
        }

        const { error: playlistError } = await supabase
          .from('music_library_playlists')
          .upsert(playlistData, { onConflict: 'id' })

        if (playlistError) {
          errors.push(`Error upserting playlist ${playlist.id}: ${playlistError.message}`)
        } else {
          playlistsCreated++
        }
      } catch (playlistErr: any) {
        errors.push(`Error processing playlist ${playlist.id}: ${playlistErr.message}`)
      }
    }

    // #region agent log
    await log({location:'sync/route.ts:256',message:'POST sync complete',data:{foldersCreated,tracksCreated,playlistsCreated,errorsCount:errors.length},hypothesisId:'D'})
    // #endregion
    return NextResponse.json({
      success: true,
      stats: {
        foldersCreated,
        tracksCreated,
        playlistsCreated,
        errors: errors.length
      },
      errors: errors.slice(0, 10) // Return first 10 errors
    })
  } catch (error: any) {
    console.error('Error in POST /api/music-library/sync:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync music library' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/music-library/sync
 * Export database structure to JSON format
 */
export async function GET(request: NextRequest) {
  // Immediate console log that will definitely execute
  console.log('[SYNC GET] Route handler called')
  // #region agent log
  try { await log({location:'sync/route.ts:381',message:'GET /api/music-library/sync entry',data:{},hypothesisId:'A'}); } catch (e) { console.error('[SYNC GET] Log failed:', e) }
  // #endregion
  try {
    console.log('[SYNC GET] Inside try block')
    const { searchParams } = new URL(request.url)
    // Default to lean export for the public music player to avoid heavy TOAST reads.
    // Admin/debug can opt-in to include analysis blobs.
    const includeAnalysis = searchParams.get('include_analysis') === 'true'
    const includeArchived = searchParams.get('include_archived') === 'true'
    const includeHidden = searchParams.get('include_hidden') === 'true'

    const gate = await getMusicVaultApiAccess(request)
    if (!gate.ok) return gate.response
    if ((includeAnalysis || includeArchived || includeHidden) && !gate.session?.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Warm snapshot for lean public sync (no analysis / archived / hidden)
    const leanPublic = !includeAnalysis && !includeArchived && !includeHidden
    const earlyVersion = leanPublic ? await getMusicLibraryPublishVersion().catch(() => 0) : 0
    if (leanPublic && earlyVersion) {
      const cached = getCatalogSnapshot('sync', earlyVersion, 'public')
      const ifNoneMatch = request.headers.get('if-none-match')
      if (cached && matchCatalogEtag(ifNoneMatch, cached.etag)) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: cached.etag,
            'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
            Vary: 'Cookie',
          },
        })
      }
      if (cached) {
        return new NextResponse(cached.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: cached.etag,
            'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
            Vary: 'Cookie',
          },
        })
      }
    }

    // #region agent log
    try { await log({location:'sync/route.ts:388',message:'Creating Supabase client',data:{hasUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasServiceKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY},hypothesisId:'A'}); } catch {}
    // #endregion
    let supabase
    try {
      supabase = createSupabaseServerClient()
      // #region agent log
      await log({location:'sync/route.ts:394',message:'Supabase client created',data:{},hypothesisId:'A'})
      // #endregion
    } catch (supabaseError: any) {
      // #region agent log
      await log({location:'sync/route.ts:397',message:'Supabase client creation failed',data:{error:supabaseError?.message},hypothesisId:'A'})
      // #endregion
      console.error('[SYNC GET] Supabase client creation failed')
      return NextResponse.json(
        {
          error: 'Music library catalog unavailable',
          code: 'CATALOG_UNAVAILABLE',
          details: { reason: 'supabase_client', message: supabaseError?.message || null },
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const trackSelect = includeAnalysis
      ? 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,genre,subgenre,tags,track_number,disc_number,created_at,date,date_created,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at,metadata'
      : 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,genre,subgenre,tags,track_number,disc_number,created_at,date,date_created,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at,metadata'

    const fetchAllTracksPaged = async () => {
      const rows: any[] = []
      let from = 0
      for (;;) {
        let query = supabase
          .from('music_library_tracks')
          .select(trackSelect)
          .order('display_order', { ascending: true })
          .order('title', { ascending: true })
          .range(from, from + SYNC_TRACK_PAGE_SIZE - 1)
        if (!includeArchived) {
          query = query.or('is_archived.is.null,is_archived.eq.false')
        }
        const { data, error } = await query
        if (error) return { data: null as any[] | null, error }
        if (!data?.length) break
        rows.push(...data)
        if (data.length < SYNC_TRACK_PAGE_SIZE) break
        from += SYNC_TRACK_PAGE_SIZE
      }
      return { data: rows, error: null as null }
    }

    // Fetch folders, tracks, playlists, publish version in parallel (reduces TTFB)
    // #region agent log
    await log({location:'sync/route.ts:408',message:'Querying folders/tracks/playlists in parallel',data:{},hypothesisId:'B'})
    // #endregion
    let foldersRes, tracksRes, playlistsRes, publishVersion
    try {
      ;[foldersRes, tracksRes, playlistsRes, publishVersion] = await Promise.all([
        (async () => {
          let query = supabase
            .from('music_library_folders')
            .select(
              includeAnalysis
                ? '*'
                : 'id,name,type,parent_id,hidden,is_archived,archived_at,artwork_url,year,display_order,created_at,updated_at',
            )
          
          // Filter by archived status
          if (!includeArchived) {
            query = query.or('is_archived.is.null,is_archived.eq.false')
          }
          
          // Filter by hidden status - exclude hidden folders for frontend (non-admin) requests
          if (!includeHidden) {
            query = query.or('hidden.is.null,hidden.eq.false')
          }
          
          return query
            .order('display_order', { ascending: true })
            .order('name', { ascending: true })
        })(),
        fetchAllTracksPaged(),
        (includeArchived
          ? supabase
              .from('music_library_playlists')
              .select(
                includeAnalysis
                  ? '*'
                  : 'id,name,description,artwork_url,track_ids,is_archived,archived_at,created_at,updated_at',
              )
              .order('created_at', { ascending: false })
          : supabase
              .from('music_library_playlists')
              .select(
                includeAnalysis
                  ? '*'
                  : 'id,name,description,artwork_url,track_ids,is_archived,archived_at,created_at,updated_at',
              )
              .or('is_archived.is.null,is_archived.eq.false')
              .order('created_at', { ascending: false })),
        getMusicLibraryPublishVersion().catch(() => 0),
      ])
    } catch (queryError: any) {
      console.error('[SYNC GET] Database queries failed:', queryError)
      // #region agent log
      await log({location:'sync/route.ts:430',message:'Database queries failed',data:{error:queryError?.message},hypothesisId:'B'})
      // #endregion
      return NextResponse.json(
        {
          error: 'Music library catalog unavailable',
          code: 'CATALOG_UNAVAILABLE',
          details: { reason: 'query_throw', message: queryError?.message || null },
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const { data: folders, error: foldersError } = foldersRes
    const { data: tracks, error: tracksError } = tracksRes
    const { data: playlists, error: playlistsError } = playlistsRes
    // #region agent log
    await log({location:'sync/route.ts:443',message:'GET query results',data:{foldersCount:folders?.length||0,tracksCount:tracks?.length||0,playlistsCount:playlists?.length||0,hasFoldersError:!!foldersError,hasTracksError:!!tracksError,hasPlaylistsError:!!playlistsError},hypothesisId:'B'})
    // #endregion

    // Check for errors - if any query failed, return empty structure gracefully
    // Also check if the data itself is HTML (Supabase timeout returns HTML error page)
    const isHtmlError = (data: any) => {
      if (typeof data === 'string' && data.includes('<!DOCTYPE html>')) return true
      if (foldersError?.message?.includes('<!DOCTYPE html>')) return true
      if (tracksError?.message?.includes('<!DOCTYPE html>')) return true
      if (playlistsError?.message?.includes('<!DOCTYPE html>')) return true
      return false
    }
    
    if (foldersError || tracksError || playlistsError || isHtmlError(folders) || isHtmlError(tracks) || isHtmlError(playlists)) {
      console.error('[SYNC GET] Database query errors or HTML response detected:', { 
        foldersError: foldersError?.message?.substring(0, 100), 
        tracksError: tracksError?.message?.substring(0, 100), 
        playlistsError: playlistsError?.message?.substring(0, 100),
        foldersIsHtml: isHtmlError(folders),
        tracksIsHtml: isHtmlError(tracks),
        playlistsIsHtml: isHtmlError(playlists)
      })
      // #region agent log
      await log({location:'sync/route.ts:450',message:'Database query errors or HTML response detected',data:{hasFoldersError:!!foldersError,hasTracksError:!!tracksError,hasPlaylistsError:!!playlistsError},hypothesisId:'B'})
      // #endregion
      return NextResponse.json(
        {
          error: 'Music library catalog unavailable',
          code: 'CATALOG_UNAVAILABLE',
          details: {
            folders: foldersError?.message?.substring(0, 200) || null,
            tracks: tracksError?.message?.substring(0, 200) || null,
            playlists: playlistsError?.message?.substring(0, 200) || null,
          },
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
          },
        },
      )
    }

    // DNA/waveform are never attached on list sync — fetch per selected track via
    // /api/audio/sonic-dna and /api/audio/waveform only.

    // Build hierarchical structure
    const folderMap = new Map()
    const rootFolders: any[] = []

    // Create folder objects
    folders?.forEach((folder: any) => {
      const folderObj = {
        id: folder.id,
        name: folder.name,
        type: folder.type,
        parentId: folder.parent_id,
        hidden: folder.hidden,
        artwork: folder.artwork_url,
        year: folder.year,
        children: [],
        tracks: []
      }
      folderMap.set(folder.id, folderObj)

      if (!folder.parent_id) {
        rootFolders.push(folderObj)
      }
    })

    // Build parent-child relationships
    folders?.forEach((folder: any) => {
      if (folder.parent_id) {
        const parent = folderMap.get(folder.parent_id)
        const child = folderMap.get(folder.id)
        if (parent && child) {
          parent.children.push(child)
        }
      }
    })

    // Build track map for reference resolution
    const allTracksMap = new Map() // Tracks in "All Tracks" folder
    
    // First pass: collect "All Tracks" tracks
    tracks?.forEach((track: any) => {
      if (track.folder_id === 'folder-all-tracks') {
        allTracksMap.set(track.id, track)
      }
    })

    // Add tracks to folders (metadata only — no DNA/waveform blobs)
    tracks?.forEach((track: any) => {
      const folder = folderMap.get(track.folder_id)
      if (!folder) {
        // #region agent log
        log({location:'sync/route.ts:454',message:'Track orphaned - folder not found',data:{trackId:track.id,folderId:track.folder_id},hypothesisId:'E'}).catch(()=>{})
        // #endregion
        return
      }

      // Check if this is a reference track (subfolder of All Tracks)
      const isReference = track.metadata && 
                         typeof track.metadata === 'object' && 
                         track.metadata.referencesAllTracks &&
                         track.metadata.originalTrackId

      // If it's a reference, use the original track from "All Tracks"
      let trackToUse = track
      if (isReference && track.metadata.originalTrackId) {
        const originalTrack = allTracksMap.get(track.metadata.originalTrackId)
        if (originalTrack) {
          trackToUse = originalTrack
        }
      }

      // Skip reference tracks in "All Tracks" folder itself (they're duplicates)
      if (isReference && folder.id === 'folder-all-tracks') {
        return
      }

      const trackId = isReference ? trackToUse.id : track.id

      // Check if this track already exists in this folder (avoid duplicates)
      const existingTrack = folder.tracks.find((t: any) => t.id === trackId)
      if (existingTrack) {
        return // Skip duplicate
      }

      folder.tracks.push({
        id: trackId,
        audioFileId: trackToUse.audio_file_id || null,
        title: trackToUse.title,
        artist: trackToUse.artist,
        duration: trackToUse.duration,
        file: trackToUse.file_url,
        artwork: trackToUse.artwork_url,
        bpm: trackToUse.bpm,
        key_signature: trackToUse.key_signature,
        energy_level: trackToUse.energy_level,
        danceability: trackToUse.danceability,
        genre: trackToUse.genre,
        subgenre: trackToUse.subgenre,
        tags: trackToUse.tags,
        track_number: trackToUse.track_number,
        disc_number: trackToUse.disc_number,
        created_at: trackToUse.created_at,
        date: trackToUse.date,
        date_created: trackToUse.date_created,
        year: trackToUse.year,
        metadata: trackToUse.metadata,
      })
    })

    // Map playlists to frontend format
    const playlistsFormatted = (playlists || []).map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || undefined,
      artwork: playlist.artwork_url || undefined,
      trackIds: playlist.track_ids || [],
      createdAt: playlist.created_at,
      is_archived: playlist.is_archived,
      archived_at: playlist.archived_at,
    }))

    // #region agent log
    await log({location:'sync/route.ts:390',message:'GET /api/music-library/sync success',data:{foldersCount:rootFolders.length,playlistsCount:playlistsFormatted.length},hypothesisId:'A'})
    // #endregion
    const payload = {
      description: 'Music library exported from database',
      version: publishVersion || 0,
      folders: rootFolders,
      playlists: playlistsFormatted,
    }

    if (!includeAnalysis && !includeArchived && !includeHidden && publishVersion) {
      const entry = setCatalogSnapshot('sync', publishVersion, 'public', payload)
      return new NextResponse(entry.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: entry.etag,
          'Cache-Control': 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
          Vary: 'Cookie',
        },
      })
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Content-Type': 'application/json',
      },
    })
  } catch (error: any) {
    console.error('[SYNC GET] Caught error:', error)
    console.error('[SYNC GET] Error message:', error?.message)
    console.error('[SYNC GET] Error stack:', error?.stack)
    // #region agent log
    try { await log({location:'sync/route.ts:662',message:'GET /api/music-library/sync error',data:{errorMessage:error?.message,errorStack:error?.stack?.substring(0,500),errorName:error?.name,errorCode:error?.code},hypothesisId:'D'}); } catch (e) { console.error('[SYNC GET] Log write failed:', e) }
    // #endregion
    return NextResponse.json(
      { 
        error: error.message || 'Failed to export music library',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
