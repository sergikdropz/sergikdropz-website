import { describe, expect, it } from 'vitest'
import {
  departmentMailCounts,
  dueScheduledMail,
  extractEmailAddresses,
  filterDepartmentMail,
  groupMailThreads,
  matchDepartmentRecipient,
  normalizeStoredAttachments,
  parseOutgoingAttachments,
  replySubject,
  type DepartmentMailMessage,
} from '@/lib/email/department-mailbox'
import { snippetsForAccount } from '@/lib/email/mail-snippets'

function message(patch: Partial<DepartmentMailMessage>): DepartmentMailMessage {
  return {
    id: '1',
    accountId: 'studio',
    folder: 'inbox',
    direction: 'in',
    fromAddress: 'a@example.com',
    fromName: 'Ada',
    to: 'release.studio@sergikdropz.com',
    subject: 'Hello',
    body: 'Body',
    status: 'received',
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

describe('department mailbox', () => {
  it('pulls addresses out of display names', () => {
    expect(extractEmailAddresses(['Ada <A@Example.com>', 'b@x.co'])).toEqual(['a@example.com', 'b@x.co'])
    expect(
      matchDepartmentRecipient('Press desk <press@sergikdropz.com>', [
        { id: 'press', address: 'press@sergikdropz.com', name: 'SERGIK Press' },
      ])?.id,
    ).toBe('press')
    expect(matchDepartmentRecipient('other@example.com', [])).toBeNull()
  })

  it('keeps an existing Re: and prefixes a plain subject', () => {
    expect(replySubject('Hold request')).toBe('Re: Hold request')
    expect(replySubject('re: Hold request')).toBe('re: Hold request')
  })

  it('filters by folder, mailbox, and search, with scheduled soonest first', () => {
    const rows = [
      message({ id: 'a', folder: 'sent', subject: 'Contract', updatedAt: '2026-10-02T00:00:00.000Z' }),
      message({ id: 'b', folder: 'sent', accountId: 'press', subject: 'Radio', body: 'playlist', updatedAt: '2026-10-03T00:00:00.000Z' }),
      message({
        id: 'c',
        folder: 'scheduled',
        subject: 'Later',
        scheduledAt: '2026-10-08T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      }),
      message({
        id: 'd',
        folder: 'scheduled',
        subject: 'Soon',
        scheduledAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-04T00:00:00.000Z',
      }),
    ]
    expect(filterDepartmentMail(rows, { folder: 'sent', query: 'playlist' }).map((row) => row.id)).toEqual(['b'])
    expect(filterDepartmentMail(rows, { folder: 'sent', accountId: 'studio' }).map((row) => row.id)).toEqual(['a'])
    expect(filterDepartmentMail(rows, { folder: 'scheduled' }).map((row) => row.id)).toEqual(['d', 'c'])
    expect(departmentMailCounts(rows, 'press').sent).toBe(1)
  })

  it('treats only pending scheduled mail as due', () => {
    const now = Date.parse('2026-10-04T18:00:00.000Z')
    const rows = [
      message({ id: 'due', folder: 'scheduled', scheduledAt: '2026-10-04T17:00:00.000Z', status: 'scheduled' }),
      message({ id: 'later', folder: 'scheduled', scheduledAt: '2026-10-05T17:00:00.000Z', status: 'scheduled' }),
      message({ id: 'failed', folder: 'scheduled', scheduledAt: '2026-10-04T10:00:00.000Z', status: 'failed' }),
    ]
    expect(dueScheduledMail(rows, now).map((row) => row.id)).toEqual(['due'])
  })

  it('groups a reply with the original by subject and people', () => {
    const rows = [
      message({ id: 'out', direction: 'out', fromAddress: 'bookings@sergikdropz.com', to: 'ada@venue.com', subject: 'Date hold', createdAt: '2026-10-01T00:00:00.000Z' }),
      message({ id: 'in', direction: 'in', fromAddress: 'ada@venue.com', to: 'bookings@sergikdropz.com', subject: 'Re: Date hold', createdAt: '2026-10-02T00:00:00.000Z' }),
      message({ id: 'other', accountId: 'press', fromAddress: 'press@sergikdropz.com', to: 'ada@venue.com', subject: 'Date hold' }),
    ]
    const threads = groupMailThreads(rows)
    expect(threads.find((thread) => thread.latest.id === 'in')?.messages.map((row) => row.id)).toEqual(['out', 'in'])
    expect(threads.find((thread) => thread.messages.some((row) => row.id === 'other'))?.messages).toHaveLength(1)
  })

  it('keeps snippets on their mailbox', () => {
    expect(snippetsForAccount('bookings').map((item) => item.id)).toEqual(['booking-hold'])
    expect(snippetsForAccount('press').map((item) => item.id)).toEqual(['press-note'])
    expect(snippetsForAccount('studio').map((item) => item.id)).toEqual(['release-day'])
    expect(snippetsForAccount('promo')).toEqual([])
  })

  it('rejects too many or oversized attachments', () => {
    expect(parseOutgoingAttachments(null)).toEqual([])
    expect(() =>
      parseOutgoingAttachments([
        { filename: 'a.txt', contentBase64: 'YQ==' },
        { filename: 'b.txt', contentBase64: 'YQ==' },
        { filename: 'c.txt', contentBase64: 'YQ==' },
        { filename: 'd.txt', contentBase64: 'YQ==' },
      ]),
    ).toThrow(/3 files/)
    expect(() => parseOutgoingAttachments([{ filename: 'big.bin', contentBase64: 'A'.repeat(3_000_000) }])).toThrow(/2 MB/)
  })

  it('keeps a stored contract PDF downloadable without returning the bytes', () => {
    const href = '/api/studio/releases/11111111-1111-4111-8111-111111111111/contracts/pdf?kind=split_sheet'
    const rows = normalizeStoredAttachments(
      [
        { filename: 'split.pdf', contentType: 'application/pdf', size: 1200, contentBase64: 'A'.repeat(40) },
        { filename: 'live.pdf', contentType: 'application/pdf', size: 0, href },
        { filename: 'evil.pdf', href: 'https://evil.example/file.pdf' },
      ],
      '22222222-2222-4222-8222-222222222222',
    )
    expect(rows[0]).toMatchObject({ filename: 'split.pdf' })
    expect(rows[0].href).toContain('/api/admin/email/attachment?')
    expect(rows[0]).not.toHaveProperty('contentBase64')
    expect(rows[1].href).toBe(href)
    expect(rows[2].href).toBeUndefined()
  })
})
