import { NextRequest, NextResponse } from 'next/server'
import { basename } from 'path'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import {
  resolveOriginalFileDate,
  vaultRelativePathFromFileUrl,
} from '@/lib/audio/original-file-date'
import { getExportsRoot, loadExportFolderIndex } from '@/lib/audio/export-folder-dates'
import { createdDateFromTrack } from '@/lib/music-library/track-created-date'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const EXPORT_SOURCES = new Set(['export_folder_birthtime', 'export_folder_mtime'])

/**
 * POST /api/music-library/tracks/fill-original-dates
 * Body: {
 *   trackIds?: string[],
 *   all?: boolean,
 *   onlyMissing?: boolean,  // skip only when already from Exports folder
 *   force?: boolean         // overwrite any existing original_date
 * }
 *
 * Sets year + metadata.original_date from Exports SERGIK root creation dates
 * (not vault import day). Does NOT set release `date`.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const body = await request.json().catch(() => ({}))
    const all = body.all === true
    const force = body.force === true
    const onlyMissing = force ? false : body.onlyMissing !== false
    let trackIds = Array.isArray(body.trackIds)
      ? body.trackIds.map((id: unknown) => String(id || '')).filter(Boolean)
      : []

    const supabase = createSupabaseServerClient()

    if (all && !trackIds.length) {
      const { data: allRows, error: allErr } = await supabase
        .from('music_library_tracks')
        .select('id')
        .or('is_archived.is.null,is_archived.eq.false')
      if (allErr) {
        return NextResponse.json({ error: allErr.message }, { status: 500 })
      }
      trackIds = (allRows || []).map((r: { id: string }) => r.id)
    }

    if (!trackIds.length) {
      return NextResponse.json({ error: 'trackIds required (or all: true)' }, { status: 400 })
    }
    if (trackIds.length > 2000) {
      return NextResponse.json({ error: 'Max 2000 tracks per request' }, { status: 400 })
    }

    // Warm export index once (no-op if volume missing — resolve falls back)
    const exportsRoot = getExportsRoot()
    let exportFileCount = 0
    try {
      const idx = await loadExportFolderIndex(exportsRoot)
      exportFileCount = idx.count
    } catch {
      exportFileCount = 0
    }

    const { data: tracks, error } = await supabase
      .from('music_library_tracks')
      .select('id, title, artist, year, date, date_created, file_url, audio_file_id, metadata')
      .in('id', trackIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const audioIds = [...new Set((tracks || []).map((t: any) => t.audio_file_id).filter(Boolean))]
    const pathByAudioId = new Map<string, string>()
    if (audioIds.length) {
      const { data: audioRows } = await supabase
        .from('audio_files')
        .select('id, file_path, file_url')
        .in('id', audioIds)
      for (const row of audioRows || []) {
        if (row.file_path) pathByAudioId.set(row.id, row.file_path)
        else if (row.file_url) {
          const rel = vaultRelativePathFromFileUrl(row.file_url)
          if (rel) pathByAudioId.set(row.id, rel)
        }
      }
    }

    const updated: {
      trackId: string
      title: string
      year: number
      date: string
      source: string
      exportPath?: string
    }[] = []
    const skipped: { trackId: string; reason: string }[] = []

    for (const track of tracks || []) {
      const prevMeta =
        track.metadata && typeof track.metadata === 'object' && !Array.isArray(track.metadata)
          ? (track.metadata as Record<string, unknown>)
          : {}
      const hasCreatedDate = Boolean(createdDateFromTrack(track))
      const existingSource = String(prevMeta.original_date_source || '')
      const hasTrustedExportDate =
        hasCreatedDate && EXPORT_SOURCES.has(existingSource)

      if (onlyMissing && hasCreatedDate) {
        skipped.push({
          trackId: track.id,
          reason: hasTrustedExportDate ? 'already_has_export_original_date' : 'already_has_created_date',
        })
        continue
      }

      const metaPath =
        typeof prevMeta.file_path === 'string' ? prevMeta.file_path : null
      const vaultRelativePath =
        (track.audio_file_id && pathByAudioId.get(track.audio_file_id)) ||
        metaPath ||
        vaultRelativePathFromFileUrl(track.file_url)

      const fileName = vaultRelativePath
        ? basename(vaultRelativePath)
        : track.file_url
          ? basename(String(track.file_url).split('?')[0])
          : undefined

      const original = await resolveOriginalFileDate({
        fileUrl: track.file_url,
        vaultRelativePath,
        fileName,
        title: track.title,
        artist: track.artist,
      })

      if (!original) {
        skipped.push({ trackId: track.id, reason: 'no_file_date' })
        continue
      }

      const { error: upErr } = await supabase
        .from('music_library_tracks')
        .update({
          year: original.year,
          date_created: original.isoDate,
          metadata: {
            ...prevMeta,
            original_date: original.isoDate,
            original_date_source: original.source,
            ...(original.exportPath
              ? { original_date_export_path: original.exportPath }
              : {}),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', track.id)

      if (upErr) {
        skipped.push({ trackId: track.id, reason: upErr.message })
        continue
      }

      updated.push({
        trackId: track.id,
        title: track.title,
        year: original.year,
        date: original.isoDate,
        source: original.source,
        exportPath: original.exportPath,
      })
    }

    return NextResponse.json({
      success: true,
      exportsRoot,
      exportFileCount,
      updated,
      skipped,
      updatedCount: updated.length,
      skippedCount: skipped.length,
    })
  } catch (err: any) {
    console.error('fill-original-dates error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to fill original dates' },
      { status: 500 },
    )
  }
}
