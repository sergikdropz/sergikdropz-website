import { describe, expect, it } from 'vitest'
import { crowelogicOpenAiUrl, resolveCrowelogicEnv } from '@/lib/ai/crowelogic-env'

describe('crowelogicOpenAiUrl', () => {
  it('uses /v1/ paths for local bridge base', () => {
    expect(crowelogicOpenAiUrl('http://127.0.0.1:8011', 'models')).toBe(
      'http://127.0.0.1:8011/v1/models'
    )
    expect(crowelogicOpenAiUrl('http://127.0.0.1:8011', 'chat/completions')).toBe(
      'http://127.0.0.1:8011/v1/chat/completions'
    )
  })

  it('avoids double /v1 for hosted CroweLM base', () => {
    expect(crowelogicOpenAiUrl('https://crowelm.com/v1', 'models')).toBe(
      'https://crowelm.com/v1/models'
    )
    expect(crowelogicOpenAiUrl('https://crowelm.com/v1', 'chat/completions')).toBe(
      'https://crowelm.com/v1/chat/completions'
    )
  })
})

describe('resolveCrowelogicEnv', () => {
  it('accepts CROWE_API_KEY alias and defaults bridge URL', () => {
    const prev = {
      CROWELOGIC_BASE_URL: process.env.CROWELOGIC_BASE_URL,
      CROWELOGIC_API_KEY: process.env.CROWELOGIC_API_KEY,
      CROWE_API_KEY: process.env.CROWE_API_KEY,
      CROWELOGIC_MODEL: process.env.CROWELOGIC_MODEL,
    }
    delete process.env.CROWELOGIC_BASE_URL
    delete process.env.CROWELOGIC_API_KEY
    process.env.CROWE_API_KEY = 'test-key'
    process.env.CROWELOGIC_MODEL = 'supreme'
    try {
      const env = resolveCrowelogicEnv()
      expect(env.configured).toBe(true)
      expect(env.keySource).toBe('CROWE_API_KEY')
      expect(env.baseUrl).toBe('http://127.0.0.1:8011')
      expect(env.model).toBe('supreme')
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
        else process.env[k] = v
      }
    }
  })
})
