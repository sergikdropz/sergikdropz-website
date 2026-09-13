import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireFanAuth } from '@/lib/require-fan-membership'
import { parseAutoDJConfig } from '@/lib/audio/auto-dj-preferences'
import {
  extractMixQualityHistoryFromSettings,
  parseMixQualityHistory,
} from '@/lib/audio/mix-engine/mix-quality-history'

export const dynamic = 'force-dynamic'

function isMissingAutoDjColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  return /auto_dj_settings/i.test(error.message ?? '')
}

function packSettings(settings: ReturnType<typeof parseAutoDJConfig>, history: unknown) {
  const mixQualityHistory = parseMixQualityHistory(history)
  return {
    ...settings,
    _mixQualityHistory: mixQualityHistory,
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('fan_profiles')
      .select('auto_dj_settings, updated_at')
      .eq('id', session.user.id)
      .maybeSingle()

    if (error) {
      if (isMissingAutoDjColumn(error)) {
        return NextResponse.json({
          settings: null,
          mixQualityHistory: [],
          updatedAt: null,
          migrationRequired: true,
        })
      }
      console.error('GET /api/fan/auto-dj-settings:', error)
      return NextResponse.json({ settings: null, mixQualityHistory: [] })
    }

    if (!data?.auto_dj_settings) {
      return NextResponse.json({ settings: null, mixQualityHistory: [], updatedAt: null })
    }

    return NextResponse.json({
      settings: parseAutoDJConfig(data.auto_dj_settings),
      mixQualityHistory: extractMixQualityHistoryFromSettings(data.auto_dj_settings),
      updatedAt: data.updated_at ?? null,
    })
  } catch (e) {
    console.error('GET /api/fan/auto-dj-settings', e)
    return NextResponse.json({ settings: null, mixQualityHistory: [] })
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireFanAuth(request)
  if (!gate.ok) return gate.response
  const { session } = gate

  try {
    const body = await request.json()
    const settings = parseAutoDJConfig(body?.settings ?? body)
    const mixQualityHistory = parseMixQualityHistory(
      body?.mixQualityHistory ??
        body?.settings?._mixQualityHistory ??
        body?.settings?.mixQualityHistory,
    )

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('fan_profiles')
      .upsert(
        {
          id: session.user.id,
          auto_dj_settings: packSettings(settings, mixQualityHistory),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select('auto_dj_settings, updated_at')
      .single()

    if (error) {
      if (isMissingAutoDjColumn(error)) {
        return NextResponse.json(
          {
            error: 'Auto DJ cloud save is not enabled yet — run the fan_profiles migration',
            code: 'MIGRATION_REQUIRED',
          },
          { status: 503 },
        )
      }
      console.error('PUT /api/fan/auto-dj-settings:', error)
      return NextResponse.json(
        { error: 'Failed to save Auto DJ settings' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      settings: parseAutoDJConfig(data.auto_dj_settings),
      mixQualityHistory: extractMixQualityHistoryFromSettings(data.auto_dj_settings),
      updatedAt: data.updated_at ?? null,
    })
  } catch (e) {
    console.error('PUT /api/fan/auto-dj-settings', e)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
