import { describe, expect, it } from 'vitest'
import {
  collabInboundLocalPart,
  collabReplyToAddress,
  parseReleaseIdFromInboundAddress,
  stripInboundReplyBody,
} from '@/lib/studio/collab-inbound'
import { collabOutboundReplyTo } from '@/lib/studio/release-collab'

describe('collab-inbound', () => {
  it('round-trips release id on collab subdomain address', () => {
    const releaseId = 'ep-night-drive-2026'
    const addr = collabReplyToAddress(releaseId)
    expect(addr).toContain(collabInboundLocalPart(releaseId))
    expect(parseReleaseIdFromInboundAddress(addr)).toBe(releaseId)
  })

  it('round-trips release id on verified-domain plus reply-to', () => {
    const releaseId = 'abc-123'
    const addr = collabOutboundReplyTo(releaseId)
    expect(addr).toContain('+')
    expect(parseReleaseIdFromInboundAddress(addr)).toBe(releaseId)
  })

  it('parses angle-bracket from headers', () => {
    const releaseId = 'abc-123'
    const addr = collabReplyToAddress(releaseId)
    expect(parseReleaseIdFromInboundAddress(`Collaborator <${addr}>`)).toBe(releaseId)
  })

  it('strips quoted reply tails', () => {
    const body = 'Looks good!\n\nOn Fri, someone wrote:\n> old text'
    expect(stripInboundReplyBody(body)).toBe('Looks good!')
  })
})
