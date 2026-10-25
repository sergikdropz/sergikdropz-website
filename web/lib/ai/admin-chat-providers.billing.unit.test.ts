import { describe, expect, it } from 'vitest'
import { isChatAbortError, isProviderBillingBlock } from '@/lib/ai/admin-chat-providers'

describe('isProviderBillingBlock', () => {
  it('recognizes an Anthropic credit refusal', () => {
    const error = new Error(
      'anthropic: invalid_request_error 400 Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    )
    expect(isProviderBillingBlock(error)).toBe(true)
  })

  it('recognizes an OpenAI quota refusal', () => {
    expect(
      isProviderBillingBlock(
        new Error('You exceeded your current quota, please check your plan and billing details.'),
      ),
    ).toBe(true)
  })

  it('leaves ordinary request failures pinned to the chosen provider', () => {
    expect(isProviderBillingBlock(new Error('model not found'))).toBe(false)
  })
})

describe('isChatAbortError', () => {
  it('recognizes the fetch abort wording Ollama returns', () => {
    expect(isChatAbortError(new Error('This operation was aborted'))).toBe(true)
    const abort = new Error('The operation was aborted.')
    abort.name = 'AbortError'
    expect(isChatAbortError(abort)).toBe(true)
  })

  it('leaves ordinary failures alone', () => {
    expect(isChatAbortError(new Error('model not found'))).toBe(false)
  })
})
