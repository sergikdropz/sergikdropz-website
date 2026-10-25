import { createSupabaseServerClient } from '@/lib/supabase'

/** Facebook timeline card: a still of the listen page plus the first track. */

export const SHARE_CARD_VERSION = '20261008d'
export const FACEBOOK_CARD_WIDTH = 1200
export const FACEBOOK_CARD_HEIGHT = 630

export function shareClock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function facebookCardObjectPath(token: string): string {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, '')
  return `facebook-cards/${safe}-${SHARE_CARD_VERSION}.mp4`
}

/** Public Storage URL Facebook can fetch. Null when Supabase is not configured. */
export function facebookCardPublicUrl(
  token: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const base = String(supabaseUrl || '').trim().replace(/\/$/, '')
  if (!base || !/^https?:\/\//i.test(base)) return null
  return `${base}/storage/v1/object/public/audio-files/${facebookCardObjectPath(token)}`
}

export async function facebookCardIsPublished(token: string): Promise<boolean> {
  const name = facebookCardObjectPath(token).slice('facebook-cards/'.length)
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.storage.from('audio-files').list('facebook-cards', {
      search: name,
      limit: 20,
    })
    if (error || !data) return false
    return data.some((item) => item.name === name)
  } catch {
    return false
  }
}

export function facebookCardPlayUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/api/shares/${encodeURIComponent(token)}/facebook-card`
}

export async function readFacebookCardMp4(token: string): Promise<Buffer | null> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.storage.from('audio-files').download(facebookCardObjectPath(token))
    if (error || !data) return null
    const bytes = Buffer.from(await data.arrayBuffer())
    return bytes.byteLength > 1000 ? bytes : null
  } catch {
    return null
  }
}
