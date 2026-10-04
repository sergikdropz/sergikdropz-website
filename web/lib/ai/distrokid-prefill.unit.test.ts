import { describe, expect, it } from 'vitest'
import { prefillDistroKidPage } from '@/lib/ai/distrokid-prefill'

describe('distrokid prefill', () => {
  it('refuses to run off DistroKid /new/', async () => {
    const result = await prefillDistroKidPage(
      {
        url: () => 'https://distrokid.com/mymusic/',
        evaluate: async () => ({ filled: [], skipped: [], errors: [] }),
      },
      {
        release: {
          previously_released: false,
          artist: 'SERGIK',
          label: 'SERGIKdropz',
          title: 'Staying A Vibe',
          language: 'English',
          primary_genre: 'Dance',
          secondary_genre: 'Disco',
          release_date: '2026-10-08',
          upc: '0199980184428',
          artwork_url: '',
          stores: [],
        },
        tracks: [],
      }
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/Open DistroKid new-release/)
  })
})
