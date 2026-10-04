import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import {
  applyRightsPacketDrafts,
  buildRightsPackets,
  type RightsPacketKind,
} from '@/lib/studio/rights-packets'
import { summarizeSplits, type RightsTrackLike } from '@/lib/studio/rights-ops'

export type CollabContextTrack = {
  id: string
  title: string
  trackNumber: number | null
  isrc: string | null
  splitsLabel: string
  splitsOk: boolean
}

export type CollabContextPacket = {
  kind: RightsPacketKind
  label: string
  needed: boolean
  ready: boolean
  missing: string[]
  summary: string
  status: 'missing' | 'pending' | 'approved' | null
}

export type ReleaseCollabContext = {
  readinessScore: number
  blockers: string[]
  ops: {
    split_sheet_status: 'missing' | 'pending' | 'approved' | null
    producer_agreement_status: 'missing' | 'pending' | 'approved' | null
    sample_clearance_status: 'missing' | 'pending' | 'approved' | null
  }
  tracks: CollabContextTrack[]
  packets: CollabContextPacket[]
  replyToAddress: string
}

function statusForPacket(
  kind: RightsPacketKind,
  ops: ReleaseCollabContext['ops'],
): CollabContextPacket['status'] {
  if (kind === 'split_sheet') return ops.split_sheet_status
  if (kind === 'producer_agreement') return ops.producer_agreement_status
  return null
}

export async function buildReleaseCollabContext(
  supabase: Parameters<typeof getSingleReleaseCopyrightReadiness>[0],
  releaseId: string,
  opts: { replyToAddress: string },
): Promise<ReleaseCollabContext | null> {
  const { data: release } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist, label_name')
    .eq('id', releaseId)
    .maybeSingle()
  if (!release) return null

  const { data: trackRows } = await supabase
    .from('distribution_tracks')
    .select('id, title, track_number, isrc_full, splits, contributors')
    .eq('release_id', releaseId)
    .order('track_number', { ascending: true })

  const tracks = (trackRows || []) as RightsTrackLike[]

  const readiness = await getSingleReleaseCopyrightReadiness(supabase, releaseId)
  const ops = readiness?.ops ?? {
    split_sheet_status: 'missing' as const,
    producer_agreement_status: 'missing' as const,
    sample_clearance_status: 'missing' as const,
  }

  const publisherName =
    readiness?.rights?.publisher_name || release.label_name || 'SERGIK Music'
  const albumArtist = release.album_artist || release.label_name || 'SERGIK'

  const packets = applyRightsPacketDrafts(
    buildRightsPackets({
      releaseTitle: release.title || 'Untitled',
      albumArtist,
      publisherName,
      tracks,
    }),
    readiness?.rights_packets,
  ).map((packet) => ({
    kind: packet.kind,
    label: packet.label,
    needed: packet.needed,
    ready: packet.ready,
    missing: packet.missing,
    summary: packet.summary,
    status: statusForPacket(packet.kind, ops),
  }))

  const trackSummaries: CollabContextTrack[] = (trackRows || []).map((row: {
    id: unknown
    title?: unknown
    track_number?: unknown
    isrc_full?: unknown
    splits?: unknown
  }) => {
    const split = summarizeSplits(row.splits)
    return {
      id: String(row.id),
      title: String(row.title || 'Untitled'),
      trackNumber: row.track_number != null ? Number(row.track_number) : null,
      isrc: row.isrc_full ? String(row.isrc_full) : null,
      splitsLabel: split.label,
      splitsOk: split.ok,
    }
  })

  return {
    readinessScore: readiness?.readiness_score ?? 0,
    blockers: (readiness?.blockers ?? []).slice(0, 8),
    ops: {
      split_sheet_status: ops.split_sheet_status,
      producer_agreement_status: ops.producer_agreement_status,
      sample_clearance_status: ops.sample_clearance_status,
    },
    tracks: trackSummaries,
    packets,
    replyToAddress: opts.replyToAddress,
  }
}

/** Portal-safe slice (no internal blockers spam). */
export function collabContextForPortal(
  ctx: ReleaseCollabContext,
): Pick<ReleaseCollabContext, 'tracks' | 'packets' | 'ops'> {
  return {
    tracks: ctx.tracks,
    packets: ctx.packets.filter((p) => p.needed),
    ops: ctx.ops,
  }
}
