import { describe, expect, it } from 'vitest'
import { isSocialUnfurlAgent, sharePreviewRobots } from './social-unfurl'

describe('isSocialUnfurlAgent', () => {
  it('recognizes the Facebook crawler', () => {
    expect(
      isSocialUnfurlAgent(
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      ),
    ).toBe(true)
  })

  it('ignores a normal browser', () => {
    expect(isSocialUnfurlAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
  })
})

describe('sharePreviewRobots', () => {
  it('lets Facebook read an unlisted share', () => {
    expect(sharePreviewRobots('unlisted', 'facebookexternalhit/1.1')).toEqual({
      index: true,
      follow: true,
    })
  })

  it('keeps unlisted shares out of search', () => {
    expect(sharePreviewRobots('unlisted', 'Mozilla/5.0')).toEqual({
      index: false,
      follow: false,
    })
  })

  it('leaves public shares searchable', () => {
    expect(sharePreviewRobots('public', 'Mozilla/5.0')).toEqual({
      index: true,
      follow: true,
    })
  })
})
