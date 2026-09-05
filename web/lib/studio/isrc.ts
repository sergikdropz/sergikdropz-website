import { createSupabaseServerClient } from '@/lib/supabase'

export interface ISRCAssignment {
  isrc: string
  prefix: string
  year: number
  serial: number
}

/**
 * Assign ISRC to a track using atomic counter
 */
export async function assignISRC(
  trackId: string,
  prefix: string
): Promise<ISRCAssignment> {
  const supabase = createSupabaseServerClient()
  const year = new Date().getFullYear() % 100

  const { data, error } = await supabase.rpc('assign_isrc', {
    p_prefix: prefix,
    p_year: year,
    p_track_id: trackId,
  })

  if (error) {
    throw new Error(`ISRC assignment failed: ${error.message}`)
  }

  if (!data) {
    throw new Error('ISRC assignment returned no data')
  }

  return {
    isrc: data.isrc,
    prefix: data.prefix,
    year: data.year,
    serial: data.serial,
  }
}

export function formatISRC(prefix: string, year: number, serial: number): string {
  const yearStr = String(year).padStart(2, '0')
  const serialStr = String(serial).padStart(5, '0')
  return `${prefix}${yearStr}${serialStr}`
}

export function validateISRC(isrc: string): boolean {
  const normalized = isrc.replace(/-/g, '').toUpperCase()
  const isrcRegex = /^[A-Z0-9]{5}[0-9]{7}$/
  return isrcRegex.test(normalized)
}

export function parseISRC(isrc: string): {
  prefix: string
  year: number
  serial: number
  isrc_full: string
} | null {
  const normalized = isrc.replace(/-/g, '').toUpperCase()
  if (!validateISRC(normalized)) return null
  return {
    prefix: normalized.slice(0, 5),
    year: parseInt(normalized.slice(5, 7), 10),
    serial: parseInt(normalized.slice(7), 10),
    isrc_full: normalized,
  }
}

/** Set a pre-existing ISRC on a track (import / migration) */
export async function setExistingISRC(trackId: string, isrc: string) {
  const parsed = parseISRC(isrc)
  if (!parsed) {
    throw new Error(`Invalid ISRC format: ${isrc}`)
  }

  const supabase = createSupabaseServerClient()
  const { error } = await supabase
    .from('distribution_tracks')
    .update({
      isrc_prefix: parsed.prefix,
      isrc_year: parsed.year,
      isrc_serial: parsed.serial,
      isrc_full: parsed.isrc_full,
    })
    .eq('id', trackId)

  if (error) {
    throw new Error(error.message)
  }

  return parsed
}

export async function resolveTrackId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  opts: { track_id?: string; title?: string }
): Promise<string | null> {
  if (opts.track_id) {
    const { data } = await supabase
      .from('distribution_tracks')
      .select('id')
      .eq('id', opts.track_id)
      .maybeSingle()
    return data?.id ?? null
  }
  if (opts.title) {
    const { data } = await supabase
      .from('distribution_tracks')
      .select('id')
      .ilike('title', opts.title.trim())
      .limit(1)
      .maybeSingle()
    return data?.id ?? null
  }
  return null
}
