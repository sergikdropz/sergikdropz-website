import { describe, expect, it } from 'vitest'
import { resolveSonicDnaChatProvider } from '@/lib/ai/admin-ai-chat-preferences'

describe('resolveSonicDnaChatProvider', () => {
  it('uses the Sonic DNA LLM when set', () => {
    expect(
      resolveSonicDnaChatProvider(
        { sonicDnaLlm: 'anthropic', assistantDefaultLlm: 'ollama' },
        'openai',
      ),
    ).toBe('anthropic')
  })

  it('falls back to assistant default, then env', () => {
    expect(
      resolveSonicDnaChatProvider({ sonicDnaLlm: 'auto', assistantDefaultLlm: 'openai' }, 'anthropic'),
    ).toBe('openai')
    expect(
      resolveSonicDnaChatProvider({ sonicDnaLlm: 'auto', assistantDefaultLlm: 'auto' }, 'anthropic'),
    ).toBe('anthropic')
  })
})
