import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { getMusicVaultApiAccess } from '@/lib/music-vault-access'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

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
const log = async (obj: any) => { 
  try { 
    const logPath = getLogPath()
    await appendFile(logPath, JSON.stringify({...obj,timestamp:Date.now(),sessionId:'debug-session',runId:'run1'})+'\n'); 
  } catch (logError) {
    // Silently fail logging to prevent crashes - use console as fallback
    console.error('Log write failed:', logError)
  }
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
        : 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,created_at,date,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at'
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

              if (folder.id === 'folder-all-tracks') {
                // All Tracks: use original ID, store complete track data
                trackId = track.id
                
                // Preserve existing audio_file_id if track already exists
                let preservedAudioFileId = null
                let preservedAnalysis: any = {}
                try {
                  const { data: existingTrack } = await supabase
                    .from('music_library_tracks')
                    .select('audio_file_id, sonic_dna, bpm, key_signature, waveform, energy_level, danceability, duration, artwork_url, created_at, date, year')
                    .eq('id', trackId)
                    .maybeSingle()
                  if (existingTrack?.audio_file_id) {
                    preservedAudioFileId = existingTrack.audio_file_id
                  }
                  if (existingTrack) {
                    preservedAnalysis = existingTrack
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
                  // Preserve audio_file_id if it exists elsewhere
                  let preservedAudioFileId = null
                  try {
                    const { data: existingTrackAnywhere } = await supabase
                      .from('music_library_tracks')
                      .select('audio_file_id')
                      .eq('id', track.id)
                      .not('audio_file_id', 'is', null)
                      .maybeSingle()
                    if (existingTrackAnywhere?.audio_file_id) {
                      preservedAudioFileId = existingTrackAnywhere.audio_file_id
                    }
                  } catch (e) {
                    // If lookup fails, continue with null
                  }
                  
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
                    year: track.year || null,
                    display_order: 0,
                    metadata: {}
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
                    .select('audio_file_id, sonic_dna, bpm, key_signature, waveform, energy_level, danceability, duration, artwork_url, created_at, date, year')
                    .eq('id', trackId)
                    .maybeSingle()
                  if (existingTrack?.audio_file_id) {
                    preservedAudioFileId = existingTrack.audio_file_id
                  }
                  if (existingTrack) {
                    preservedAnalysis = existingTrack
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
      // Return empty structure instead of throwing - allows admin panel to load
      console.error('[SYNC GET] Supabase client creation failed, returning empty structure')
      return NextResponse.json({
        description: 'Music library (Supabase unavailable)',
        folders: [],
        playlists: [],
      }, {
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
        },
      })
    }

    // Fetch folders, tracks, playlists in parallel (reduces TTFB)
    // #region agent log
    await log({location:'sync/route.ts:408',message:'Querying folders/tracks/playlists in parallel',data:{},hypothesisId:'B'})
    // #endregion
    let foldersRes, tracksRes, playlistsRes
    try {
      [foldersRes, tracksRes, playlistsRes] = await Promise.all([
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
        (includeArchived
          ? supabase
              .from('music_library_tracks')
              .select(
                includeAnalysis
                  ? 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,created_at,date,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at,metadata'
                  : 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,created_at,date,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at',
              )
              .order('display_order', { ascending: true })
              .order('title', { ascending: true })
          : supabase
              .from('music_library_tracks')
              .select(
                includeAnalysis
                  ? 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,created_at,date,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at,metadata'
                  : 'id,folder_id,audio_file_id,title,artist,duration,file_url,artwork_url,bpm,key_signature,energy_level,danceability,created_at,date,year,is_archived,archived_at,display_order,created_at_timestamp,updated_at',
              )
              .or('is_archived.is.null,is_archived.eq.false')
              .order('display_order', { ascending: true })
              .order('title', { ascending: true })),
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
      ])
    } catch (queryError: any) {
      // If queries fail (e.g., Supabase timeout), return empty structure
      console.error('[SYNC GET] Database queries failed:', queryError)
      // #region agent log
      await log({location:'sync/route.ts:430',message:'Database queries failed',data:{error:queryError?.message},hypothesisId:'B'})
      // #endregion
      return NextResponse.json({
        description: 'Music library (Supabase unavailable)',
        folders: [],
        playlists: [],
      }, {
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
        },
      })
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
      // Return empty structure instead of throwing - allows admin panel to load
      return NextResponse.json({
        description: 'Music library (Supabase unavailable)',
        folders: [],
        playlists: [],
      }, {
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
        },
      })
    }

    // Optional: include analysis blobs (expensive). Off by default for the public player.
    const sonicDNACacheByTrackId = new Map<string, any>()
    const sonicDNACacheByAudioFileId = new Map<string, any>()
    const audioFilesMetaMap = new Map<string, any>()
    const audioFilesFullMap = new Map<string, any>()

    const hasAnalysisData = (sonicDna: any): boolean => {
      if (!sonicDna) return false
      try {
        const dna = typeof sonicDna === 'string' ? JSON.parse(sonicDna) : sonicDna
        if (dna.status && dna.hasData && !dna.genres && !dna.musical && !dna.technical && !dna.drums && !dna.comprehensive) {
          return false
        }
        return !!(dna.genres || dna.musical || dna.technical || dna.drums || dna.comprehensive)
      } catch {
        return false
      }
    }

    if (includeAnalysis) {
      // Cache-first Sonic DNA: fetch cached sonic_dna + analysis fields by track_id
      const trackIds = (tracks || []).map((t: any) => t.id)

      if (trackIds.length > 0) {
        const { data: cachedRows } = await supabase
          .from('sonic_dna_cache')
          .select('track_id, audio_file_id, sonic_dna, bpm, key_signature, energy_level, danceability')
          .in('track_id', trackIds)

        cachedRows?.forEach((row: any) => {
          sonicDNACacheByTrackId.set(row.track_id, row)
          if (row.audio_file_id) {
            sonicDNACacheByAudioFileId.set(row.audio_file_id, row)
          }
        })
      }

      // Get all audio_file_ids (for waveform/duration/artwork + fallback sonic_dna)
      const audioFileIds = (tracks || [])
        .filter((track: any) => track && track.audio_file_id)
        .map((track: any) => track.audio_file_id)
        .filter((id: any) => id != null)

      if (audioFileIds.length > 0) {
        const { data: audioMeta } = await supabase
          .from('audio_files')
          .select('id, waveform_data, duration_seconds, artwork_url, created_at, metadata')
          .in('id', audioFileIds)

        audioMeta?.forEach((file: any) => {
          audioFilesMetaMap.set(file.id, file)
        })
      }

      const missingAudioFileIds = audioFileIds.filter(
        (id: string) => !sonicDNACacheByAudioFileId.has(id),
      )

      if (missingAudioFileIds.length > 0) {
        const { data: audioFull } = await supabase
          .from('audio_files')
          .select('id, sonic_dna, bpm, key_signature, energy_level, danceability')
          .in('id', missingAudioFileIds)

        audioFull?.forEach((file: any) => {
          audioFilesFullMap.set(file.id, file)
        })
      }
    }

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

    // Add tracks to folders - prefer sonic_dna_cache + fallback to audio_files data
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

      // Prefer audio_files data as source of truth (it has the most complete Sonic DNA analysis)
      let sonicDna = trackToUse.sonic_dna
      let bpm = trackToUse.bpm
      let keySignature = trackToUse.key_signature
      let energyLevel = trackToUse.energy_level
      let danceability = trackToUse.danceability
      let waveform = trackToUse.waveform
      let duration = trackToUse.duration
      let artwork = trackToUse.artwork_url

      // Fast path: cache first (by track id or audio file id)
      const cached = sonicDNACacheByTrackId.get(trackToUse.id) ||
        (trackToUse.audio_file_id ? sonicDNACacheByAudioFileId.get(trackToUse.audio_file_id) : null)

      if (cached?.sonic_dna) {
        sonicDna = cached.sonic_dna
        if (cached.bpm !== null && cached.bpm !== undefined) bpm = cached.bpm
        if (cached.key_signature) keySignature = cached.key_signature
        if (cached.energy_level !== null && cached.energy_level !== undefined) energyLevel = cached.energy_level
        if (cached.danceability !== null && cached.danceability !== undefined) danceability = cached.danceability
      }

      // Always merge lightweight audio meta (waveform/duration/artwork) if available
      if (trackToUse.audio_file_id && audioFilesMetaMap.has(trackToUse.audio_file_id)) {
        const audioMeta = audioFilesMetaMap.get(trackToUse.audio_file_id)
        if (audioMeta.waveform_data) waveform = audioMeta.waveform_data
        if (audioMeta.duration_seconds) duration = audioMeta.duration_seconds
        if (audioMeta.artwork_url) artwork = audioMeta.artwork_url
      }

      // Fallback: if cache miss and we have a full audio row, prefer it
      if (
        (!cached || !cached.sonic_dna) &&
        trackToUse.audio_file_id &&
        audioFilesFullMap.has(trackToUse.audio_file_id)
      ) {
        const audioFile = audioFilesFullMap.get(trackToUse.audio_file_id)
        // Always prefer audio_files sonic_dna if it has actual analysis data
        if (audioFile.sonic_dna && hasAnalysisData(audioFile.sonic_dna)) {
          sonicDna = audioFile.sonic_dna
        } else if (!trackToUse.sonic_dna || !hasAnalysisData(trackToUse.sonic_dna)) {
          // If track doesn't have analysis data, use audio_file even if it's just status
          if (audioFile.sonic_dna) {
            sonicDna = audioFile.sonic_dna
          }
        }
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
      }

      // For subfolders of "All Tracks", we want to show tracks but they reference "All Tracks"
      // So we add them, but they'll use the original track ID (not the reference ID)
      const trackId = isReference ? trackToUse.id : track.id

      // Only add track if it's not a duplicate reference in "All Tracks" folder itself
      // (reference tracks in All Tracks are skipped above, so this is safe)
      
      // Check if this track already exists in this folder (avoid duplicates)
      const existingTrack = folder.tracks.find((t: any) => t.id === trackId)
      if (existingTrack) {
        return // Skip duplicate
      }

      const trackOut: any = {
        id: trackId,
        audioFileId: trackToUse.audio_file_id || null,
        title: trackToUse.title,
        artist: trackToUse.artist,
        duration: duration || trackToUse.duration,
        file: trackToUse.file_url,
        artwork: artwork || trackToUse.artwork_url,
        bpm: bpm,
        key_signature: keySignature,
        energy_level: energyLevel,
        danceability: danceability,
        created_at: trackToUse.created_at,
        date: trackToUse.date,
        year: trackToUse.year
      }

      if (includeAnalysis) {
        trackOut.sonic_dna = sonicDna
        trackOut.waveform = waveform
      }

      folder.tracks.push(trackOut)
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
    return NextResponse.json(
      {
        description: 'Music library exported from database',
        folders: rootFolders,
        playlists: playlistsFormatted,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Content-Type': 'application/json',
        },
      },
    )
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
