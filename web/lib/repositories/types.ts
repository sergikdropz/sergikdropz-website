/** Shared repository result shapes (typed Supabase access layer). */

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type Paginated<T> = {
  items: T[]
  total: number | null
  offset: number
  limit: number
}

export type AudioFileSummary = {
  id: string
  title: string | null
  artist: string | null
  file_name: string | null
  file_path: string | null
  file_url: string | null
  format: string | null
  duration_seconds: number | null
  sonic_dna_status?: string | null
  sonic_dna?: unknown
  bpm?: number | null
  key_signature?: string | null
  energy_level?: number | null
  waveform_json_url?: string | null
  waveform_data?: number[] | null
  waveform_samples?: number | null
  metadata?: Record<string, unknown> | null
}

export type DistributionReleaseSummary = {
  id: string
  title: string | null
  type: string | null
  distributor_status: string | null
  release_date: string | null
  created_at: string | null
}

export type CampaignSummary = {
  id: string
  name: string | null
  status: string | null
  scheduled_send_at: string | null
  created_at: string | null
}
