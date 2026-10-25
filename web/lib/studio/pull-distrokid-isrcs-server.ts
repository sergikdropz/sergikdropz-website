/**
 * Read DistroKid album ISRCs and optionally write them onto a Release Studio release.
 * Dry runs still open DistroKid so the preview lists the real codes. They do not save.
 */

import { fetchDistroKidAlbumPage } from '@/lib/ai/admin-browser'
import { logActivity } from '@/lib/activity-log'
import { createSupabaseServerClient } from '@/lib/supabase'
import { parseDistroKidDelivery } from '@/lib/studio/distrokid-delivery'
import {
  distroKidAlbumuuidFromMarketingCopy,
  marketingCopyWithDistroKidMeta,
  parseDistroKidMyMusicHtml,
} from '@/lib/studio/distrokid-import'
import { setExistingISRC } from '@/lib/studio/isrc'
import {
  distrokidAlbumUrl,
  matchDistrokidIsrcs,
  pickDistroKidAlbum,
  type IsrcPullMatch,
} from '@/lib/studio/pull-distrokid-isrcs'
import { registerMintedIsrcsWithSxDirect } from '@/lib/studio/soundexchange-registry'
import { pushDistributionToVault } from '@/lib/studio/vault-writeback'

export class DistrokidPullError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DistrokidPullError'
    this.status = status
  }
}

export type DistrokidIsrcPullResult = {
  releaseId: string
  title: string
  album: string | null
  albumuuid: string | null
  upc: string | null
  matches: IsrcPullMatch[]
  written: number
  unchanged: number
  unmatched: string[]
  errors: string[]
  codes: Array<{ n: number; title: string; isrc: string | null }>
  studioUrl: string
  dryRun: boolean
}

function albumUuidFromCopy(copy: unknown): string | null {
  if (!copy || typeof copy !== 'object') return null
  const record = copy as Record<string, unknown>
  return distroKidAlbumuuidFromMarketingCopy(record) || parseDistroKidDelivery(record)?.albumuuid || null
}

export async function pullDistrokidIsrcsForRelease(
  releaseId: string,
  opts?: { dryRun?: boolean },
): Promise<DistrokidIsrcPullResult> {
  const dryRun = opts?.dryRun !== false
  const id = releaseId.trim()
  if (!id) throw new DistrokidPullError('releaseId is required', 400)

  const supabase = createSupabaseServerClient()
  const { data: release, error: releaseError } = await supabase
    .from('distribution_releases')
    .select('id, title, upc, marketing_copy')
    .eq('id', id)
    .maybeSingle()

  if (releaseError || !release) {
    throw new DistrokidPullError('Release not found', 404)
  }

  const { data: trackRows, error: trackError } = await supabase
    .from('distribution_tracks')
    .select('id, title, track_number, isrc_full')
    .eq('release_id', id)
    .order('track_number', { ascending: true })

  if (trackError) throw new DistrokidPullError(trackError.message, 500)
  if (!trackRows?.length) {
    throw new DistrokidPullError('This release has no tracks to update.', 400)
  }

  const storedUuid = albumUuidFromCopy(release.marketing_copy)
  let page = await fetchDistroKidAlbumPage({
    albumUrl: storedUuid ? distrokidAlbumUrl(storedUuid) : null,
  })
  if (!page.ok) {
    throw new DistrokidPullError(page.error || 'DistroKid page did not open.', 502)
  }

  let albumuuid = storedUuid
  if (!page.codes) {
    const rows = parseDistroKidMyMusicHtml(page.listingHtml)
    const picked = pickDistroKidAlbum(
      rows.map((row) => ({
        albumuuid: row.albumuuid,
        title: row.title,
        text: `${row.title} ${row.artist}`.trim(),
      })),
      { title: String(release.title || ''), upc: release.upc },
    )
    if (!picked) {
      throw new DistrokidPullError(
        `No DistroKid album matched “${release.title}”. Open that album in the admin browser once, then pull again.`,
        404,
      )
    }
    albumuuid = picked.albumuuid
    page = await fetchDistroKidAlbumPage({ albumUrl: distrokidAlbumUrl(picked.albumuuid) })
    if (!page.ok) {
      throw new DistrokidPullError(page.error || 'DistroKid album did not open.', 502)
    }
  }

  const codes = page.codes
  if (!codes?.tracks.some((track) => track.isrc)) {
    throw new DistrokidPullError(codes?.note || 'DistroKid did not list ISRCs on that album page.', 404)
  }

  const { matches, unmatchedCodes } = matchDistrokidIsrcs(
    trackRows.map((row) => ({
      id: row.id,
      title: String(row.title || ''),
      track_number: row.track_number == null ? null : Number(row.track_number),
      isrc_full: row.isrc_full,
    })),
    codes.tracks,
  )

  const written: Array<{ trackId: string; title: string; isrc: string }> = []
  const errors: string[] = []
  if (!dryRun) {
    for (const match of matches) {
      if (!match.changed) continue
      try {
        await setExistingISRC(match.trackId, match.isrc)
        written.push({ trackId: match.trackId, title: match.trackTitle, isrc: match.isrc })
      } catch (err) {
        errors.push(`${match.trackTitle}: ${err instanceof Error ? err.message : 'Could not save ISRC'}`)
      }
    }

    const marketing =
      release.marketing_copy && typeof release.marketing_copy === 'object'
        ? (release.marketing_copy as Record<string, unknown>)
        : {}
    const nextCopy = albumuuid
      ? marketingCopyWithDistroKidMeta(marketing, {
          source: 'distrokid',
          albumuuid,
          upc: codes.upc,
          importedAt: new Date().toISOString(),
        })
      : marketing
    const releasePatch: Record<string, unknown> = { marketing_copy: nextCopy }
    if (codes.upc && codes.upc !== release.upc) releasePatch.upc = codes.upc
    await supabase.from('distribution_releases').update(releasePatch).eq('id', id)

    if (written.length) {
      try {
        await pushDistributionToVault(supabase, {
          releaseId: id,
          writeDates: false,
          bumpCatalog: false,
          trackIds: written.map((row) => row.trackId),
        })
      } catch (err) {
        console.warn('[distrokid/pull] vault write-back failed', err)
      }
      await registerMintedIsrcsWithSxDirect(written.map((row) => row.trackId))
    }

    await logActivity({
      actionType: 'pull_distrokid_isrc',
      resourceType: 'release',
      resourceId: id,
      details: {
        albumuuid,
        written: written.length,
        unchanged: matches.filter((row) => !row.changed).length,
        unmatched: unmatchedCodes.length,
      },
    })
  }

  const unchanged = matches.filter((row) => !row.changed).length
  return {
    releaseId: id,
    title: String(release.title || ''),
    album: codes.album,
    albumuuid,
    upc: codes.upc,
    matches,
    written: written.length,
    unchanged,
    unmatched: unmatchedCodes,
    errors,
    codes: codes.tracks,
    studioUrl: `/studio/releases/${encodeURIComponent(id)}?step=catalog`,
    dryRun,
  }
}
