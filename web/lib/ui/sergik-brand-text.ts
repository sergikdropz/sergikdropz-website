/** Letters that form the SERGIK brand mark (case-insensitive). */
export const SERGIK_BRAND_LETTER_RE = /[sergik]/i

export type SergikBrandChunk = { text: string; brand: boolean }

/** Split a label into runs of SERGIK brand letters vs everything else. */
export function splitSergikBrandText(text: string): SergikBrandChunk[] {
  const value = String(text ?? '')
  if (!value) return []

  const chunks: SergikBrandChunk[] = []
  let i = 0
  while (i < value.length) {
    const brand = SERGIK_BRAND_LETTER_RE.test(value[i]!)
    let j = i + 1
    while (j < value.length && SERGIK_BRAND_LETTER_RE.test(value[j]!) === brand) j += 1
    chunks.push({ text: value.slice(i, j), brand })
    i = j
  }
  return chunks
}
