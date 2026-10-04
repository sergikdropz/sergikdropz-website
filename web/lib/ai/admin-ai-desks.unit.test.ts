import { describe, expect, it } from 'vitest'
import {
  adminDeskCatalogPrompt,
  deskCardForUrl,
  deskSkillHintFromMessage,
  formatDeskCard,
} from '@/lib/ai/admin-ai-desks'

describe('admin-ai-desks', () => {
  it('maps each bookmark host to a desk card', () => {
    expect(deskCardForUrl('https://distrokid.com/new/')?.id).toBe('distrokid')
    expect(deskCardForUrl('https://studio.youtube.com/')?.id).toBe('youtube_studio')
    expect(deskCardForUrl('https://artists.spotify.com/c/artist/x')?.id).toBe('spotify_artists')
    expect(deskCardForUrl('https://sxdirect.soundexchange.com/home/')?.id).toBe('sx_direct')
    expect(deskCardForUrl('https://distrokid.com/')?.never).toMatch(/leave blank/i)
    expect(deskCardForUrl('https://distrokid.com/')?.never).toMatch(/You QC/i)
    expect(formatDeskCard(deskCardForUrl('https://distrokid.com/')!)).toContain('Desk: DistroKid')
  })

  it('routes skill from a Page: selection before sticky marketing wins', () => {
    expect(
      deskSkillHintFromMessage(
        'is this going to set its own upc?\nPage: https://distrokid.com/new/\nHTML Element: <input>',
      ),
    ).toBe('studio_release')
    expect(
      deskSkillHintFromMessage('Page: https://artists.spotify.com/\nSelected: A button'),
    ).toBe('growth_marketing')
    expect(deskCardForUrl('https://sxdirect.soundexchange.com/home/')?.purpose).toMatch(/minted/i)
    expect(adminDeskCatalogPrompt()).toContain('assign_isrcs')
  })
})
