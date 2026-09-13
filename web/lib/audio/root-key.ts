import { BEAT_COUNT_WINDOW_SEC, detectFirstDropSec } from '@/lib/audio/beat-count'

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Krumhansl–Schmuckler key profiles (same as measure_sonic_dna.py). */
export const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
export const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const CAMELOT: Record<string, string> = {
  'G# minor': '1A',
  'Ab minor': '1A',
  'B major': '1B',
  'D# minor': '2A',
  'Eb minor': '2A',
  'F# major': '2B',
  'Gb major': '2B',
  'A# minor': '3A',
  'Bb minor': '3A',
  'C# major': '3B',
  'Db major': '3B',
  'F minor': '4A',
  'G# major': '4B',
  'Ab major': '4B',
  'C minor': '5A',
  'D# major': '5B',
  'Eb major': '5B',
  'G minor': '6A',
  'A# major': '6B',
  'Bb major': '6B',
  'D minor': '7A',
  'F major': '7B',
  'A minor': '8A',
  'C major': '8B',
  'E minor': '9A',
  'G major': '9B',
  'B minor': '10A',
  'D major': '10B',
  'F# minor': '11A',
  'Gb minor': '11A',
  'A major': '11B',
  'C# minor': '12A',
  'Db minor': '12A',
  'E major': '12B',
}

export type RootKeyCandidate = {
  key: string
  root: string
  scale: 'major' | 'minor'
  score: number
  camelot: string | null
}

export type RootKeyResult = {
  key: string | null
  root: string | null
  scale: 'major' | 'minor' | null
  confidence: number
  camelot: string | null
  unpitched: boolean
  candidates: RootKeyCandidate[]
}

export type TrackKeyResult = RootKeyResult & {
  topline: RootKeyResult
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  let meanA = 0
  let meanB = 0
  for (let i = 0; i < n; i++) {
    meanA += a[i]
    meanB += b[i]
  }
  meanA /= n
  meanB /= n
  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  if (den < 1e-12) return 0
  const r = num / den
  return Number.isFinite(r) ? r : 0
}

function roll(chroma: number[], shift: number): number[] {
  const out = new Array(12)
  for (let i = 0; i < 12; i++) out[i] = chroma[(i + shift + 12) % 12]
  return out
}

function normalize(chroma: number[]): number[] {
  const sum = chroma.reduce((acc, n) => acc + Math.max(0, n), 0) + 1e-9
  return chroma.map((n) => Math.max(0, n) / sum)
}

export function formatKeyName(root: string, scale: 'major' | 'minor'): string {
  return `${root} ${scale}`
}

export function camelotForKey(key: string): string | null {
  return CAMELOT[key] || CAMELOT[key.replace(/\s+/g, ' ').trim()] || null
}

const NOTE_LOOKUP: Record<string, string> = {
  C: 'C',
  'C#': 'C#',
  DB: 'C#',
  D: 'D',
  'D#': 'D#',
  EB: 'D#',
  E: 'E',
  F: 'F',
  'F#': 'F#',
  GB: 'F#',
  G: 'G',
  'G#': 'G#',
  AB: 'G#',
  A: 'A',
  'A#': 'A#',
  BB: 'A#',
  B: 'B',
}

