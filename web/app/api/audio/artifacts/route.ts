import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { persistAudioFileArtifacts } from '@/utils/analysisArtifacts'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'
import { requireAdminApi } from '@/lib/auth/route-policy'

export const dynamic = 'force-dynamic'

/**
 * POST /api/audio/artifacts
 * Backfill + persist lightweight analysis artifacts to Storage:
 * - waveform peaks JSON + waveform SVG
 * - sonic dna JSON text file
 *
 * Body:
 *  { limit?: number, force?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const body = await request.json().catch(() => ({}))
    const limit = Math.max(1, Math.min(Number(body?.limit) || 50, 500))
    const force = Boolean(body?.force)

    const supabase = createSupabaseServerClient()

    const { data: rows, error } = await supabase
      .from('audio_files')
      .select('id, file_path, file_name, waveform_data, sonic_dna, metadata, waveform_svg_url, waveform_json_url, sonic_dna_json_url, sonic_dna_status')
      .eq('sonic_dna_status', 'completed')
      .order('sonic_dna_analyzed_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let processed = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of rows || []) {
      processed++
      try {
        const hasAll =
          !!row.waveform_svg_url &&
          !!row.waveform_json_url &&
          !!row.sonic_dna_json_url

        if (hasAll && !force) {
          skipped++
          continue
        }

        await persistAudioFileArtifacts({
          audioFileId: row.id,
          filePath: row.file_path,
          fileName: row.file_name,
          waveformData: row.waveform_data,
          sonicDna: row.sonic_dna,
          existingMetadata: row.metadata,
          force,
        })

        updated++
      } catch (e: any) {
        errors.push(`${row.id}: ${e?.message || 'unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      stats: { processed, updated, skipped, limit, force, errors: errors.length },
      sampleErrors: errors.slice(0, 10),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
  }
}

