import { createHash } from 'crypto'
import { existsSync } from 'fs'
import path from 'path'
import { sendEmail } from '@/lib/email'
import { getR2MediaConfig, r2ObjectExists } from '@/lib/audio/r2Media'
import { createSupabaseServerClient } from '@/lib/supabase'
import { shareDownloadSecret } from '@/lib/shares/share-download-cookie'
import {
  grantTrackKey,
  mp3RelativeCandidates,
  uniqueDownloadFileName,
  wavHintsFromMeta,
  wavRelativeCandidates,
  type ShareDownloadFormat,
  type ShareDownloadSelection,
} from '@/lib/shares/share-download'
import { createShareToken, isShareActive, type MusicShareLinkRow } from '@/lib/shares/types'
import type { ShareTrackPayload } from '@/lib/shares/types'

const CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000

export type DownloadGrantRecord = {
  id: string
  shareId: string
  scope: ShareDownloadSelection['scope']
  trackId: string
  format: ShareDownloadFormat
  emails: string[]
}

export function isMissingDownloadGrantTable(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = String(error.message || '')
  return /music_download_grant/i.test(msg) && /does not exist|Could not find|schema cache/i.test(msg)
}

export function missingDownloadGrantError() {
  return Object.assign(
    new Error('Download access is not set up yet. Apply migration add_music_download_grants.sql.'),
    { code: 'DOWNLOAD_GRANT_TABLE_MISSING' },
  )
}

function hashCode(code: string): string {
  return createHash('sha256').update(`${shareDownloadSecret()}:${code}`).digest('hex')
}

function mapGrant(row: {
  id: string
  share_id: string
  scope: string
  track_id: string
  format: string
  emails?: string[]
}): DownloadGrantRecord {
  return {
    id: String(row.id),
    shareId: String(row.share_id),
    scope: row.scope === 'track' ? 'track' : 'release',
    trackId: String(row.track_id || ''),
    format: row.format === 'wav' ? 'wav' : 'mp3',
    emails: row.emails || [],
  }
}

async function emailsForGrants(grantIds: string[]): Promise<Map<string, string[]>> {
  const byGrant = new Map<string, string[]>()
  if (!grantIds.length) return byGrant
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_download_grant_emails')
    .select('grant_id,email')
    .in('grant_id', grantIds)
  if (error) {
    if (isMissingDownloadGrantTable(error)) throw missingDownloadGrantError()
    throw error
  }
  for (const row of data || []) {
    const id = String(row.grant_id)
    const list = byGrant.get(id) || []
    list.push(String(row.email).toLowerCase())
    byGrant.set(id, list)
  }
  return byGrant
}

export async function activeShareForDownload(token: string): Promise<MusicShareLinkRow | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_share_links')
    .select(
      'id,token,kind,target_id,visibility,title_override,created_by,expires_at,revoked_at,play_count,last_played_at,created_at,updated_at',
    )
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  if (!data || !isShareActive(data as MusicShareLinkRow)) return null
  return data as MusicShareLinkRow
}

export async function listDownloadGrants(shareId: string): Promise<DownloadGrantRecord[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_download_grants')
    .select('id,share_id,scope,track_id,format')
    .eq('share_id', shareId)
  if (error) {
    if (isMissingDownloadGrantTable(error)) throw missingDownloadGrantError()
    throw error
  }
  const rows = data || []
  const emails = await emailsForGrants(rows.map((row) => String(row.id)))
  return rows.map((row) => mapGrant({ ...row, emails: emails.get(String(row.id)) || [] }))
}

export async function findDownloadGrant(
  shareId: string,
  selection: ShareDownloadSelection,
): Promise<DownloadGrantRecord | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_download_grants')
    .select('id,share_id,scope,track_id,format')
    .eq('share_id', shareId)
    .eq('scope', selection.scope)
    .eq('format', selection.format)
    .eq('track_id', grantTrackKey(selection))
    .maybeSingle()
  if (error) {
    if (isMissingDownloadGrantTable(error)) throw missingDownloadGrantError()
    throw error
  }
  if (!data) return null
  const emails = await emailsForGrants([String(data.id)])
  return mapGrant({ ...data, emails: emails.get(String(data.id)) || [] })
}

