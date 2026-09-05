/** Shallow key-level diff for exec preview JSON (no deep array diff). */
export function shallowPayloadDiffLines(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null
): string[] {
  if (!previous || Object.keys(previous).length === 0) {
    return [
      '(no prior preview payload in this chat session for this tool — use Regenerate preview to build a baseline for comparison.)',
    ]
  }
  if (!next) return ['(missing new payload)']

  const lines: string[] = []
  const prevKeys = new Set(Object.keys(previous))
  const nextKeys = new Set(Object.keys(next))

  for (const k of Array.from(nextKeys)) {
    if (!prevKeys.has(k)) {
      lines.push(`+ ${k}: ${JSON.stringify(next[k])}`)
    }
  }
  for (const k of Array.from(prevKeys)) {
    if (!nextKeys.has(k)) {
      lines.push(`− ${k}: ${JSON.stringify(previous[k])}`)
    }
  }
  for (const k of Array.from(nextKeys)) {
    if (!prevKeys.has(k)) continue
    const a = previous[k]
    const b = next[k]
    const sa = stableValueRepr(a)
    const sb = stableValueRepr(b)
    if (sa !== sb) {
      lines.push(`~ ${k}: ${sa} → ${sb}`)
    }
  }
  if (lines.length === 0) return ['(no top-level JSON key changes detected)']
  return lines
}

function stableValueRepr(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'object') return JSON.stringify(v)
  return JSON.stringify(v)
}
