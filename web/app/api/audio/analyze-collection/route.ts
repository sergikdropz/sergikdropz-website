import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { generateSonicDNAWithAgents } from '@/utils/generateSonicDNAWithAgents'
import { mergeSonicDNAIntoMetadata } from '@/utils/mergeSonicDNAIntoMetadata'
import { updateSonicDNACache } from '@/utils/sonicDNACache'
import { requireAdminApi } from '@/lib/auth/route-policy'
import { findAudioFile } from '@/lib/findAudioFile'
import { lockAnalysisForAudioFile } from '@/lib/catalog-lock'

export const dynamic = 'force-dynamic'

const AUDIO_SELECT =
  'id, title, artist, file_url, file_path, bpm, key_signature, duration_seconds, energy_level, danceability, frequency_bands, waveform_data, waveform_samples, artwork_url, metadata, sonic_dna_status'

type CollectionType = 'ep' | 'album' | 'playlist' | 'folder'

/**
 * POST /api/audio/analyze-collection
 * Queue full Sonic DNA (agent pipeline) for every track on an EP, album, or playlist.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const folderId = typeof body.folderId === 'string' ? body.folderId.trim() : ''
    const playlistId = typeof body.playlistId === 'string' ? body.playlistId.trim() : ''
    const libraryTrackId = typeof body.libraryTrackId === 'string' ? body.libraryTrackId.trim() : ''
    const collectionName = typeof body.collectionName === 'string' ? body.collectionName.trim() : ''
    const collectionType = (body.collectionType || 'folder') as CollectionType
    const force = body.force !== false

    if (!folderId && !playlistId && !libraryTrackId) {
      return NextResponse.json({ error: 'folderId, playlistId, or libraryTrackId is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const libraryTracks = await loadCollectionTracks(supabase, { folderId, playlistId, libraryTrackId })

    if (!libraryTracks.length) {
      return NextResponse.json(
        { error: 'No tracks found on this collection', queued: 0, total: 0 },
        { status: 404 },
      )
    }

    const audioRows: any[] = []
    const seen = new Set<string>()
    for (const lib of libraryTracks) {
      const audio = (await findAudioFile(supabase, {
        trackId: lib.audio_file_id || lib.id,
        path: lib.file_url || null,
        select: AUDIO_SELECT,
      })) as { id?: string; sonic_dna_status?: string } | null
      if (!audio?.id || seen.has(audio.id)) continue
      seen.add(audio.id)
      if (!force && audio.sonic_dna_status === 'completed') continue
      audioRows.push(audio)
    }

    const extraDirective = typeof body.directive === 'string' ? body.directive.trim() : ''
    const kindLabel = collectionType === 'ep' ? 'EP' : collectionType === 'album' ? 'album' : collectionType === 'playlist' ? 'playlist' : libraryTrackId ? 'track' : 'collection'
    const title = collectionName || kindLabel
    const baseDirective = libraryTrackId
      ? [
          `Analyze this single track "${title}" from audio.`,
          'Produce full Sonic DNA (BPM, key, energy, genre/subgenre, drums, mood, technical).',
          'Genre must come from drum pattern, tempo/feel, bass, and percussion — never folder or title keywords.',
        ].join(' ')
      : [
          `This track belongs to the ${kindLabel} "${title}" (${libraryTracks.length} tracks).`,
          'Analyze it as part of that collection: shared palette, energy arc, sequencing, and how this cut sits with the others.',
          'Produce full Sonic DNA (BPM, key, energy, genre/subgenre, drums, mood, technical).',
        ].join(' ')
    const directive = extraDirective ? `${baseDirective} User review notes: ${extraDirective}` : baseDirective

    analyzeCollectionBatch(audioRows, supabase, directive).catch((err) => {
      console.error('[analyze-collection] batch failed', err)
    })

    return NextResponse.json({
      success: true,
      status: 'processing',
      message: `Queued Sonic DNA analysis for ${audioRows.length} track${audioRows.length === 1 ? '' : 's'} on ${title}`,
      queued: audioRows.length,
      skipped: libraryTracks.length - audioRows.length,
      total: libraryTracks.length,
      collectionName: title,
      collectionType,
    })
  } catch (error: any) {
    console.error('[analyze-collection]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to start collection analysis' },
      { status: 500 },
    )
  }
}

async function loadCollectionTracks(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  opts: { folderId: string; playlistId: string; libraryTrackId?: string },
) {
  const select = 'id, title, artist, audio_file_id, file_url, folder_id'

  if (opts.libraryTrackId) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select(select)
      .eq('id', opts.libraryTrackId)
      .maybeSingle()
    if (error) throw error
    return data ? [data] : []
  }

  if (opts.folderId) {
    const { data, error } = await supabase
      .from('music_library_tracks')
      .select(select)
      .eq('folder_id', opts.folderId)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('display_order', { ascending: true })
    if (error) throw error
    if (data?.length) return data
  }

  if (opts.playlistId) {
    const { data: playlist, error } = await supabase
      .from('music_library_playlists')
      .select('id, track_ids')
      .eq('id', opts.playlistId)
      .maybeSingle()
    if (error) throw error
    const ids: string[] = Array.isArray(playlist?.track_ids) ? playlist.track_ids : []
    if (!ids.length) return []
    const { data: tracks, error: tracksError } = await supabase
      .from('music_library_tracks')
      .select(select)
      .in('id', ids)
    if (tracksError) throw tracksError
    const byId = new Map((tracks || []).map((t: any) => [t.id, t]))
    return ids.map((id) => byId.get(id)).filter(Boolean)
  }

  return []
}

async function analyzeCollectionBatch(tracks: any[], supabase: any, directive: string) {
  const batchSize = 2
  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize)
    await Promise.all(batch.map((track) => analyzeOne(track, supabase, directive)))
  }
}

async function analyzeOne(track: any, supabase: any, directive: string) {
  try {
    const { data: fresh, error: freshErr } = await supabase
      .from('audio_files')
      .select(AUDIO_SELECT)
      .eq('id', track.id)
      .maybeSingle()
    if (freshErr || !fresh) throw new Error(freshErr?.message || 'Audio file not found')

    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'processing',
        sonic_dna_analyzed_at: new Date().toISOString(),
      })
      .eq('id', fresh.id)

    let sonicDNA = await generateSonicDNAWithAgents(
      fresh.title,
      fresh.artist,
      fresh.id,
      {
        bpm: fresh.bpm,
        key: fresh.key_signature,
        duration: fresh.duration_seconds || 0,
        energyLevel: fresh.energy_level,
        frequencyBands: fresh.frequency_bands,
        audioFileUrl: fresh.file_url || fresh.file_path || null,
        filePath: fresh.file_path || null,
        waveformData:
          fresh.waveform_data && Array.isArray(fresh.waveform_data) && fresh.waveform_data.length > 0
            ? fresh.waveform_data
            : undefined,
        waveformSamples: fresh.waveform_samples || undefined,
      },
      directive,
    )

    let analysisData = {
      bpm: sonicDNA.technical?.bpm || fresh.bpm || null,
      key_signature:
        sonicDNA.harmony?.keySignature || sonicDNA.technical?.key?.key || fresh.key_signature || null,
      energy_level: sonicDNA.technical?.energyLevel || fresh.energy_level || null,
      danceability: sonicDNA.technical?.danceability || null,
      waveform_data: sonicDNA.waveform?.data || fresh.waveform_data || null,
      waveform_samples: sonicDNA.waveform?.samples || fresh.waveform_samples || null,
      duration_seconds: fresh.duration_seconds || null,
      artwork_url: fresh.artwork_url || null,
    }

    const locked = await lockAnalysisForAudioFile(supabase, fresh.id, sonicDNA, analysisData)
    sonicDNA = locked.sonicDNA
    analysisData = locked.analysisData

    const updatedMetadata = mergeSonicDNAIntoMetadata(fresh.metadata || {}, sonicDNA, analysisData)

    const { error: updateError } = await supabase
      .from('audio_files')
      .update({
        sonic_dna: sonicDNA,
        sonic_dna_status: 'completed',
        sonic_dna_analyzed_at: new Date().toISOString(),
        ai_analysis: sonicDNA,
        sonic_dna_error: null,
        bpm: analysisData.bpm,
        key_signature: analysisData.key_signature,
        energy_level: analysisData.energy_level,
        danceability: analysisData.danceability,
        waveform_data: analysisData.waveform_data,
        waveform_samples: analysisData.waveform_samples,
        metadata: updatedMetadata,
      })
      .eq('id', fresh.id)

    if (updateError) throw new Error(updateError.message)

    const { data: linkedTracks } = await supabase
      .from('music_library_tracks')
      .select('id')
      .eq('audio_file_id', fresh.id)

    for (const linked of linkedTracks || []) {
      await updateSonicDNACache(linked.id, fresh.id, sonicDNA, {
        bpm: analysisData.bpm,
        key_signature: analysisData.key_signature,
        energy_level: analysisData.energy_level,
        danceability: analysisData.danceability,
      })
    }
  } catch (error: any) {
    console.error(`[analyze-collection] ${track?.title || track?.id}:`, error?.message)
    await supabase
      .from('audio_files')
      .update({
        sonic_dna_status: 'failed',
        sonic_dna_error: error?.message || 'Collection analysis failed',
        sonic_dna_analyzed_at: new Date().toISOString(),
      })
      .eq('id', track.id)
  }
}
