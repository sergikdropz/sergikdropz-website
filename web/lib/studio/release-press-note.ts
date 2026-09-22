import { compactSonicDnaForReview } from '@/lib/audio/sonic-dna-report-sections'
import { extractMeasured, parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import type { StudioTrackIdentity } from '@/lib/studio/vault-import'

export type PressNoteSibling = {
  title: string
  description?: string | null
}

export type PressNoteBrief = {
  title: string
  releaseTitle: string
  artist: string
  genre: string | null
  subgenre: string | null
  bpm: number | null
  key_signature: string | null
  drum_style: string | null
  instruments: string[]
  sonic: Record<string, unknown>
  lyrics: string | null
  vocalStatus: 'lyrics' | 'instrumental' | 'unknown'
  siblings: PressNoteSibling[]
}

export type PressNoteDraft = {
  description: string
  intention: string | null
}

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function clip(value: unknown, max: number): string {
  const text = clean(value)
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function lyricsFromTranscription(text: string | null | undefined): {
  lyrics: string | null
  vocalStatus: PressNoteBrief['vocalStatus']
} {
  const raw = clean(text)
  if (!raw) return { lyrics: null, vocalStatus: 'unknown' }
  if (/^instrumental\b/i.test(raw) || raw.length < 12) {
    return { lyrics: null, vocalStatus: 'instrumental' }
  }
  return { lyrics: clip(raw, 900), vocalStatus: 'lyrics' }
}

export function buildPressNoteBrief(input: {
  title: string
  releaseTitle: string
  artist?: string | null
  identity?: StudioTrackIdentity | null
  sonicDna?: unknown
  lyrics?: string | null
  vocalStatus?: PressNoteBrief['vocalStatus']
  siblings?: PressNoteSibling[]
}): PressNoteBrief {
  const identity = input.identity || null
  const parsed = parseSonicDna(input.sonicDna)
  const measured = extractMeasured(parsed)
  const sonic = compactSonicDnaForReview(input.sonicDna, 4200)
  const fromListen = lyricsFromTranscription(input.lyrics)
  return {
    title: clean(input.title) || 'Untitled',
    releaseTitle: clean(input.releaseTitle) || 'Untitled release',
    artist: clean(input.artist) || 'SERGIK',
    genre: identity?.genre || measured?.genre?.primary || null,
    subgenre: identity?.subgenre || measured?.genre?.subgenre || null,
    bpm: identity?.bpm ?? (typeof measured?.bpm === 'number' ? Math.round(measured.bpm) : null),
    key_signature: identity?.key_signature || measured?.key || null,
    drum_style: identity?.drum_style || (measured?.drumFamily ? String(measured.drumFamily) : null),
    instruments: identity?.instruments?.length ? identity.instruments : [],
    sonic,
    lyrics: fromListen.lyrics,
    vocalStatus: input.vocalStatus || fromListen.vocalStatus,
    siblings: (input.siblings || []).map((row) => ({
      title: clean(row.title),
      description: clip(row.description, 220) || null,
    })),
  }
}

export function buildPressNotePrompt(brief: PressNoteBrief): string {
  const facts = [
    `Track: ${brief.title}`,
    `Release: ${brief.releaseTitle}`,
    `Artist: ${brief.artist}`,
    brief.genre ? `Genre: ${brief.genre}${brief.subgenre ? ` / ${brief.subgenre}` : ''}` : null,
    brief.bpm ? `BPM: ${brief.bpm}` : null,
    brief.key_signature ? `Key: ${brief.key_signature}` : null,
    brief.drum_style ? `Groove: ${brief.drum_style}` : null,
    brief.instruments.length ? `Instruments: ${brief.instruments.join(', ')}` : null,
    `Vocal listen: ${brief.vocalStatus}`,
  ]
    .filter(Boolean)
    .join('\n')

  const siblings = brief.siblings.length
    ? brief.siblings
        .map((row) => `- ${row.title}: ${row.description || '(no note yet)'}`)
        .join('\n')
    : '- none yet'

  const lyrics =
    brief.vocalStatus === 'lyrics' && brief.lyrics
      ? brief.lyrics
      : brief.vocalStatus === 'instrumental'
        ? 'No sung lyrics detected — treat as instrumental or chopped-vocal atmosphere. Do not invent words.'
        : 'No reliable lyric transcription. Do not invent lyrics.'

  return [
    'Write a journalist / PR press note for ONE SERGIK track heading to stores and press.',
    'Sound like a publisher who actually heard the record: specific, sensory, and inviting.',
    'Use the Sonic DNA listen notes and lyric listen below. Do not invent features, guests, cities, or chart facts.',
    'Do not use lab voice (groove class, measured usage, crate name, "kick is used", encyclopedia, DSP).',
    'Make this track feel distinct from the sibling notes. Quote lyrics only if they appear in the listen transcript.',
    'Return JSON only: {"description":"2 short paragraphs, 90-150 words","intention":"one line for the room"}',
    '',
    facts,
    '',
    'Sibling notes to avoid repeating:',
    siblings,
    '',
    'Lyric listen:',
    lyrics,
    '',
    'Sonic DNA listen notes (JSON):',
    JSON.stringify(brief.sonic),
  ].join('\n')
}

export function parsePressNoteReply(raw: string): PressNoteDraft {
  const text = clean(raw)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || text
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { description?: unknown; intention?: unknown }
      const description = clip(parsed.description, 1200)
      if (description.length >= 60) {
        return {
          description,
          intention: clip(parsed.intention, 180) || null,
        }
      }
    } catch {
      // fall through
    }
  }
  const fallback = clip(text.replace(/```[\s\S]*?```/g, '').replace(/^[#*-]+\s*/gm, ''), 1200)
  if (fallback.length < 60) {
    throw new Error('Press note was too thin — try again')
  }
  return { description: fallback, intention: null }
}
