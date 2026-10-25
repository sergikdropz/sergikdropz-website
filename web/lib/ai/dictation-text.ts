/** Join a spoken transcript onto whatever is already in the composer. */
export function appendDictationText(base: string, transcript: string): string {
  const spoken = transcript.replace(/\s+/g, ' ').trim()
  if (!spoken) return base
  if (!base) return spoken
  return `${base}${/\s$/.test(base) ? '' : ' '}${spoken}`
}
