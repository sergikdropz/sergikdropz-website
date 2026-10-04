import { afterEach, describe, expect, it } from 'vitest'
import { crowelogicOpenAiUrl, resolveCrowelogicEnv } from '@/lib/ai/crowelogic-env'

const ENV_KEYS = [
  'CROWELOGIC_BASE_URL',
  'CROWE_LOGIC_URL',
  'FOUNDRY_BASE_URL',
  'CROWELOGIC_API_KEY',
  'CROWE_LOGIC_KEY',
  'FOUNDRY_API_KEY',
  'CROWE_API_KEY',
  'CROWELOGIC_MODEL',
  'CROWELOGIC_PRO_LINKED',
] as const

const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

function snapshotEnv() {
  for (const key of ENV_KEYS) previous[key] = process.env[key]
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

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
  afterEach(() => {
    restoreEnv()
  })

  it('keeps Crowe Creative key off the chat provider', () => {
    snapshotEnv()
    for (const key of ENV_KEYS) delete process.env[key]
    process.env.CROWE_API_KEY = 'creative-key'
    const env = resolveCrowelogicEnv()
    expect(env.configured).toBe(false)
    expect(env.credentialPresent).toBe(false)
    expect(env.activation).toBe('off')
    expect(env.keySource).toBeNull()
    expect(env.baseUrl).toBe('http://127.0.0.1:8011')
  })

  it('enables the local bridge from the customer credential', () => {
    snapshotEnv()
    for (const key of ENV_KEYS) delete process.env[key]
    process.env.CROWELOGIC_API_KEY = 'customer-credential'
    process.env.CROWELOGIC_MODEL = 'supreme'
    const env = resolveCrowelogicEnv()
    expect(env.configured).toBe(true)
    expect(env.activation).toBe('local_bridge')
    expect(env.keySource).toBe('CROWELOGIC_API_KEY')
    expect(env.baseUrl).toBe('http://127.0.0.1:8011')
    expect(env.model).toBe('supreme')
  })

  it('holds hosted chat until Pro linkage is confirmed', () => {
    snapshotEnv()
    for (const key of ENV_KEYS) delete process.env[key]
    process.env.CROWELOGIC_API_KEY = 'customer-credential'
    process.env.CROWELOGIC_BASE_URL = 'https://gateway.example/v1'
    const pending = resolveCrowelogicEnv()
    expect(pending.credentialPresent).toBe(true)
    expect(pending.configured).toBe(false)
    expect(pending.activation).toBe('pending_pro_linkage')

    process.env.CROWELOGIC_PRO_LINKED = '1'
    const live = resolveCrowelogicEnv()
    expect(live.configured).toBe(true)
    expect(live.activation).toBe('pro_gateway')
  })
})
