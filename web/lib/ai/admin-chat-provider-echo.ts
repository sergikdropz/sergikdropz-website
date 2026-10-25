/** The local model sometimes continues a previous outage notice instead of answering. */

export function isProviderFailureEcho(message: string): boolean {
  const text = message.trim()
  if (/^Request received:/i.test(text)) return true
  if (/No LLM provider is available/i.test(text)) return true
  return /Provider errors:/i.test(text) && /Configure one of/i.test(text)
}

export function replyPretendsProviderDown(text: string): boolean {
  return /No LLM provider is available/i.test(text)
}

function peelRequestReceived(text: string): string | null {
  const start = text.match(/^Request received:\s*"/i)
  if (!start) return null
  const rest = text.slice(start[0].length)
  const quote = rest.lastIndexOf('"')
  if (quote < 0) return rest.trim()
  return rest.slice(0, quote).trim()
}

export function unwrapEchoedProviderFailure(message: string): { text: string; echoed: boolean } {
  const echoed = isProviderFailureEcho(message)
  let text = message.trim()
  for (let i = 0; i < 6; i += 1) {
    const peeled = peelRequestReceived(text)
    if (peeled && peeled !== text) {
      text = peeled
      continue
    }
    const embedded = text.match(/Request received:\s*"([\s\S]*?)"\s*\.?/i)
    if (embedded && /No LLM provider is available|Provider errors:/i.test(text)) {
      text = embedded[1].trim()
      continue
    }
    break
  }
  return { text, echoed }
}

export function replacementForProviderEcho(unwrapped: string): string {
  const note = unwrapped.trim()
  if (/preview/i.test(note) && /approve|saved nothing/i.test(note)) {
    return [
      'That was a preview. It did not save, so there is nothing waiting to approve.',
      'Send the change you want kept, preview it again, then approve that preview.',
    ].join(' ')
  }
  return [
    'Local chat is connected.',
    note ? `Your note: ${note}` : '',
    'Send the question you want answered.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function sanitizeConnectedProviderReply(
  reply: string,
  provider: string | null,
  userMessage: string,
): string {
  if (!provider || !replyPretendsProviderDown(reply)) return reply
  return replacementForProviderEcho(unwrapEchoedProviderFailure(userMessage).text)
}
