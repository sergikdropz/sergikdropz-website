import { describe, expect, it } from 'vitest'
import {
  replacementForProviderEcho,
  sanitizeConnectedProviderReply,
  unwrapEchoedProviderFailure,
} from '@/lib/ai/admin-chat-provider-echo'

const NESTED =
  'Request received: "Request received: "It is only a preview, so it saved nothing and there is nothing to approve."."'

describe('unwrapEchoedProviderFailure', () => {
  it('peels nested Request received quotes down to the preview note', () => {
    const out = unwrapEchoedProviderFailure(NESTED)
    expect(out.echoed).toBe(true)
    expect(out.text).toBe('It is only a preview, so it saved nothing and there is nothing to approve.')
  })

  it('leaves a normal question alone', () => {
    const out = unwrapEchoedProviderFailure('What should the hero CTA say?')
    expect(out.echoed).toBe(false)
    expect(out.text).toBe('What should the hero CTA say?')
  })
})

describe('sanitizeConnectedProviderReply', () => {
  it('replaces a parroted outage when a provider actually answered', () => {
    const reply = sanitizeConnectedProviderReply(
      'No LLM provider is available with the current environment.',
      'ollama',
      NESTED,
    )
    expect(reply).toMatch(/preview/i)
    expect(reply).not.toMatch(/No LLM provider/)
  })

  it('keeps a real outage when no provider answered', () => {
    const raw = 'No LLM provider is available with the current environment.'
    expect(sanitizeConnectedProviderReply(raw, null, NESTED)).toBe(raw)
  })
})

describe('replacementForProviderEcho', () => {
  it('tells the user a preview did not save', () => {
    expect(replacementForProviderEcho('It is only a preview, so it saved nothing and there is nothing to approve.')).toMatch(
      /nothing waiting to approve/i,
    )
  })
})
