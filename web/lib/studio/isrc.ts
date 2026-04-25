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
  const year = new Date().getFullYear() % 100 // YY format

  // Call the database function for atomic assignment
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

/**
 * Format ISRC string: PREFIX + YY + SERIAL (5 digits)
 */
export function formatISRC(prefix: string, year: number, serial: number): string {
  const yearStr = String(year).padStart(2, '0')
  const serialStr = String(serial).padStart(5, '0')
  return `${prefix}${yearStr}${serialStr}`
}

/**
 * Validate ISRC format
 */
export function validateISRC(isrc: string): boolean {
  // ISRC format: PREFIX (5 chars) + YY (2 digits) + SERIAL (5 digits) = 12 chars total
  const isrcRegex = /^[A-Z0-9]{5}[0-9]{7}$/
  return isrcRegex.test(isrc)
}
