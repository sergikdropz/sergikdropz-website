import type { ShareAudioTagFields } from '@/lib/shares/share-download-id3'

export type ShareDownloadTagSource = {
  title: string
  artist: string
  album: string
  albumArtist?: string | null
  composer?: string | null
  genre?: string | null
  subgenre?: string | null
  year?: number | string | null
  trackNumber?: number | string | null
  trackCount?: number | null
  bpm?: number | string | null
  key?: string | null
  dnaSummary?: string | null
  dnaDescription?: string | null
  dnaBpm?: number | string | null
  dnaKey?: string | null
  dnaDrums?: string | null
  dnaFeel?: string | null
  dnaGenre?: string | null
  dnaSubgenre?: string | null
  dnaCamelot?: string | null
  /** Catalog or measured energy, any of 0–1, 1–10, or 0–100. */
  energy?: number | string | null
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim()
}

function yearOf(value: number | string | null | undefined): string {
  const text = clean(value)
  return /^\d{4}$/.test(text) ? text : ''
}

function bpmOf(...values: Array<number | string | null | undefined>): string {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 40 && n <= 240) return String(Math.round(n))
  }
  return ''
}

function trackOf(number: number | string | null | undefined, count: number | null | undefined): string {
  const n = Number(number)
  if (!Number.isFinite(n) || n <= 0) return ''
  const total = Number(count)
  return Number.isFinite(total) && total > 1 ? `${Math.round(n)}/${Math.round(total)}` : String(Math.round(n))
}

function clip(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

const CAMELOT_MINOR = ['G#m', 'D#m', 'A#m', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m']
const CAMELOT_MAJOR = ['B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D', 'A', 'E']

/** "C minor", "Cm", "C# maj" → "Cm" or "C". */
export function musicalKeyCode(value: string | null | undefined): string {
  const raw = clean(value).replace(/♭/g, 'b').replace(/♯/g, '#').replace(/\s+/g, ' ')
  if (!raw) return ''
  if (/^\d{1,2}[AB]$/i.test(raw)) return ''
  const minor = /(?:minor|min)$/i.test(raw) || /m$/i.test(raw)
  let root = raw
    .replace(/\s*(minor|min|major|maj)$/i, '')
    .replace(/m$/i, '')
    .replace(/\s+/g, '')
  root = root
    .replace(/^Db$/i, 'C#')
    .replace(/^Eb$/i, 'D#')
    .replace(/^Gb$/i, 'F#')
    .replace(/^Ab$/i, 'G#')
    .replace(/^Bb$/i, 'A#')
  if (!/^[A-G](#|b)?$/.test(root)) return ''
  root = root[0]!.toUpperCase() + root.slice(1).toLowerCase()
  return minor ? `${root}m` : root
}

/** Musical key or an existing wheel code → Camelot, e.g. "C minor" → "5A". */
export function camelotCode(value: string | null | undefined): string {
  const raw = clean(value)
  const direct = raw.match(/^(\d{1,2})([AB])$/i)
  if (direct) {
    const n = Number(direct[1])
    if (n >= 1 && n <= 12) return `${n}${direct[2]!.toUpperCase()}`
  }
  const code = musicalKeyCode(raw)
  if (!code) return ''
  const minor = CAMELOT_MINOR.indexOf(code)
  if (minor >= 0) return `${minor + 1}A`
  const major = CAMELOT_MAJOR.indexOf(code)
  if (major >= 0) return `${major + 1}B`
  return ''
}

export function energyLevel(value: number | string | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  const scaled = n <= 1 ? n * 10 : n <= 10 ? n : n / 10
  const level = Math.round(scaled)
  if (level < 1 || level > 10) return ''
  return String(level)
}

export function shareDownloadTagFields(source: ShareDownloadTagSource): ShareAudioTagFields {
  const title = clean(source.title) || 'Untitled'
  const artist = clean(source.artist) || 'SERGIK'
  const album = clean(source.album) || title
  const albumArtist = clean(source.albumArtist) || artist
  const genre = clean(source.subgenre) || clean(source.dnaSubgenre) || clean(source.genre) || clean(source.dnaGenre)
  const family = clean(source.genre) || clean(source.dnaGenre)
  const bpm = bpmOf(source.bpm, source.dnaBpm)
  const musical = musicalKeyCode(source.key) || musicalKeyCode(source.dnaKey)
  const camelot = camelotCode(source.dnaCamelot) || camelotCode(source.key) || camelotCode(source.dnaKey)
  const energy = energyLevel(source.energy)
  const spelled = clean(source.key) || clean(source.dnaKey) || musical
  const grouping = [family, genre, camelot].filter((part, index, all) => part && all.indexOf(part) === index).join(' · ')
  const drums = clean(source.dnaDrums).replace(/-/g, ' ')
  const feel = clean(source.dnaFeel).replace(/-/g, ' ')
  const djLine = [camelot, spelled, bpm ? `${bpm} BPM` : '', energy ? `Energy ${energy}` : ''].filter(Boolean).join(' · ')
  const facts = [drums, feel].filter(Boolean).join(' · ')
  const summary = clip(clean(source.dnaSummary), 400)
  const description = clip(clean(source.dnaDescription), 700)
  const comment = [djLine, 'Sonic DNA', facts, summary, description].filter(Boolean).join('\n')

  return {
    title,
    artist,
    album,
    albumArtist,
    composer: clean(source.composer) || artist,
    genre: genre || family,
    grouping: grouping || genre,
    year: yearOf(source.year),
    track: trackOf(source.trackNumber, source.trackCount),
    disc: '1/1',
    bpm,
    key: camelot || musical,
    musicalKey: spelled,
    camelot,
    energy,
    comment: clip(comment, 1000),
    description: summary || clip(djLine, 240) || title,
  }
}
