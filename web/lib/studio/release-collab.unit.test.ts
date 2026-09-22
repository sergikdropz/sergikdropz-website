import { describe, expect, it } from 'vitest'
import {
  collabInviteExpiresAt,
  collabPortalPath,
  collabStatusFromResendEvent,
  collabThreadNotifySubject,
  collaboratorsFromPartyContacts,
  createCollabInviteToken,
  isCollabInviteActive,
  normalizeCollabEmail,
  parseCollabRole,
} from '@/lib/studio/release-collab'

describe('release-collab', () => {
  it('normalizes emails and roles', () => {
    expect(normalizeCollabEmail('  A@B.Com ')).toBe('a@b.com')
    expect(normalizeCollabEmail('nope')).toBeNull()
    expect(parseCollabRole('Producer')).toBe('producer')
    expect(parseCollabRole('mystery')).toBe('collaborator')
  })

  it('seeds from party contacts', () => {
    expect(
      collaboratorsFromPartyContacts([
        { stage: 'Auxlee', email: 'a@x.com' },
        { stage: 'Bad', email: 'not-an-email' },
      ]),
    ).toEqual([{ name: 'Auxlee', email: 'a@x.com', role: 'collaborator' }])
  })

  it('builds invite tokens and expiry', () => {
    const token = createCollabInviteToken()
    expect(token.length).toBeGreaterThan(20)
    expect(collabPortalPath(token)).toBe(`/collab/${encodeURIComponent(token)}`)
    const expires = collabInviteExpiresAt(7, Date.parse('2026-01-01T00:00:00Z'))
    expect(expires).toBe('2026-01-08T00:00:00.000Z')
    expect(
      isCollabInviteActive({ expires_at: expires, revoked_at: null }, Date.parse('2026-01-07T00:00:00Z')),
    ).toBe(true)
    expect(
      isCollabInviteActive({ expires_at: expires, revoked_at: null }, Date.parse('2026-01-09T00:00:00Z')),
    ).toBe(false)
    expect(
      isCollabInviteActive(
        { expires_at: expires, revoked_at: '2026-01-02T00:00:00Z' },
        Date.parse('2026-01-03T00:00:00Z'),
      ),
    ).toBe(false)
  })

  it('maps Resend webhook events', () => {
    expect(collabStatusFromResendEvent('email.delivered')).toEqual({
      status: 'delivered',
      stamp: 'delivered_at',
    })
    expect(collabStatusFromResendEvent('email.opened')?.status).toBe('opened')
    expect(collabStatusFromResendEvent('email.bounced')?.status).toBe('bounced')
    expect(collabStatusFromResendEvent('email.unknown')).toBeNull()
  })

  it('builds notify subjects', () => {
    expect(collabThreadNotifySubject('Night Drive')).toBe('New message — Night Drive')
  })
})
