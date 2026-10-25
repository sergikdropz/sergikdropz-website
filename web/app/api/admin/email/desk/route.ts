import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { campaignMailbox } from '@/lib/email/department-desk'
import { promoReleaseFromRow, type PromoTrack } from '@/lib/email/promo-assets'
import { parseSocialPromoPlan, promoSharePath, readPromoShareToken } from '@/lib/studio/social-promo'
import { createSupabaseServerClient } from '@/lib/supabase'
import { loadDepartmentDirectory, type AudienceClient } from '@/lib/email/department-audience'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServerClient()
  const { audiences, contacts } = await loadDepartmentDirectory(supabase as unknown as AudienceClient)

  let broadcasts: { id: string; name: string; description: string; status: string; scheduledAt: string | null; accountId: string }[] = []
  type LooseRows = { data: Record<string, any>[] | null; error: { message?: string } | null }
  let campaigns: LooseRows = await supabase
    .from('campaigns')
    .select('id, name, description, status, scheduled_send_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (campaigns.error) {
    campaigns = await supabase
      .from('campaigns')
      .select('id, name, status, scheduled_send_at')
      .order('created_at', { ascending: false })
      .limit(20)
  }
  if (!campaigns.error && Array.isArray(campaigns.data)) {
    broadcasts = campaigns.data.map((row) => {
      const name = String(row.name || 'Campaign')
      return {
        id: String(row.id),
        name,
        description: String(row.description || ''),
        status: String(row.status || 'draft'),
        scheduledAt: row.scheduled_send_at ? String(row.scheduled_send_at) : null,
        accountId: campaignMailbox(name),
      }
    })
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com'
  let site = 'https://sergikdropz.com'
  try {
    const url = new URL(configured)
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') site = url.origin
  } catch {
    site = 'https://sergikdropz.com'
  }

  let promoReleases: ReturnType<typeof promoReleaseFromRow>[] = []
  let releaseRows: LooseRows = await supabase
    .from('distribution_releases')
    .select('id, title, release_date, artwork_url, marketing_copy, upc, album_artist, genre, type, label_name, social_promo')
    .order('release_date', { ascending: false })
    .limit(40)
  if (releaseRows.error) {
    releaseRows = await supabase
      .from('distribution_releases')
      .select('id, title, release_date, artwork_url, marketing_copy')
      .order('release_date', { ascending: false })
      .limit(40)
  }
  if (!releaseRows.error && Array.isArray(releaseRows.data)) {
    promoReleases = releaseRows.data
      .map((row) => {
        const release = promoReleaseFromRow(row as Record<string, unknown>)
        if (!release) return null
        const token = readPromoShareToken(parseSocialPromoPlan((row as { social_promo?: unknown }).social_promo).share_token)
        const path = token ? promoSharePath(token) : null
        return path ? { ...release, promoLabUrl: `${site}${path}` } : release
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  }

  const releaseIds = promoReleases.flatMap((release) => (release ? [release.id] : []))
  if (releaseIds.length) {
    const [smartRows, storeRows] = await Promise.all([
      supabase.from('smartlinks').select('release_id, slug').in('release_id', releaseIds),
      supabase.from('distribution_store_links').select('release_id, store, url').in('release_id', releaseIds),
    ])
    const smartByRelease = new Map<string, string[]>()
    if (!smartRows.error && Array.isArray(smartRows.data)) {
      for (const row of smartRows.data) {
        const id = String(row.release_id || '')
        const slug = String(row.slug || '').trim()
        if (!id || !slug) continue
        const url = `${site}/api/go/${encodeURIComponent(slug)}`
        const list = smartByRelease.get(id) ?? []
        if (!list.includes(url)) list.push(url)
        smartByRelease.set(id, list)
      }
    }
    const storeByRelease = new Map<string, { store: string; url: string }[]>()
    if (!storeRows.error && Array.isArray(storeRows.data)) {
      const ranked = [...storeRows.data].sort((a, b) => Number(b.store === 'spotify') - Number(a.store === 'spotify'))
      for (const row of ranked) {
        const id = String(row.release_id || '')
        const url = String(row.url || '').trim()
        if (!id || !url) continue
        const list = storeByRelease.get(id) ?? []
        if (!list.some((item) => item.url === url)) list.push({ store: String(row.store || ''), url })
        storeByRelease.set(id, list)
      }
    }
    promoReleases = promoReleases.map((release) => {
      if (!release) return release
      const smartLinks = smartByRelease.get(release.id) ?? []
      const storeLinks = storeByRelease.get(release.id) ?? []
      const spotify = storeLinks.find((item) => item.store === 'spotify')?.url
      return {
        ...release,
        smartLink: smartLinks[0] || '',
        smartLinks,
        storeUrl: spotify || storeLinks[0]?.url || '',
        storeLinks,
      }
    })
  }

  if (releaseIds.length) {
    const trackRows = await supabase
      .from('distribution_tracks')
      .select('release_id, title, track_number, isrc_full, duration')
      .in('release_id', releaseIds)
    if (!trackRows.error && Array.isArray(trackRows.data)) {
      const byRelease = new Map<string, PromoTrack[]>()
      const sorted = [...trackRows.data].sort((a, b) => Number(a.track_number || 0) - Number(b.track_number || 0))
      for (const row of sorted) {
        const id = String(row.release_id || '')
        const title = String(row.title || '').trim()
        if (!id || !title) continue
        const duration = Number(row.duration)
        const list = byRelease.get(id) ?? []
        list.push({
          title,
          isrc: String(row.isrc_full || '').trim(),
          durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
        })
        byRelease.set(id, list)
      }
      promoReleases = promoReleases.map((release) =>
        release ? { ...release, tracks: byRelease.get(release.id) ?? [] } : release,
      )
    }
  }

  return NextResponse.json({
    audiences,
    contacts,
    broadcasts,
    promoReleases,
    webhook: {
      endpoint: `${site}/api/webhooks/resend`,
      secretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim() && process.env.RESEND_WEBHOOK_SECRET.trim().length > 12),
    },
  })
}
