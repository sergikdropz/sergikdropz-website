import { describe, expect, it } from 'vitest'
import { inferSkillFromIntent } from '@/lib/ai/skills/registry'
import {
  callMetaBusinessAgent,
  isMetaBusinessAgentIntent,
  metaBusinessAgentEntityId,
  metaBusinessAgentFailureNote,
  parseMetaBusinessAgentPayload,
} from '@/lib/meta/business-agent'

describe('meta business agent', () => {
  it('recognizes the assistant intent and a phone or instagram id', () => {
    expect(isMetaBusinessAgentIntent('link meta business assistant chat')).toBe(true)
    expect(isMetaBusinessAgentIntent('pull facebook creator earnings')).toBe(false)
    expect(inferSkillFromIntent('link the meta business assistant chat').id).toBe('sergik_intelligence')
    expect(metaBusinessAgentEntityId('17841400297898102', null)).toBe('17841400297898102')
    expect(metaBusinessAgentEntityId('not an id', null)).toBeNull()
  })

  it('maps auth and terms failures without keeping a bearer token', () => {
    expect(metaBusinessAgentFailureNote(401, '')).toContain('whatsapp_business_messaging')
    expect(metaBusinessAgentFailureNote(403, '')).toContain('WhatsApp Manager')
    expect(metaBusinessAgentFailureNote(404, '')).toContain('customer chat off')
    const parsed = parseMetaBusinessAgentPayload({
      error: { message: 'Invalid OAuth access token Bearer abc.def' },
    })
    expect(parsed.detail).toContain('[redacted]')
    expect(parsed.detail).not.toContain('abc.def')
  })

  it('returns the test reply and does not treat eligibility as customer rollout', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(
        JSON.stringify({
          message_id: 'm1',
          agent_response: 'We release on Fridays.',
          conversation_id: 'c1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const result = await callMetaBusinessAgent({
      token: 'secret-token',
      entityId: '123',
      action: 'test',
      message: 'When do you release?',
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    expect(result.agentResponse).toBe('We release on Fridays.')
    expect(result.conversationId).toBe('c1')
    expect(result.note).toContain('Customers on WhatsApp do not see this')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['X-API-Version']).toBe('2.0.0')
    expect(headers.Authorization).toBe('Bearer secret-token')
    expect(calls[0]?.url).toBe('https://api.facebook.com/123/agent_test')
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  it('marks a missing agent as creatable and leaves eligibility false as blocked', async () => {
    const missing = await callMetaBusinessAgent({
      token: 't',
      entityId: '123',
      action: 'status',
      fetchImpl: async () => new Response(JSON.stringify({ title: 'missing', detail: 'none' }), { status: 404 }),
    })
    expect(missing.canOnboard).toBe(true)
    expect(missing.ok).toBe(false)
    const blocked = await callMetaBusinessAgent({
      token: 't',
      entityId: '123',
      action: 'status',
      fetchImpl: async () => new Response(JSON.stringify({ is_eligible: false }), { status: 200 }),
    })
    expect(blocked.ok).toBe(true)
    expect(blocked.eligible).toBe(false)
    expect(blocked.canOnboard).toBe(false)
  })
})
