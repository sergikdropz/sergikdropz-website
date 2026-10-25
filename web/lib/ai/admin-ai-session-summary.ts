/**
 * Sticky session summary. The model writes it after each turn.
 * If no provider answers, the previous summary plus this turn is kept verbatim.
 */

import { completeSessionSummary } from '@/lib/ai/admin-chat-providers'

export function fallbackSessionSummary(input: {
  previousSummary: string
  userText: string
  assistantText: string
}): string {
  const user = input.userText.replace(/\s+/g, ' ').trim().slice(0, 180)
  const assistant = input.assistantText.replace(/\s+/g, ' ').trim().slice(0, 360)
  const next = [input.previousSummary.trim(), user ? `User: ${user}` : '', assistant ? `Assistant: ${assistant}` : '']
    .filter(Boolean)
    .join('\n')
  return next.slice(-1200)
}

export async function summarizeAdminSessionTurn(input: {
  previousSummary: string
  userText: string
  assistantText: string
  toolNames: string[]
  provider?: string | null
}): Promise<string> {
  const written = await completeSessionSummary(input).catch(() => '')
  if (written.trim()) return written.trim().slice(0, 1200)
  return fallbackSessionSummary(input)
}
