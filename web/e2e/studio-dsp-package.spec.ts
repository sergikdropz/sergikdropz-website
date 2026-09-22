import { test, expect } from '@playwright/test'

const SPOTIFY_URL = 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H'
const SPOTIFY_ID = '7MnvMhWoSe4wYXuiI6iQ8H'
const APPLE_URL = 'https://music.apple.com/us/artist/sergik/1577778284'
const APPLE_ID = '1577778284'
const YOUTUBE_URL = 'https://music.youtube.com/channel/UCBWcROfNv8PeY6KdrnNM_pw'
const YOUTUBE_ID = 'UCBWcROfNv8PeY6KdrnNM_pw'
const INSTAGRAM_URL = 'https://instagram.com/sergikdropz'
const FACEBOOK_URL = 'https://www.facebook.com/sergikdropz'

test.describe('studio DSP package identity', () => {
  test('release PUT parses profile URLs and Delivery UI shows package identity', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)

    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })

    const board = await request.get('/api/studio/release-pipeline')
    expect(board.status()).toBe(200)
    const boardJson = await board.json()
    const releases = boardJson.releases || []
    expect(releases.length).toBeGreaterThan(0)
    const id = String(releases[0].id)

    const markerUpc = `019999${String(Date.now()).slice(-7)}`

    const put = await request.put(`/api/studio/releases/${encodeURIComponent(id)}`, {
      data: {
        spotify_artist_id: SPOTIFY_URL,
        apple_artist_id: APPLE_URL,
        youtube_artist_id: YOUTUBE_URL,
        instagram_handle: INSTAGRAM_URL,
        facebook_page_id: FACEBOOK_URL,
        upc: markerUpc,
      },
      timeout: 60_000,
    })
    expect(put.status()).toBe(200)
    const putJson = await put.json()
    expect(putJson.release).toMatchObject({
      spotify_artist_id: SPOTIFY_ID,
      apple_artist_id: APPLE_ID,
      youtube_artist_id: YOUTUBE_ID,
      instagram_handle: 'sergikdropz',
      facebook_page_id: 'sergikdropz',
      upc: markerUpc,
    })

    const get = await request.get(`/api/studio/releases/${encodeURIComponent(id)}`)
    expect(get.status()).toBe(200)
    const getJson = await get.json()
    expect(getJson.release).toMatchObject({
      spotify_artist_id: SPOTIFY_ID,
      apple_artist_id: APPLE_ID,
      youtube_artist_id: YOUTUBE_ID,
      instagram_handle: 'sergikdropz',
      facebook_page_id: 'sergikdropz',
      upc: markerUpc,
    })

    await page.goto(`/studio/releases/${encodeURIComponent(id)}?step=delivery`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page).not.toHaveURL(/\/admin\/login/)

    await expect(page.getByTestId('dsp-package-identity')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/DSP package identity/i)).toBeVisible()
    await expect(page.getByTestId('dsp-already-on-cards')).toBeVisible()
    // GET seeds artist.json profiles, so match cards should already be ready.
    await expect(page.getByTestId('dsp-match-ready-spotify')).toBeVisible()
    await expect(page.getByTestId('dsp-match-ready-apple')).toBeVisible()
    await expect(page.getByTestId('dsp-package-spotify')).toHaveValue(SPOTIFY_ID)
    await expect(page.getByTestId('dsp-package-apple')).toHaveValue(APPLE_ID)
    await expect(page.getByTestId('dsp-package-youtube')).toHaveValue(YOUTUBE_ID)
    await expect(page.getByTestId('dsp-package-instagram')).toHaveValue('sergikdropz')
    await expect(page.getByTestId('dsp-package-facebook')).toHaveValue('sergikdropz')
    await expect(page.getByTestId('dsp-package-upc')).toHaveValue(markerUpc)

    // UI → PUT round-trip: blur a new UPC and confirm it persists.
    const nextUpc = `019998${String(Date.now()).slice(-7)}`
    const upcInput = page.getByTestId('dsp-package-upc')
    await upcInput.fill(nextUpc)
    await upcInput.blur()
    await expect(page.getByText(/Saved/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => undefined)

    await expect
      .poll(
        async () => {
          const res = await request.get(`/api/studio/releases/${encodeURIComponent(id)}`)
          if (res.status() !== 200) return null
          return (await res.json()).release?.upc || null
        },
        { timeout: 30_000 }
      )
      .toBe(nextUpc)
  })
})
