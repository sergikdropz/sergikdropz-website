import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY } from '@/lib/site-settings-keys'

export const dynamic = 'force-dynamic'

function parseDbBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  if (value && typeof value === 'object' && 'enabled' in value) {
    const e = (value as { enabled?: unknown }).enabled
    if (e === true || e === 'true') return true
    if (e === false || e === 'false') return false
  }
  return null
}

/**
 * Public read for homepage — no auth. Uses service role server-side only.
 * Resolution: NEXT_PUBLIC_SHOW_INSTAGRAM_FEED force-off/on, then DB setting,
 * then default (off in production, on in development when unset).
 */
export async function GET() {
  const env = process.env.NEXT_PUBLIC_SHOW_INSTAGRAM_FEED
  if (env === 'false') {
    return NextResponse.json(
      { homepageInstagramFeedEnabled: false, source: 'env' as const },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
        },
      }
    )
  }
  if (env === 'true') {
    return NextResponse.json(
      { homepageInstagramFeedEnabled: true, source: 'env' as const },
      {
        headers: {
          'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
        },
      }
    )
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY)
      .maybeSingle()

    if (!error && data?.value !== undefined && data?.value !== null) {
      const parsed = parseDbBoolean(data.value)
      if (parsed !== null) {
        return NextResponse.json(
          { homepageInstagramFeedEnabled: parsed, source: 'database' as const },
          {
            headers: {
              'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
            },
          }
        )
      }
    }
  } catch (e) {
    console.error('homepage-flags: settings read failed', e)
  }

  const fallbackDev = process.env.NODE_ENV !== 'production'
  return NextResponse.json(
    {
      homepageInstagramFeedEnabled: fallbackDev,
      source: 'default' as const,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
      },
    }
  )
}
