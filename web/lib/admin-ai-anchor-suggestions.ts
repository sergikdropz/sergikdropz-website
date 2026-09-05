const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g

/**
 * Heuristic, privacy-conscious snippets from the user's last message (never auto-applies).
 * Skips emails; caps length; returns at most 3 strings.
 */
export function suggestAnchorSnippetsFromUserText(raw: string): string[] {
  const t = raw.replace(EMAIL, '').trim()
  if (!t) return []

  const out: string[] = []
  const seen = new Set<string>()

  const push = (s: string) => {
    const x = s.trim()
    if (x.length < 4 || x.length > 96) return
    if (seen.has(x.toLowerCase())) return
    seen.add(x.toLowerCase())
    out.push(x)
  }

  const quoteRe = /"([^"]{4,80})"|'([^']{4,80})'/g
  let m: RegExpExecArray | null
  while ((m = quoteRe.exec(t)) !== null) {
    push(m[1] || m[2] || '')
    if (out.length >= 3) return out
  }

  const isoRe = /\b(20\d{2}-\d{2}-\d{2})\b/g
  while ((m = isoRe.exec(t)) !== null) {
    push(`Date: ${m[1]}`)
    if (out.length >= 3) return out
  }

  const first = t.split(/\n/)[0]?.trim() ?? ''
  if (first.length >= 8 && first.length <= 72 && !first.startsWith('/')) {
    push(first)
  }

  return out.slice(0, 3)
}
