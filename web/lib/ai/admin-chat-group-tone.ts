/**
 * Color for a reply grouping title. Meaning wins over markdown level so
 * "do today", "before release", and "drop day" do not share one green.
 */

export type ReplyGroupTone = 'now' | 'soon' | 'go' | 'action' | 'plan'

export const REPLY_GROUP_TONE_CLASS: Record<ReplyGroupTone, { text: string; rule: string; marker: string }> = {
  now: { text: 'text-rose-300', rule: 'border-rose-500/80', marker: 'marker:text-rose-300' },
  soon: { text: 'text-amber-300', rule: 'border-amber-400/80', marker: 'marker:text-amber-300' },
  go: { text: 'text-emerald-300', rule: 'border-emerald-400/80', marker: 'marker:text-emerald-300' },
  action: { text: 'text-sky-300', rule: 'border-sky-400/80', marker: 'marker:text-sky-300' },
  plan: { text: 'text-violet-300', rule: 'border-violet-400/80', marker: 'marker:text-violet-300' },
}

const EMOJI_TONE: Array<[RegExp, ReplyGroupTone]> = [
  [/🔴|🚨|⛔|❗/, 'now'],
  [/🟡|🟠|⚠️|⚠/, 'soon'],
  [/🟢|✅|✔/, 'go'],
]

const WORD_TONE: Array<[RegExp, ReplyGroupTone]> = [
  [/\b(right now|today|urgent|asap|attention|blocker|critical|stuck)\b/i, 'now'],
  [/\b(drop day|go live|goes live)\b/i, 'go'],
  [/\b(checklist|overview|snapshot|launch plan)\b/i, 'plan'],
  [/\b(before|upcoming|soon|waiting|prior)\b/i, 'soon'],
  [/\b(what to do|next step|next action|do this)\b/i, 'action'],
]

export function replyGroupTone(raw: string): ReplyGroupTone | null {
  const text = raw.replace(/\*\*/g, '').replace(/^#{1,3}\s*/, '').trim()
  if (!text) return null
  for (const [pattern, tone] of EMOJI_TONE) {
    if (pattern.test(text)) return tone
  }
  for (const [pattern, tone] of WORD_TONE) {
    if (pattern.test(text)) return tone
  }
  return null
}

/** Short setup line that introduces the next block: "Here is…", "Here's…", or a line that ends with a colon. */
export function isReplyLeadIn(raw: string): boolean {
  const text = raw.replace(/\*\*/g, '').replace(/`+/g, '').trim()
  if (!text || text.length > 160) return false
  if (/^(-{3,}|_{3,}|\|)/.test(text)) return false
  if (/^[/#{}[\]]/.test(text)) return false
  if (/:\s*$/.test(text)) return true
  return /^(here(?:['’])s|here is|here are)\b/i.test(text)
}
