/** Garment size order: XXS … 5XL, then numeric (waist/shoe/youth) sizes, then anything else. */
const LETTER_ORDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl']

function normalizeSize(size: string): string {
  return size
    .trim()
    .toLowerCase()
    .replace(/^xxl$/, '2xl')
    .replace(/^xxxl$/, '3xl')
    .replace(/^xxxxl$/, '4xl')
    .replace(/^one size$|^os$/, 'one size')
}

export function sizeRank(size: string): number {
  const norm = normalizeSize(size)
  const letter = LETTER_ORDER.indexOf(norm)
  if (letter >= 0) return letter
  if (norm === 'one size') return 100
  const numeric = Number.parseFloat(norm)
  if (Number.isFinite(numeric)) return 200 + numeric
  return 10_000
}

/** Stable sort into wearable order (S, M, L, XL, 2XL …) instead of alphabetical (2XL, 3XL, L, M …). */
export function sortSizes(sizes: string[]): string[] {
  return sizes
    .map((size, index) => ({ size, index, rank: sizeRank(size) }))
    .sort((a, b) => a.rank - b.rank || a.size.localeCompare(b.size) || a.index - b.index)
    .map((item) => item.size)
}