export async function saveDownloadGrant(opts: {
  shareId: string
  selection: ShareDownloadSelection
  emails: string[]
}): Promise<DownloadGrantRecord> {
  const supabase = createSupabaseServerClient()
  const trackKey = grantTrackKey(opts.selection)
  const now = new Date().toISOString()
  const existing = await supabase
    .from('music_download_grants')
    .select('id,share_id,scope,track_id,format')
    .eq('share_id', opts.shareId)
    .eq('scope', opts.selection.scope)
    .eq('format', opts.selection.format)
    .eq('track_id', trackKey)
    .maybeSingle()
  if (existing.error) {
    if (isMissingDownloadGrantTable(existing.error)) throw missingDownloadGrantError()
    throw existing.error
  }
  const saved = existing.data
    ? await supabase
        .from('music_download_grants')
        .update({ updated_at: now })
        .eq('id', existing.data.id)
        .select('id,share_id,scope,track_id,format')
        .single()
    : await supabase
        .from('music_download_grants')
        .insert({
          share_id: opts.shareId,
          scope: opts.selection.scope,
          track_id: trackKey,
          format: opts.selection.format,
        })
        .select('id,share_id,scope,track_id,format')
        .single()
  const data = saved.data
  const error = saved.error
  if (error || !data) {
    if (isMissingDownloadGrantTable(error)) throw missingDownloadGrantError()
    throw error || new Error('Could not save download access')
  }

  const grantId = String(data.id)
  const cleared = await supabase.from('music_download_grant_emails').delete().eq('grant_id', grantId)
  if (cleared.error) {
    if (isMissingDownloadGrantTable(cleared.error)) throw missingDownloadGrantError()
    throw cleared.error
  }
  if (opts.emails.length) {
    const inserted = await supabase.from('music_download_grant_emails').insert(
      opts.emails.map((email) => ({ grant_id: grantId, email })),
    )
    if (inserted.error) {
      if (isMissingDownloadGrantTable(inserted.error)) throw missingDownloadGrantError()
      throw inserted.error
    }
  }
  return mapGrant({ ...data, emails: opts.emails })
}

