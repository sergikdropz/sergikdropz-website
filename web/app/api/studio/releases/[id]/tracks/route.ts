import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import {
  indexVaultLinks,
  isStudioVaultLibraryFolderType,
  studioVaultCatalogKind,
  studioVaultCatalogLabel,
  STUDIO_VAULT_LIBRARY_FOLDER_TYPES,
  vaultLinkForTrack,
  vaultTrackAvailability,
} from '@/lib/studio/vault-picker'
import {
  enrichDistributionTracksWithVaultIdentity,
  persistDistributionTrackIdentitiesFromVault,
} from '@/lib/studio/vault-import-server'
import { linkDspMastersForRelease } from '@/lib/studio/link-dsp-masters-server'

/**
 * GET /api/studio/releases/[id]/tracks?available=true
 * Tracks not linked to any release (for picker).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const available = searchParams.get('available') === 'true'
    const source = searchParams.get('source') || 'studio'

    const supabase = createSupabaseServerClient()

    if (!available) {
      const { data, error } = await supabase
        .from('distribution_tracks')
        .select('*')
        .eq('release_id', params.id)
        .order('created_at', { ascending: true })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const tracks = await enrichDistributionTracksWithVaultIdentity(
        supabase,
        (data || []) as Array<Record<string, unknown>>,
      )
      return NextResponse.json({ tracks })
    }

    if (source === 'vault') {
      const q = (searchParams.get('q') || '').trim().toLowerCase()
      const kindRaw = (searchParams.get('kind') || 'all').toLowerCase()
      const kind = kindRaw === 'single' || kindRaw === 'ep' ? kindRaw : 'all'

      const { data: folders, error: folderError } = await supabase
        .from('music_library_folders')
        .select('id, name, type, is_archived, hidden')
        .in('type', [...STUDIO_VAULT_LIBRARY_FOLDER_TYPES])
        .or('is_archived.is.null,is_archived.eq.false')
        .order('name', { ascending: true })
        .limit(400)

      if (folderError) {
        return NextResponse.json({ error: folderError.message }, { status: 500 })
      }

      const catalogFolders = (folders || []).filter((folder) => {
        if (!isStudioVaultLibraryFolderType(folder.type)) return false
        if (folder.hidden === true) return false
        if (kind !== 'all' && studioVaultCatalogKind(folder.type) !== kind) return false
        return true
      })
      const folderById = new Map(catalogFolders.map((folder) => [folder.id, folder]))
      const folderIds = catalogFolders.map((folder) => folder.id)

      if (!folderIds.length) {
        return NextResponse.json({ tracks: [], scanned: 0, linked: 0, folders: 0 })
      }

      const linkRows: Array<{
        music_library_track_id?: string | null
        release_id?: string | null
        release_title?: string | null
      }> = []
      for (let from = 0; from < 20_000; from += 1000) {
        const { data, error: linkError } = await supabase
          .from('distribution_tracks')
          .select('music_library_track_id, release_id')
          .not('music_library_track_id', 'is', null)
          .range(from, from + 999)
        if (linkError) {
          return NextResponse.json({ error: linkError.message }, { status: 500 })
        }
        if (!data?.length) break
        linkRows.push(...data)
        if (data.length < 1000) break
      }
      const releaseIds = [
        ...new Set(
          linkRows
            .map((row) => (row.release_id ? String(row.release_id) : ''))
            .filter(Boolean),
        ),
      ]
      const titleByReleaseId = new Map<string, string>()
      for (let i = 0; i < releaseIds.length; i += 80) {
        const slice = releaseIds.slice(i, i + 80)
        const { data: releaseRows, error: releaseError } = await supabase
          .from('distribution_releases')
          .select('id, title')
          .in('id', slice)
        if (releaseError) {
          return NextResponse.json({ error: releaseError.message }, { status: 500 })
        }
        for (const row of releaseRows || []) {
          if (row.id && row.title) titleByReleaseId.set(String(row.id), String(row.title))
        }
      }
      const links = indexVaultLinks(
        linkRows.map((row) => ({
          ...row,
          release_title: row.release_id
            ? titleByReleaseId.get(String(row.release_id)) || null
            : null,
        })),
      )

      const vaultTracks: Array<{
        id: string
        title: string | null
        folder_id: string | null
        file_url: string | null
        artwork_url: string | null
        duration: number | null
        genre: string | null
      }> = []
      const chunk = 80
      for (let i = 0; i < folderIds.length; i += chunk) {
        const slice = folderIds.slice(i, i + chunk)
        for (let from = 0; from < 20_000; from += 1000) {
          const { data, error } = await supabase
            .from('music_library_tracks')
            .select('id, title, folder_id, file_url, artwork_url, duration, genre, is_archived')
            .in('folder_id', slice)
            .or('is_archived.is.null,is_archived.eq.false')
            .order('title', { ascending: true })
            .range(from, from + 999)
          if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
          }
          vaultTracks.push(...((data || []) as typeof vaultTracks))
          if (!data || data.length < 1000) break
        }
      }

      const tracks = vaultTracks
        .map((t) => {
          const folder = t.folder_id ? folderById.get(t.folder_id) : null
          if (!folder) return null
          const availability = vaultTrackAvailability(t.id, params.id, links)
          if (availability === 'on_this_release') return null
          const parked = availability === 'on_other_release' ? vaultLinkForTrack(t.id, links) : null
          const folderName = String(folder.name || '')
          const folderType = String(folder.type || 'ep')
          if (q) {
            const hay = `${t.title || ''} ${folderName} ${t.genre || ''}`.toLowerCase()
            if (!hay.includes(q)) return null
          }
          return {
            id: t.id,
            title: t.title || 'Untitled',
            source: 'vault' as const,
            folder_id: t.folder_id,
            folder_name: folderName,
            folder_type: folderType,
            catalog_kind: studioVaultCatalogKind(folderType),
            catalog_label: studioVaultCatalogLabel(folderType),
            isrc_full: null,
            wav_url: t.file_url,
            artwork_url: t.artwork_url,
            duration: t.duration,
            genre: t.genre,
            availability,
            availability_release_id: parked?.releaseId || null,
            availability_release_title: parked?.releaseTitle || null,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((a, b) => {
          const kindRank = a.catalog_kind === 'ep' && b.catalog_kind !== 'ep' ? -1 : a.catalog_kind !== 'ep' && b.catalog_kind === 'ep' ? 1 : 0
          if (kindRank) return kindRank
          const folderCmp = a.folder_name.localeCompare(b.folder_name)
          if (folderCmp) return folderCmp
          return a.title.localeCompare(b.title)
        })

      return NextResponse.json({
        tracks,
        scanned: vaultTracks.length,
        linked: links.filter((l) => Boolean(l.releaseId)).length,
        folders: folderIds.length,
      })
    }

    const { data, error } = await supabase
      .from('distribution_tracks')
      .select('id, title, isrc_full, wav_url, version, release_id, created_at, music_library_track_id')
      .is('release_id', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tracks: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tracks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/studio/releases/[id]/tracks
 * Attach unassigned tracks to this release. Body: { trackIds: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const trackIds = Array.isArray(body.trackIds) ? body.trackIds.map(String) : []
    const vaultTrackIds = Array.isArray(body.vaultTrackIds)
      ? body.vaultTrackIds.map(String)
      : []

    if (trackIds.length === 0 && vaultTrackIds.length === 0) {
      return NextResponse.json(
        { error: 'trackIds or vaultTrackIds array is required' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()

    const { data: release, error: releaseError } = await supabase
      .from('distribution_releases')
      .select('id, title')
      .eq('id', params.id)
      .single()

    if (releaseError || !release) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 })
    }

    const results: Array<{ track_id: string; status: 'ok' | 'error'; message?: string }> = []
    const identityPairs: Array<{ distributionTrackId: string; vaultTrackId: string }> = []

    if (vaultTrackIds.length) {
      const { data: vaultTracks, error: vaultError } = await supabase
        .from('music_library_tracks')
        .select('id, title, file_url, artwork_url, duration')
        .in('id', vaultTrackIds)

      if (vaultError) {
        return NextResponse.json({ error: vaultError.message }, { status: 500 })
      }

      const vaultById = new Map((vaultTracks || []).map((t) => [t.id, t]))
      for (const vaultId of vaultTrackIds) {
        const vt = vaultById.get(vaultId)
        if (!vt) {
          results.push({ track_id: vaultId, status: 'error', message: 'Vault track not found' })
          continue
        }
        const { data: existing } = await supabase
          .from('distribution_tracks')
          .select('id, release_id')
          .eq('music_library_track_id', vaultId)
          .maybeSingle()

        if (existing?.release_id && existing.release_id !== params.id) {
          results.push({
            track_id: vaultId,
            status: 'error',
            message: 'Already on another release',
          })
          continue
        }
        if (existing) {
          const { error: upErr } = await supabase
            .from('distribution_tracks')
            .update({ release_id: params.id })
            .eq('id', existing.id)
          if (upErr) {
            results.push({ track_id: vaultId, status: 'error', message: upErr.message })
          } else {
            identityPairs.push({ distributionTrackId: existing.id, vaultTrackId: vaultId })
            results.push({ track_id: existing.id, status: 'ok' })
          }
          continue
        }

        const distId = `dtrack-${vaultId}-${Date.now().toString(36)}`.slice(0, 80)
        const fileUrl = String(vt.file_url || '').trim() || `pending://vault/${vaultId}`
        const { error: insErr } = await supabase.from('distribution_tracks').insert({
          id: distId,
          release_id: params.id,
          music_library_track_id: vaultId,
          title: vt.title,
          duration: vt.duration,
          wav_url: fileUrl,
          artwork_url: vt.artwork_url,
          contributors: [],
          splits: [],
          explicit: false,
          language: 'en',
        })
        if (insErr) {
          results.push({ track_id: vaultId, status: 'error', message: insErr.message })
        } else {
          identityPairs.push({ distributionTrackId: distId, vaultTrackId: vaultId })
          results.push({ track_id: distId, status: 'ok' })
        }
      }

      try {
        await persistDistributionTrackIdentitiesFromVault(supabase, identityPairs)
      } catch (identityError) {
        console.error('Failed to persist vault track identity', identityError)
      }
    }

    if (trackIds.length) {
      const { data: tracks, error: tracksError } = await supabase
        .from('distribution_tracks')
        .select('id, title, release_id')
        .in('id', trackIds)

      if (tracksError) {
        return NextResponse.json({ error: tracksError.message }, { status: 500 })
      }

      const found = new Map((tracks || []).map((t) => [t.id, t]))

      for (const trackId of trackIds) {
        const track = found.get(trackId)
        if (!track) {
          results.push({ track_id: trackId, status: 'error', message: 'Track not found' })
          continue
        }
        if (track.release_id && track.release_id !== params.id) {
          results.push({
            track_id: trackId,
            status: 'error',
            message: `Already on another release`,
          })
          continue
        }
        if (track.release_id === params.id) {
          results.push({ track_id: trackId, status: 'ok' })
          continue
        }

        const { error: updateError } = await supabase
          .from('distribution_tracks')
          .update({ release_id: params.id })
          .eq('id', trackId)

        if (updateError) {
          results.push({ track_id: trackId, status: 'error', message: updateError.message })
        } else {
          results.push({ track_id: trackId, status: 'ok' })
        }
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    await logActivity({
      actionType: 'attach_tracks_to_release',
      resourceType: 'release',
      resourceId: params.id,
      details: { trackIds, vaultTrackIds, successful: ok },
    })

    let masters: Awaited<ReturnType<typeof linkDspMastersForRelease>> | null = null
    if (ok > 0) {
      try {
        masters = await linkDspMastersForRelease(supabase, params.id)
      } catch (mastersError) {
        console.error('Auto-locate DSP masters failed', mastersError)
      }
    }

    return NextResponse.json({
      total: results.length,
      successful: ok,
      failed: results.length - ok,
      results,
      masters,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to attach tracks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/studio/releases/[id]/tracks?trackId=...
 * Remove track from release (does not delete the track).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const trackId = searchParams.get('trackId')
    if (!trackId) {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data: track, error: fetchError } = await supabase
      .from('distribution_tracks')
      .select('id, release_id')
      .eq('id', trackId)
      .single()

    if (fetchError || !track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    if (track.release_id !== params.id) {
      return NextResponse.json({ error: 'Track is not on this release' }, { status: 400 })
    }

    const { error } = await supabase
      .from('distribution_tracks')
      .update({ release_id: null })
      .eq('id', trackId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await logActivity({
      actionType: 'detach_track_from_release',
      resourceType: 'release',
      resourceId: params.id,
      details: { trackId },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove track'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
