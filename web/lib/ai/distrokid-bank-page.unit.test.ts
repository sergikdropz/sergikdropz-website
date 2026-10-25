import { describe, expect, it } from 'vitest'
import { bankTableTextToCsv, nextBankPageHref, planDistroKidBank } from '@/lib/ai/distrokid-bank-page'

describe('distrokid bank plan', () => {
  it('stops on the login page', () => {
    const plan = planDistroKidBank({
      url: 'https://distrokid.com/signin/',
      text: 'Log in to DistroKid',
      links: [],
    })
    expect(plan.kind).toBe('login')
  })

  it('follows the detail link and refuses Let us do it', () => {
    const home = planDistroKidBank({
      url: 'https://distrokid.com/bank',
      text: 'Total earnings',
      links: [{ href: '/bank/detail', text: 'See Excruciating Detail' }],
    })
    expect(home.kind).toBe('open_detail')

    const huge = planDistroKidBank(
      {
        url: 'https://distrokid.com/bank/detail',
        text: 'More than 50,000 records. Let\'s do it',
        links: [{ href: '/bank/priority', text: "Let's do it" }],
      },
      0,
    )
    expect(huge.kind).toBe('too_large')
  })

  it('does not treat an app download as the bank csv', () => {
    const plan = planDistroKidBank({
      url: 'https://distrokid.com/bank/home/',
      text: 'see excruciating details',
      links: [
        { href: '/download/iphone', text: 'DistroKid for iPhone' },
        { href: '/bank/detail', text: 'excruciating details' },
      ],
    })
    expect(plan).toMatchObject({ kind: 'open_detail', href: 'https://distrokid.com/bank/detail' })
  })

  it('turns the details table into a csv', () => {
    const table = bankTableTextToCsv(
      'filters\nINSERTED\tREPORTED\tSALE MONTH\tSTORE\tARTIST\tTITLE\tQUANTITY\tASSET TYPE\tSPLITS\tCOUNTRY OF SALE\tEARNINGS (USD)\n2026-09-25\tSep 2026\tAug 2026\tApple Music\tSergik\tBack to the Basics\t1\tSong\t\tUS\t0.01\n© DistroKid',
    )
    expect(table?.rows).toBe(1)
    expect(table?.csv).toContain('Back to the Basics')
    expect(table?.csv.startsWith('INSERTED,REPORTED,SALE MONTH')).toBe(true)
  })

  it('joins a wrapped earnings cell back onto the row', () => {
    const table = bankTableTextToCsv(
      'INSERTED\tREPORTED\tSALE MONTH\tSTORE\tTITLE\tEARNINGS (USD)\n2026-09-25\tSep 2026\tAug 2026\tApple Music\tBack to the Basics\n0.01\n',
    )
    expect(table?.rows).toBe(1)
    expect(table?.csv.endsWith(',0.01')).toBe(true)
  })

  it('follows a next page and a bank download href', () => {
    const download = planDistroKidBank({
      url: 'https://distrokid.com/bank/details/',
      text: 'Display',
      links: [{ href: '/bank/details/download/', text: '' }],
    })
    expect(download.kind).toBe('download')
    const next = nextBankPageHref({
      url: 'https://distrokid.com/bank/details/',
      text: 'rows',
      links: [
        { href: '/bank/details/?page=2', text: 'Next' },
        { href: '/new/', text: 'Continue' },
      ],
    })
    expect(next).toBe('https://distrokid.com/bank/details/?page=2')
  })

  it('takes a direct csv link and ignores a submit control', () => {
    const plan = planDistroKidBank({
      url: 'https://distrokid.com/bank/detail',
      text: 'Display',
      links: [
        { href: '/bank/export.csv', text: 'Download' },
        { href: '/new/', text: 'Continue' },
      ],
    })
    expect(plan).toMatchObject({ kind: 'download', href: 'https://distrokid.com/bank/export.csv' })
  })
})