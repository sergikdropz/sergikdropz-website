import { afterEach, describe, expect, it } from 'vitest'
import {
  departmentAddress,
  departmentFromHeader,
  departmentMailPlain,
  departmentPlainTextHtml,
  listMailDepartments,
  mailAccountIdFromLocalPart,
  mergeMailAccounts,
  normalizeLocalPart,
  parseRecipientList,
} from '@/lib/email/departments'

describe('department mail', () => {
  afterEach(() => {
    delete process.env.SERGIK_MAIL_DOMAIN
  })

  it('addresses every department on sergikdropz.com', () => {
    expect(departmentAddress('studio')).toBe('release.studio@sergikdropz.com')
    expect(departmentFromHeader('bookings')).toBe('SERGIK Bookings <bookings@sergikdropz.com>')
    const addresses = listMailDepartments().map((item) => item.address)
    expect(new Set(addresses).size).toBe(addresses.length)
    expect(addresses.every((address) => address.endsWith('@sergikdropz.com'))).toBe(true)
  })

  it('honors a domain override', () => {
    process.env.SERGIK_MAIL_DOMAIN = '@Example.com'
    expect(departmentAddress('press')).toBe('press@example.com')
  })

  it('parses a recipient list and rejects junk', () => {
    expect(parseRecipientList(' A@sergikdropz.com, a@sergikdropz.com ; B@x.co ')).toEqual([
      'a@sergikdropz.com',
      'b@x.co',
    ])
    expect(parseRecipientList('not-an-email')).toBeNull()
    expect(parseRecipientList('')).toBeNull()
  })

  it('escapes plain-text department mail and keeps promo blocks out of the flyer layout', () => {
    const source = 'Hello <script>\n\nSecond\n\n:::cover\nhttps://sergikdropz.com/cover.jpg\nStaying\n:::\n\n:::link\nhttps://sergikdropz.com/music\nListen\n:::'
    const html = departmentPlainTextHtml({ name: 'SERGIK Support', address: 'support@sergikdropz.com' }, source)
    expect(html).toContain('Hello &lt;script&gt;')
    expect(html).toContain('https://sergikdropz.com/music')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('cover.jpg')
    expect(departmentMailPlain(source)).toBe('Hello <script>\n\nSecond\n\nListen\nhttps://sergikdropz.com/music')
  })

  it('edits a built-in mailbox and adds another account', () => {
    expect(normalizeLocalPart(' Radio ')).toBe('radio')
    expect(normalizeLocalPart('bad address')).toBeNull()
    expect(mailAccountIdFromLocalPart('a.and.r')).toBe('a-and-r')
    const accounts = mergeMailAccounts([
      { id: 'press', name: 'SERGIK Radio', localPart: 'radio', purpose: 'Radio promo' },
      { id: 'a-and-r', name: 'SERGIK A&R', localPart: 'a.and.r', purpose: 'Demos' },
    ])
    expect(accounts.find((account) => account.id === 'press')).toMatchObject({
      name: 'SERGIK Radio',
      address: 'radio@sergikdropz.com',
      builtin: true,
    })
    expect(accounts.find((account) => account.id === 'a-and-r')).toMatchObject({
      address: 'a.and.r@sergikdropz.com',
      builtin: false,
    })
  })
})
