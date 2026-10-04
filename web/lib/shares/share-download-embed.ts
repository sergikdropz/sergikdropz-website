import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { applyShareId3, type ShareAudioTagFields } from '@/lib/shares/share-download-id3'
import { shareDownloadTagFields, type ShareDownloadTagSource } from '@/lib/shares/share-download-tag-text'
import { readVaultAudio } from '@/lib/shares/share-download-bytes'

const DNA_SELECT =
  'id,dna_summary:sonic_dna->>summary,dna_description:sonic_dna->>description,dna_bpm:sonic_dna->measured->>bpm,dna_key:sonic_dna->measured->>key,dna_drums:sonic_dna->measured->>drumFamily,dna_feel:sonic_dna->measured->>timingFeel,dna_genre:sonic_dna->measured->genre->>primary,dna_subgenre:sonic_dna->measured->genre->>subgenre,dna_camelot:sonic_dna->measured->>camelot'

export type ShareDownloadAlbum = {
  title: string
  artist?: string | null
  year?: number | string | null
  artworkUrl?: string | null
}

type TrackRow = {
  id: string
  title?: string | null
  artist?: string | null
  year?: number | null
  bpm?: number | null
  key_signature?: string | null
  genre?: string | null
  subgenre?: string | null
  track_number?: number | null
  composer?: string | null
  energy_level?: number | null
  audio_file_id?: string | null
}

export async function loadShareDownloadTags(
  tracks: Array<{ id: string; title: string; artist: string }>,
  album: ShareDownloadAlbum,
): Promise<Map<string, ShareAudioTagFields>> {
  const out = new Map<string, ShareAudioTagFields>()
  if (!tracks.length) return out
  const supabase = createSupabaseServerClient()
  const ids = tracks.map((track) => track.id)
  const library = await supabase
    .from('music_library_tracks')
    .select('id,title,artist,year,bpm,key_signature,genre,subgenre,track_number,composer,energy_level,audio_file_id')
    .in('id', ids)
  const rows = (library.error ? [] : library.data || []) as TrackRow[]
  const audioIds = [...new Set(rows.map((row) => row.audio_file_id).filter(Boolean))] as string[]
  const dnaByAudio = new Map<string, Record<string, string | null>>()
  if (audioIds.length) {
    const dna = await supabase.from('audio_files').select(DNA_SELECT).in('id', audioIds)
    if (!dna.error) {
      for (const row of dna.data || []) {
        dnaByAudio.set(String(row.id), row as Record<string, string | null>)
      }
    }
  }
  const byId = new Map(rows.map((row) => [String(row.id), row]))
  for (const track of tracks) {
    const row = byId.get(track.id)
    const dna = row?.audio_file_id ? dnaByAudio.get(String(row.audio_file_id)) : undefined
    const source: ShareDownloadTagSource = {
      title: row?.title || track.title,
      artist: row?.artist || track.artist,
      album: album.title,
      albumArtist: album.artist,
      composer: row?.composer,
      genre: row?.genre,
      subgenre: row?.subgenre,
      year: row?.year || album.year,
      trackNumber: row?.track_number,
      trackCount: tracks.length,
      bpm: row?.bpm,
      key: row?.key_signature,
      energy: row?.energy_level,
      dnaSummary: dna?.dna_summary,
      dnaDescription: dna?.dna_description,
      dnaBpm: dna?.dna_bpm,
      dnaKey: dna?.dna_key,
      dnaDrums: dna?.dna_drums,
      dnaFeel: dna?.dna_feel,
      dnaGenre: dna?.dna_genre,
      dnaSubgenre: dna?.dna_subgenre,
      dnaCamelot: dna?.dna_camelot,
    }
    out.set(track.id, shareDownloadTagFields(source))
  }
  return out
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `ffmpeg exit ${code}`))
    })
  })
}

/** Square cover written into MP3 and WAV tags. 720px on each side. */
const EMBEDDED_COVER_PX = 720

async function toJpeg(bytes: Buffer): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), 'sergik-cover-'))
  try {
    const src = join(dir, 'cover.bin')
    const out = join(dir, 'cover.jpg')
    await writeFile(src, bytes)
    await runFfmpeg([
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      src,
      '-frames:v',
      '1',
      '-vf',
      `scale=${EMBEDDED_COVER_PX}:${EMBEDDED_COVER_PX}:force_original_aspect_ratio=decrease,pad=${EMBEDDED_COVER_PX}:${EMBEDDED_COVER_PX}:(ow-iw)/2:(oh-ih)/2:color=black`,
      '-q:v',
      '5',
      out,
    ])
    const jpeg = await readFile(out)
    return jpeg.length >= 3 && jpeg[0] === 0xff && jpeg[1] === 0xd8 ? jpeg : null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function artworkFetchUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (!url.startsWith('/')) return url
  const site = String(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (site && !/localhost|127\.0\.0\.1/i.test(site)) return `${site}${url}`
  const port = String(process.env.PORT || '3001')
  return `http://127.0.0.1:${port}${url}`
}

export async function fetchArtworkJpeg(url: string | null | undefined): Promise<Buffer | null> {
  const target = artworkFetchUrl(String(url || '').trim())
  if (!target || target.startsWith('data:')) return null
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length || bytes.length > 8_000_000) return null
    return await toJpeg(bytes)
  } catch {
    return null
  }
}

export async function taggedShareAudio(opts: {
  relativePath: string
  format: 'mp3' | 'wav'
  tags: ShareAudioTagFields
  artworkJpeg?: Buffer | null
}): Promise<Buffer | null> {
  const audio = await readVaultAudio(opts.relativePath)
  if (!audio) return null
  try {
    return applyShareId3(audio, opts.format, opts.tags, opts.artworkJpeg)
  } catch (error) {
    console.error('share tag embed failed:', error)
    return audio
  }
}