/** Parse "A# minor", "Bb min", "C major", or "Am" into a candidate. */
export function candidateFromKeyLabel(label: string, score = 1): RootKeyCandidate | null {
  const raw = label.trim()
  if (!raw) return null
  const match =
    raw.match(/^([A-Ga-g](?:#|b|♯|♭)?)\s*(major|minor|maj|min|m)$/i) ||
    raw.match(/^([A-Ga-g](?:#|b|♯|♭)?)(m)$/i)
  if (!match) return null
  const rootToken = match[1].replace('♯', '#').replace('♭', 'b')
  const resolvedRoot = NOTE_LOOKUP[rootToken.toUpperCase()]
  if (!resolvedRoot) return null
  const modeRaw = (match[2] || 'major').toLowerCase()
  const scale: 'major' | 'minor' = modeRaw === 'major' || modeRaw === 'maj' ? 'major' : 'minor'
  const key = formatKeyName(resolvedRoot, scale)
  return { key, root: resolvedRoot, scale, score, camelot: camelotForKey(key) }
}

/**
 * Pearson r against Krumhansl profiles rarely exceeds ~0.8 even on a clear key.
 * Map that onto a lock percentage so a solid read shows in the 80–95% range.
 */
export function keyLockFromPearson(best: number, second = 0): number {
  const fit = Math.max(0, Math.min(1, (best - 0.18) / 0.62))
  const lifted = Math.pow(fit, 0.55)
  const margin = Math.max(0, best - Math.max(0, second))
  const sep = Math.max(0, Math.min(1, margin / 0.22))
  const lock = 0.82 * lifted + 0.18 * sep
  return Math.round(Math.max(0, Math.min(0.95, lock)) * 1000) / 1000
}

function lockForRanked(ranked: RootKeyCandidate[], chosen: RootKeyCandidate | null): number {
  if (!chosen) return 0
  const runnerUp = ranked.find((item) => item.key !== chosen.key)
  return keyLockFromPearson(chosen.score, runnerUp?.score ?? 0)
}

export function rankKeysFromChroma(bassChroma: number[], mixChroma: number[]): RootKeyCandidate[] {
  const bass = normalize(bassChroma)
  const mix = normalize(mixChroma)
  const weighted = bass.map((value, i) => 0.65 * value + 0.35 * mix[i])
  const z = (() => {
    const mean = weighted.reduce((a, n) => a + n, 0) / 12
    const std = Math.sqrt(weighted.reduce((a, n) => a + (n - mean) ** 2, 0) / 12) + 1e-9
    return weighted.map((n) => (n - mean) / std)
  })()

  const ranked: RootKeyCandidate[] = []
  for (const scale of ['major', 'minor'] as const) {
    const profile = scale === 'major' ? MAJOR_PROFILE : MINOR_PROFILE
    for (let shift = 0; shift < 12; shift++) {
      const score = pearson(roll(z, shift), profile)
      const root = NOTE_NAMES[shift]
      const key = formatKeyName(root, scale)
      ranked.push({ key, root, scale, score, camelot: camelotForKey(key) })
    }
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

export function pickRootKey(bassChroma: number[], mixChroma: number[]): RootKeyResult {
  const bass = normalize(bassChroma)
  let rootIdx = 0
  for (let i = 1; i < 12; i++) if (bass[i] > bass[rootIdx]) rootIdx = i
  const bassRoot = NOTE_NAMES[rootIdx]
  const rankedMix = rankKeysFromChroma(mixChroma, mixChroma)
  const rankedBass = rankKeysFromChroma(bassChroma, mixChroma)
  const atBass = rankedBass.filter((item) => item.root === bassRoot)
  // Mix/harmonic winner is the default. Bass pitch class stays an alternative (808s often sit on the 5th).
  const chosen = rankedMix[0] || atBass[0] || rankedBass[0] || null
  const confidence = lockForRanked(rankedMix.length ? rankedMix : rankedBass, chosen)
  const unpitched = !chosen || chosen.score < 0.16 || confidence < 0.28
  const candidates: RootKeyCandidate[] = []
  for (const item of [chosen, atBass[0], ...rankedMix.slice(0, 3), ...rankedBass.slice(0, 2)]) {
    if (item && !candidates.some((row) => row.key === item.key)) candidates.push(item)
  }
  return {
    key: chosen && !unpitched ? chosen.key : chosen ? chosen.key : null,
    root: chosen?.root || bassRoot,
    scale: chosen?.scale || null,
    confidence: Math.round(confidence * 1000) / 1000,
    camelot: chosen && !unpitched ? chosen.camelot : null,
    unpitched,
    candidates: candidates.slice(0, 4),
  }
}

/** Melody / vocal / lead key from high-mid chroma (not locked to the bass root). */
export function pickToplineKey(leadChroma: number[]): RootKeyResult {
  const lead = normalize(leadChroma)
  let rootIdx = 0
  for (let i = 1; i < 12; i++) if (lead[i] > lead[rootIdx]) rootIdx = i
  const ranked = rankKeysFromChroma(leadChroma, leadChroma)
  const chosen = ranked[0] || null
  const confidence = lockForRanked(ranked, chosen)
  const unpitched = !chosen || chosen.score < 0.14 || confidence < 0.28
  return {
    key: chosen && !unpitched ? chosen.key : chosen ? chosen.key : null,
    root: chosen?.root || NOTE_NAMES[rootIdx],
    scale: chosen?.scale || null,
    confidence: Math.round(confidence * 1000) / 1000,
    camelot: chosen && !unpitched ? chosen.camelot : null,
    unpitched,
    candidates: ranked.slice(0, 4),
  }
}

export type RankedKeyPick = RootKeyCandidate & {
  lock: number
  source: 'dna' | 'root' | 'topline'
}

const SOURCE_RANK: Record<RankedKeyPick['source'], number> = { dna: 3, topline: 2, root: 1 }

function asCandidate(result: RootKeyResult): RootKeyCandidate | null {
  if (!result.key || !result.root) return null
  return {
    key: result.key,
    root: result.root,
    scale: result.scale || 'minor',
    score: result.confidence,
    camelot: result.camelot,
  }
}

/** Rank chroma alternatives; a measured Sonic DNA key always wins as the default. */
export function pickBestKeyFromSources(sources: {
  dna?: { candidate: RootKeyCandidate; lock: number; unpitched?: boolean } | null
  root?: RootKeyResult | null
  topline?: RootKeyResult | null
}): { chosen: RankedKeyPick | null; candidates: RankedKeyPick[] } {
  const pool: RankedKeyPick[] = []
  const dnaUsable = Boolean(sources.dna?.candidate?.key && !sources.dna.unpitched)

  if (sources.dna?.candidate?.key) {
    pool.push({
      ...sources.dna.candidate,
      lock: Math.max(0, Math.min(0.95, sources.dna.lock)),
      source: 'dna',
    })
  }

  const addResult = (result: RootKeyResult | null | undefined, source: 'root' | 'topline') => {
    if (!result) return
    const peers = [
      ...(result.candidates.length
        ? result.candidates
        : [asCandidate(result)].filter((item): item is RootKeyCandidate => Boolean(item))),
    ]
    const chosen = asCandidate(result)
    if (chosen && !peers.some((item) => item.key === chosen.key)) peers.unshift(chosen)
    for (const candidate of peers) {
      const lock =
        chosen && candidate.key === chosen.key
          ? result.confidence
          : lockForRanked(peers, candidate)
      pool.push({ ...candidate, lock: Math.max(0, Math.min(0.95, lock)), source })
    }
  }

  addResult(sources.root, 'root')
  addResult(sources.topline, 'topline')

  const bestByKey = new Map<string, RankedKeyPick>()
  for (const item of pool) {
    const prev = bestByKey.get(item.key)
    if (
      !prev ||
      item.lock > prev.lock + 0.002 ||
      (Math.abs(item.lock - prev.lock) <= 0.002 && SOURCE_RANK[item.source] > SOURCE_RANK[prev.source])
    ) {
      bestByKey.set(item.key, item)
    }
  }

  const ranked = [...bestByKey.values()].sort((a, b) => {
    if (b.lock !== a.lock) return b.lock - a.lock
    return SOURCE_RANK[b.source] - SOURCE_RANK[a.source]
  })
  const dnaPick = ranked.find((item) => item.source === 'dna') || null
  const chosen = dnaUsable ? dnaPick : ranked[0] || null
  const rest = ranked.filter((item) => item.key !== chosen?.key)
  return { chosen, candidates: chosen ? [chosen, ...rest].slice(0, 8) : ranked.slice(0, 8) }
}

function fftRadix2(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      const half = len >> 1
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j]
        const uIm = im[i + j]
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + half] = uRe - vRe
        im[i + j + half] = uIm - vIm
        const nextRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextRe
      }
    }
  }
}

function hzToPitchClass(hz: number): number | null {
  if (hz < 40 || hz > 5000) return null
  const midi = 69 + 12 * Math.log2(hz / 440)
  if (!Number.isFinite(midi)) return null
  return ((Math.round(midi) % 12) + 12) % 12
}

function accumulateChroma(channel: Float32Array, sampleRate: number): { bass: number[]; mix: number[]; lead: number[] } {
  const size = 4096
  const hop = 2048
  const bass = new Array(12).fill(0)
  const mix = new Array(12).fill(0)
  const lead = new Array(12).fill(0)
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const window = new Float64Array(size)
  for (let i = 0; i < size; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))

  const maxOffset = Math.max(0, channel.length - size)
  for (let offset = 0; offset <= maxOffset; offset += hop) {
    for (let i = 0; i < size; i++) {
      re[i] = channel[offset + i] * window[i]
      im[i] = 0
    }
    fftRadix2(re, im)
    const nyquist = size / 2
    let peakMag = 0
    let peakPc = -1
    for (let bin = 1; bin < nyquist; bin++) {
      const hz = (bin * sampleRate) / size
      const pc = hzToPitchClass(hz)
      if (pc == null) continue
      const mag = Math.log1p(re[bin] * re[bin] + im[bin] * im[bin])
      if (hz >= 55 && hz <= 280) bass[pc] += mag
      if (hz >= 80 && hz <= 4000) mix[pc] += mag
      if (hz >= 330 && hz <= 2800) {
        lead[pc] += mag
        if (mag > peakMag) {
          peakMag = mag
          peakPc = pc
        }
      }
    }
    if (peakPc >= 0 && peakMag > 0) lead[peakPc] += peakMag * 1.4
  }
  return { bass, mix, lead }
}

export async function analyzeRootKeyFromUrl(audioUrl: string): Promise<TrackKeyResult> {
  const audioContext = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  try {
    const response = await fetch(audioUrl)
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const sampleRate = audioBuffer.sampleRate
    const full = audioBuffer.getChannelData(0)
    const hop = Math.max(1, Math.floor(sampleRate / 11025))
    const low: number[] = []
    for (let i = 0; i < Math.min(full.length, sampleRate * 180); i += hop) low.push(full[i])
    const dropSec = detectFirstDropSec(low, sampleRate / hop)
    const start = Math.min(full.length - 1, Math.floor(sampleRate * dropSec))
    const maxSamples = Math.min(full.length - start, Math.floor(sampleRate * BEAT_COUNT_WINDOW_SEC))
    const channel = full.slice(start, start + Math.max(maxSamples, sampleRate))
    const { bass, mix, lead } = accumulateChroma(channel, sampleRate)
    const root = pickRootKey(bass, mix)
    const topline = pickToplineKey(lead)
    return { ...root, topline }
  } finally {
    await audioContext.close().catch(() => {})
  }
}
