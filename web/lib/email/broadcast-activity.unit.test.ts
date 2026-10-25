import { describe, expect, it } from 'vitest'
import {
  broadcastActivityMessages,
  hasBroadcastSourceTag,
  interactionKindFromResendEvent,
  mergeBroadcastActivity,
} from '@/lib/email/broadcast-activity'
import type { DepartmentMailMessage } from '@/lib/email/department-mailbox'

function stored(patch: Partial<DepartmentMailMessage>): DepartmentMailMessage {
  return {
    id: 'stored',
    accountId: 'promo',
    folder: 'inbox',
    direction: 'in',
    fromAddress: 'ada@example.com',
    fromName: 'Ada',
    to: '',
    subject: 'Opened · Staying A Vibe',
    body: 'Ada opened “Staying A Vibe”.',
    status: 'opened',
    unread: true,
    resendId: null,
    inboundId: null,
    scheduledAt: null,
    errorMessage: null,
    attachments: [],
    createdAt: '2026-10-04T12:00:00.000Z',
    updatedAt: '2026-10-04T12:00:00.000Z',
    ...patch,
  }
}

describe('broadcast activity', () => {
  it('maps engagement events and ignores delivery', () => {
    expect(interactionKindFromResendEvent('email.clicked')).toBe('clicked')
    expect(interactionKindFromResendEvent('email.delivered')).toBeNull()
    expect(hasBroadcastSourceTag([{ name: 'source', value: 'broadcast' }])).toBe(true)
    expect(hasBroadcastSourceTag([{ name: 'source', value: 'admin_desk' }])).toBe(false)
  })

  it('turns broadcast engagement into inbox notices and keeps the strongest action', () => {
    const messages = broadcastActivityMessages({
      sends: [
        {
          id: 'send-1',
          email: 'Ada@Example.com',
          name: 'Ada',
          subject: 'Staying A Vibe',
          status: 'opened',
          openedAt: '2026-10-04T12:00:00.000Z',
          clickedAt: '2026-10-04T13:00:00.000Z',
          at: '2026-10-04T13:00:00.000Z',
        },
        {
          id: 'send-2',
          email: 'quiet@example.com',
          name: 'Quiet',
          subject: 'Staying A Vibe',
          status: 'sent',
          openedAt: null,
          clickedAt: null,
          at: '2026-10-04T11:00:00.000Z',
        },
        {
          id: 'send-3',
          email: 'bo@example.com',
          name: 'Bo',
          subject: 'Staying A Vibe',
          status: 'bounced',
          openedAt: null,
          clickedAt: null,
          at: '2026-10-04T10:00:00.000Z',
        },
      ],
      unsubscribes: [
        { id: 'sub-1', email: 'left@example.com', name: 'Left', at: '2026-10-03T00:00:00.000Z' },
      ],
    })

    expect(messages.map((message) => [message.fromAddress, message.status, message.accountId])).toEqual([
      ['ada@example.com', 'clicked', 'promo'],
      ['bo@example.com', 'bounced', 'promo'],
      ['left@example.com', 'unsubscribed', 'fans'],
    ])
    expect(messages[0]?.folder).toBe('inbox')
    expect(messages[0]?.unread).toBe(true)
    expect(messages[0]?.subject).toBe('Clicked · Staying A Vibe')
    expect(messages[0]?.body).toContain('Ada clicked')
  })

  it('does not repeat an interaction already stored in the inbox', () => {
    const activity = broadcastActivityMessages({
      sends: [
        {
          id: 'send-1',
          email: 'ada@example.com',
          name: 'Ada',
          subject: 'Staying A Vibe',
          status: 'opened',
          openedAt: '2026-10-04T12:00:00.000Z',
          clickedAt: null,
          at: '2026-10-04T12:00:00.000Z',
        },
      ],
      unsubscribes: [],
    })
    const merged = mergeBroadcastActivity([stored({})], activity)
    expect(merged).toHaveLength(1)
    expect(mergeBroadcastActivity([], activity)).toHaveLength(1)
  })
})
