/**
 * Chat-only helpers (no tool execution). Used to stabilize persona on short follow-ups.
 */

/** True when the message is a bare acknowledgment / continuation (sticky skill applies). */
export function isContinuationOnlyUserMessage(message: string): boolean {
  const t = message.trim()
  if (!t.length || t.length > 140) return false

  const patterns = [
    /^(proceed|continue|go\s+ahead|keep\s+going|next(?:\s+step)?|same\s+plan)(\s*[!.]*)?$/i,
    /^(yes|yeah|yep|yup)(\s*[!.]*)?$/i,
    /^(yes|ok|okay)\s*,?\s*please(\s*[!.]*)?$/i,
    /^(ok|okay|sure|do\s+it|run\s+it|please\s+do|please\s+proceed)(\s*[!.]*)?$/i,
    /^(works|sounds\s+good|that'?s\s+fine|fine\s+by\s+me)(\s*[!.]*)?$/i,
    /^(same\s+thing|the\s+same|as\s+before|like\s+before)(\s*[!.]*)?$/i,
    /^(continue\s+with\s+that|keep\s+at\s+it|more\s+of\s+that|stick\s+with\s+that|carry\s+on)(\s*[!.]*)?$/i,
  ]
  return patterns.some((re) => re.test(t)) || t === '👍'
}