export async function issueDownloadCode(grantId: string, email: string): Promise<string> {
  const code = createShareToken(24)
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('music_download_access_codes').insert({
    grant_id: grantId,
    email: email.toLowerCase(),
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (error) {
    if (isMissingDownloadGrantTable(error)) throw missingDownloadGrantError()
    throw error
  }
  return code
}

export async function grantFromDownloadCode(
  code: string,
): Promise<{ grant: DownloadGrantRecord; email: string } | null> {
  const trimmed = code.trim()
  if (!trimmed) return null
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('music_download_access_codes')
    .select('grant_id,email,expires_at')
    .eq('code_hash', hashCode(trimmed))
    .maybeSingle()
  if (error) {
    if (isMissingDownloadGrantTable(error)) throw missingDownloadGrantError()
    throw error
  }
  if (!data) return null
  if (Date.parse(String(data.expires_at)) <= Date.now()) return null
  const email = String(data.email).toLowerCase()
  const grantRow = await supabase
    .from('music_download_grants')
    .select('id,share_id,scope,track_id,format')
    .eq('id', data.grant_id)
    .maybeSingle()
  if (grantRow.error) throw grantRow.error
  if (!grantRow.data) return null
  const emails = await emailsForGrants([String(grantRow.data.id)])
  const allowed = emails.get(String(grantRow.data.id)) || []
  if (!allowed.includes(email)) return null
  return { grant: mapGrant({ ...grantRow.data, emails: allowed }), email }
}

export async function sendDownloadInvite(opts: {
  to: string
  openUrl: string
  title: string
  detail: string
}): Promise<void> {
  const title = opts.title.trim() || 'SERGIK'
  await sendEmail({
    to: opts.to,
    subject: `SERGIK shared a download — ${title}`,
    html: `
      <div style="font-family:sans-serif;background:#0b0b0b;color:#f5f5f5;padding:24px">
        <p style="margin:0 0 12px">SERGIK shared a private download with <strong>${opts.to}</strong>.</p>
        <p style="margin:0 0 16px;font-size:18px">${escapeHtml(title)}</p>
        <p style="margin:0 0 20px;color:#bbb">${escapeHtml(opts.detail)}</p>
        <a href="${opts.openUrl}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Open download</a>
        <p style="margin:20px 0 0;color:#888;font-size:12px">Only this email can open the file. Anyone else who sees the page still has to be invited.</p>
      </div>
    `,
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type SourceRow = {
  fileUrl: string
  hints: string[]
}

async function loadSources(tracks: ShareTrackPayload[]): Promise<Map<string, SourceRow>> {
  const out = new Map<string, SourceRow>()
  for (const track of tracks) {
    out.set(track.id, { fileUrl: track.file || '', hints: [] })
  }
  const ids = tracks.map((track) => track.id).filter(Boolean)
  if (!ids.length) return out
  const supabase = createSupabaseServerClient()
  const library = await supabase
    .from('music_library_tracks')
    .select('id,file_url,audio_file_id,metadata')
    .in('id', ids)
  if (library.error) {
    if (!/metadata/i.test(library.error.message || '')) throw library.error
    const fallback = await supabase
      .from('music_library_tracks')
      .select('id,file_url,audio_file_id')
      .in('id', ids)
    if (fallback.error) throw fallback.error
    for (const row of fallback.data || []) {
      const current = out.get(String(row.id))
      if (!current) continue
      current.fileUrl = current.fileUrl || String(row.file_url || '')
    }
    return out
  }

  const audioIds = new Set<string>()
  for (const row of library.data || []) {
    const current = out.get(String(row.id))
    if (!current) continue
    current.fileUrl = current.fileUrl || String(row.file_url || '')
    current.hints.push(...wavHintsFromMeta(row.metadata))
    if (row.audio_file_id) audioIds.add(String(row.audio_file_id))
  }
  for (const track of tracks) {
    if (track.audioFileId) audioIds.add(track.audioFileId)
  }
  if (!audioIds.size) return out

  const audio = await supabase
    .from('audio_files')
    .select('id,file_url,file_path,metadata')
    .in('id', [...audioIds])
  if (audio.error) return out
  const audioById = new Map((audio.data || []).map((row) => [String(row.id), row]))
  for (const track of tracks) {
    const current = out.get(track.id)
    const row = track.audioFileId ? audioById.get(track.audioFileId) : null
    if (!current || !row) continue
    if (row.file_url) current.fileUrl = current.fileUrl || String(row.file_url)
    if (row.file_path) current.hints.push(String(row.file_path))
    current.hints.push(...wavHintsFromMeta(row.metadata))
  }
  return out
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  if (!candidates.length) return null
  if (!getR2MediaConfig()) {
    const root = path.join(process.cwd(), 'public', 'audio')
    for (const rel of candidates) {
      const filePath = path.resolve(root, rel)
      if (filePath.startsWith(root + path.sep) && existsSync(filePath)) return rel
    }
    return candidates[0] || null
  }
  for (const rel of candidates) {
    if (await r2ObjectExists(rel)) return rel
  }
  return null
}

export type ResolvedDownloadAsset = {
  trackId: string
  title: string
  artist: string
  filename: string
  relativePath: string | null
}

export async function resolveDownloadAssets(
  tracks: ShareTrackPayload[],
  format: ShareDownloadFormat,
): Promise<ResolvedDownloadAsset[]> {
  const sources = await loadSources(tracks)
  const used = new Set<string>()
  const assets: ResolvedDownloadAsset[] = []
  for (const track of tracks) {
    const source = sources.get(track.id) || { fileUrl: track.file || '', hints: [] }
    const candidates =
      format === 'wav'
        ? wavRelativeCandidates({ stream: source.fileUrl || track.file, hints: source.hints })
        : mp3RelativeCandidates([source.fileUrl, track.file, ...source.hints])
    const relativePath = await firstExisting(candidates)
    assets.push({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      filename: uniqueDownloadFileName(track.artist, track.title, format, used),
      relativePath,
    })
  }
  return assets
}
