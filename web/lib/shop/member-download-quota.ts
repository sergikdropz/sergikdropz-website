import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanEntitlements } from '@/lib/membership/entitlements'
import { normalizeShopAudioFormat, type ShopAudioFormat } from '@/lib/shop/format-prices'

type Db = SupabaseClient

export type QuotaSnapshot = {
  periodStart: string
  periodEnd: string
  mp3Limit: number
  wavLimit: number
  mp3Used: number
  wavUsed: number
  mp3Remaining: number
  wavRemaining: number
}

export async function getOrCreateQuotaRow(
  supabase: Db,
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ mp3_used: number; wav_used: number }> {
  const { data: existing } = await supabase
    .from('member_download_usage')
    .select('mp3_used, wav_used')
    .eq('user_id', userId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  if (existing) return existing

  const { data: inserted, error } = await supabase
    .from('member_download_usage')
    .insert({
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      mp3_used: 0,
      wav_used: 0,
    })
    .select('mp3_used, wav_used')
    .single()

  if (error) {
    const { data: retry } = await supabase
      .from('member_download_usage')
      .select('mp3_used, wav_used')
      .eq('user_id', userId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .maybeSingle()
    if (retry) return retry
    throw new Error(error.message)
  }

  return inserted
}

export async function getQuotaSnapshot(
  supabase: Db,
  userId: string,
  entitlements: PlanEntitlements,
  periodStart: string,
  periodEnd: string,
): Promise<QuotaSnapshot> {
  const row = await getOrCreateQuotaRow(supabase, userId, periodStart, periodEnd)
  const mp3Used = Number(row.mp3_used) || 0
  const wavUsed = Number(row.wav_used) || 0
  return {
    periodStart,
    periodEnd,
    mp3Limit: entitlements.mp3DownloadsPerPeriod,
    wavLimit: entitlements.wavDownloadsPerPeriod,
    mp3Used,
    wavUsed,
    mp3Remaining: Math.max(0, entitlements.mp3DownloadsPerPeriod - mp3Used),
    wavRemaining: Math.max(0, entitlements.wavDownloadsPerPeriod - wavUsed),
  }
}

export function quotaUnitsForDownload(format: ShopAudioFormat, trackCount: number): number {
  const tracks = Math.max(1, Math.floor(trackCount))
  return format === 'WAV' ? tracks : tracks
}

export async function consumeMemberDownloadQuota(
  supabase: Db,
  opts: {
    userId: string
    entitlements: PlanEntitlements
    periodStart: string
    periodEnd: string
    format: ShopAudioFormat
    trackCount: number
  },
): Promise<{ ok: boolean; reason?: string }> {
  const units = quotaUnitsForDownload(opts.format, opts.trackCount)
  const row = await getOrCreateQuotaRow(supabase, opts.userId, opts.periodStart, opts.periodEnd)
  const mp3Used = Number(row.mp3_used) || 0
  const wavUsed = Number(row.wav_used) || 0

  if (opts.format === 'WAV') {
    if (wavUsed + units > opts.entitlements.wavDownloadsPerPeriod) {
      return { ok: false, reason: 'WAV monthly limit reached' }
    }
    const { error } = await supabase
      .from('member_download_usage')
      .update({
        wav_used: wavUsed + units,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', opts.userId)
      .eq('period_start', opts.periodStart)
      .eq('period_end', opts.periodEnd)
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  }

  if (mp3Used + units > opts.entitlements.mp3DownloadsPerPeriod) {
    return { ok: false, reason: 'MP3 monthly limit reached' }
  }
  const { error } = await supabase
    .from('member_download_usage')
    .update({
      mp3_used: mp3Used + units,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', opts.userId)
    .eq('period_start', opts.periodStart)
    .eq('period_end', opts.periodEnd)
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

export function parseFormat(raw: unknown): ShopAudioFormat | null {
  return normalizeShopAudioFormat(raw)
}
