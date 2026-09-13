/**
 * Diff narrative — what changed between two Sonic DNA snapshots.
 */

import { extractMeasured } from '@/lib/audio/sonic-dna-quality'

export type DnaDiffLine = {
  field: string
  from: string
  to: string
}

export function diffSonicDna(before: unknown, after: unknown): { lines: DnaDiffLine[]; narrative: string } {
  const a = extractMeasured(before)
  const b = extractMeasured(after)
  const lines: DnaDiffLine[] = []

  const push = (field: string, from: unknown, to: unknown) => {
    const fs = from == null || from === '' ? '—' : String(from)
    const ts = to == null || to === '' ? '—' : String(to)
    if (fs === ts) return
    lines.push({ field, from: fs, to: ts })
  }

  push('bpm', a?.bpm != null ? Math.round(Number(a.bpm)) : null, b?.bpm != null ? Math.round(Number(b.bpm)) : null)
  push('drums', a?.drumFamily, b?.drumFamily)
  push('timing', a?.timingFeel, b?.timingFeel)
  push('key', a?.key, b?.key)
  push('bass', (a as any)?.bassLock ?? a?.bass?.lock, (b as any)?.bassLock ?? b?.bass?.lock)
  push(
    'genre',
    a?.genre?.primary ? `${a.genre.primary}${a.genre.subgenre ? ` / ${a.genre.subgenre}` : ''}` : null,
    b?.genre?.primary ? `${b.genre.primary}${b.genre.subgenre ? ` / ${b.genre.subgenre}` : ''}` : null,
  )
  push('genreSource', a?.genre?.source, b?.genre?.source)

  const narrative = lines.length
    ? lines.map((l) => `${l.field}: ${l.from} → ${l.to}`).join('; ')
    : 'No measured-field changes detected.'

  return { lines, narrative }
}
