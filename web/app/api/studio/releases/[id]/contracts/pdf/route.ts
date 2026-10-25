import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'
import { buildContractPdf, contractPdfFilename } from '@/lib/studio/contract-pdf'
import {
  applyRightsPacketDrafts,
  buildRightsPackets,
  type RightsPacketKind,
} from '@/lib/studio/rights-packets'

export const dynamic = 'force-dynamic'

const KINDS = new Set<RightsPacketKind>(['split_sheet', 'producer_agreement', 'collab_agreement'])

function pdfResponse(pdf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

async function contractSource(releaseId: string, kind: RightsPacketKind, textOverride: string) {
  const supabase = createSupabaseServerClient()
  const { data: release, error } = await supabase
    .from('distribution_releases')
    .select('id, title, album_artist, label_name')
    .eq('id', releaseId)
    .maybeSingle()
  if (error || !release) return { error: 'Release not found', status: 404 as const }

  const { data: trackRows, error: trackError } = await supabase
    .from('distribution_tracks')
    .select('*')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })
  if (trackError) return { error: trackError.message, status: 500 as const }

  const readiness = await getSingleReleaseCopyrightReadiness(supabase, releaseId)
  const publisherName = readiness?.rights?.publisher_name || release.label_name || 'SERGIK Music'
  const albumArtist = release.album_artist || release.label_name || 'SERGIK'
  const packets = applyRightsPacketDrafts(
    buildRightsPackets({
      releaseTitle: release.title || 'Untitled',
      albumArtist,
      publisherName,
      tracks: trackRows || [],
    }),
    readiness?.rights_packets,
  )
  const packet = packets.find((row) => row.kind === kind)
  const text = textOverride || packet?.text || ''
  if (!packet || !text.trim()) {
    return { error: 'This contract has no text to export.', status: 400 as const }
  }
  return {
    title: packet.label,
    releaseTitle: release.title || 'Untitled',
    albumArtist,
    text,
  }
}

async function readKind(request: NextRequest, body?: Record<string, unknown>) {
  const fromBody = typeof body?.kind === 'string' ? body.kind : ''
  const kind = (fromBody || request.nextUrl.searchParams.get('kind') || '') as RightsPacketKind
  if (!KINDS.has(kind)) return null
  return kind
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const kind = await readKind(request)
  if (!kind) {
    return NextResponse.json(
      { error: 'kind must be split_sheet, producer_agreement, or collab_agreement' },
      { status: 400 },
    )
  }
  const source = await contractSource(params.id, kind, '')
  if ('error' in source) return NextResponse.json({ error: source.error }, { status: source.status })
  const pdf = buildContractPdf({ ...source, body: source.text })
  return pdfResponse(pdf, contractPdfFilename(source.title, source.releaseTitle))
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession()
  if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const kind = await readKind(request, body)
  if (!kind) {
    return NextResponse.json(
      { error: 'kind must be split_sheet, producer_agreement, or collab_agreement' },
      { status: 400 },
    )
  }
  const textOverride = typeof body.text === 'string' ? body.text.trim().slice(0, 100000) : ''
  const source = await contractSource(params.id, kind, textOverride)
  if ('error' in source) return NextResponse.json({ error: source.error }, { status: source.status })
  const pdf = buildContractPdf({ ...source, body: source.text })
  return pdfResponse(pdf, contractPdfFilename(source.title, source.releaseTitle))
}
