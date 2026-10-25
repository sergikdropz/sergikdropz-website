import { describe, expect, it } from 'vitest'
import {
  audienceAccountForContact,
  bucketAudience,
  campaignBroadcastDraft,
  campaignMailbox,
  deskMetrics,
  deskTemplates,
  mailUsage,
  mergeAudienceContact,
  applyMailRecipient,
  personalizeBroadcast,
  predictMailRecipients,
  sliceBroadcast,
} from '@/lib/email/department-desk'

describe('department desk routing', () => {
  it('sends each contact to the department that owns that relationship', () => {
    expect(audienceAccountForContact({ source: 'website' })).toBe('fans')
    expect(audienceAccountForContact({ source: 'stripe', tags: ['merch'] })).toBe('shop')
    expect(audienceAccountForContact({ source: 'download', tags: [] })).toBe('drops')
    expect(audienceAccountForContact({ tags: ['press'] })).toBe('press')
    expect(audienceAccountForContact({ source: 'booking form' })).toBe('bookings')
    expect(audienceAccountForContact({ source: 'campaign' })).toBe('promo')
  })

  it('dedupes an address and keeps the more specific tags', () => {
    const merged = mergeAudienceContact(
      { email: 'fan@example.com', name: '', source: 'website', tags: [] },
      { email: 'fan@example.com', name: 'Ada', source: 'press list', tags: ['press'] },
    )
    const buckets = bucketAudience([
      merged,
      { email: 'fan@example.com', name: 'Ada', source: 'website', tags: [] },
    ])
    expect(buckets.get('press')?.map((contact) => contact.email)).toEqual(['fan@example.com'])
    expect(buckets.get('fans')).toBeUndefined()
  })

  it('routes a campaign name to the mailbox that should send it', () => {
    expect(campaignMailbox('Staying A Vibe blast')).toBe('promo')
    expect(campaignMailbox('Merch restock')).toBe('shop')
    expect(campaignMailbox('Radio follow-up')).toBe('press')
  })

  it('drafts a release campaign into a broadcast the list can receive', () => {
    expect(
      campaignBroadcastDraft({
        name: 'Staying A Vibe - Release Campaign',
        description: 'Automated release week sequence',
        scheduledAt: '2026-10-08T07:00:00.000Z',
        now: new Date('2026-10-04T16:00:00.000Z'),
      }),
    ).toEqual({
      accountId: 'promo',
      audienceId: 'fans',
      subject: 'Staying A Vibe — out October 8',
      body: 'Hi {{name}},\n\nStaying A Vibe is out on October 8.\n\nListen: https://sergikdropz.com/music\n\n— SERGIK',
    })
  })

  it('predicts fans and subscribers from the address being typed', () => {
    const contacts = [
      { email: 'ada@example.com', name: 'Ada' },
      { email: 'allan@example.com', name: 'Allan' },
      { email: 'sean@example.com', name: 'Sean Watson' },
    ]
    expect(predictMailRecipients(contacts, 'al')).toEqual([{ email: 'allan@example.com', name: 'Allan' }])
    expect(predictMailRecipients(contacts, 'ada@example.com, sea')).toEqual([
      { email: 'sean@example.com', name: 'Sean Watson' },
    ])
    expect(applyMailRecipient('ada@example.com, sea', 'sean@example.com')).toBe('ada@example.com, sean@example.com, ')
  })

  it('fills a name token and leaves other copy alone', () => {
    expect(personalizeBroadcast('Hi {{name}}, the record is up.', 'Ada')).toBe('Hi Ada, the record is up.')
    expect(personalizeBroadcast('Hi {{ name }}.', '')).toBe('Hi there.')
  })

  it('offers a template for every sending department', () => {
    const ids = new Set(deskTemplates().map((template) => template.accountId))
    for (const id of ['studio', 'drops', 'fans', 'promo', 'bookings', 'press', 'shop', 'support']) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('counts mail by folder and mailbox', () => {
    const metrics = deskMetrics(
      [
        { accountId: 'studio', folder: 'sent', status: 'sent' },
        { accountId: 'studio', folder: 'sent', status: 'bounced' },
        { accountId: 'promo', folder: 'inbox', status: 'received' },
        { accountId: 'promo', folder: 'scheduled', status: 'scheduled' },
      ],
      'studio',
    )
    expect(metrics.sent).toBe(2)
    expect(metrics.failed).toBe(1)
    expect(metrics.inbox).toBe(0)
    expect(metrics.byAccount).toEqual([{ id: 'studio', sent: 2, inbox: 0, failed: 1, scheduled: 0 }])
  })

  it('measures desk mail against the sending plan', () => {
    expect(mailUsage({ sent: 12, contacts: 65 })).toEqual({
      transactional: { used: 12, limit: 3000 },
      contacts: { used: 65, limit: 1000 },
    })
  })

  it('sends broadcasts in capped passes', () => {
    const people = Array.from({ length: 45 }, (_, index) => index)
    expect(sliceBroadcast(people, 0)).toEqual({ batch: people.slice(0, 40), remaining: 5 })
    expect(sliceBroadcast(people, 40).batch).toEqual([40, 41, 42, 43, 44])
  })
})
