/**
 * Playwright helper: download DistroKid vault WAVs using page session cookies.
 * Invoked via browser_run_code_unsafe filename=…
 */
const fs = require('fs')
const path = require('path')

module.exports = async function downloadDistroKidWavs(page) {
  const outDir = path.join(
    '/Users/machd/Documents/SERGIK Web and app/web/.tmp/distrokid-wavs',
  )
  fs.mkdirSync(outDir, { recursive: true })

  await page.goto('https://distrokid.com/mymusic/', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })

  // Expand all releases if button exists
  try {
    const btn = page.getByRole('button', { name: /Show all releases/i })
    if (await btn.count()) await btn.click({ timeout: 3000 })
  } catch {
    /* ignore */
  }

  const albumHrefs = await page.$$eval('a[href*="albumuuid="]', (as) => {
    const map = new Map()
    for (const a of as) {
      try {
        const u = new URL(a.href)
        const id = (u.searchParams.get('albumuuid') || '').toUpperCase()
        if (id && !map.has(id)) map.set(id, u.pathname + u.search)
      } catch {
        /* ignore */
      }
    }
    return [...map.entries()]
  })

  const catalog = {
    version: 2,
    source: 'distrokid',
    extracted_at: new Date().toISOString(),
    releases: [],
  }

  const downloads = []

  for (const [albumuuid, albumPath] of albumHrefs) {
    await page.goto(`https://distrokid.com${albumPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    })
    await page.waitForTimeout(400)

    const release = await page.evaluate(() => {
      const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
      const abs = (u) => {
        if (!u) return null
        if (u.startsWith('//')) return 'https:' + u
        if (u.startsWith('/')) return location.origin + u
        return u
      }
      const infoVal = (labelRe) => {
        const re = new RegExp(
          labelRe.source +
            '[\\s\\S]*?<span[^>]*class="[^"]*info-value[^"]*"[^>]*>([\\s\\S]*?)<\\/span>',
          'i',
        )
        const m = document.body.innerHTML.match(re)
        return m ? clean(m[1].replace(/<[^>]+>/g, ' ')) : null
      }
      const parseDate = (raw) => {
        const v = clean(raw)
        if (!v) return null
        const t = Date.parse(v)
        if (!Number.isFinite(t)) return null
        return new Date(t).toISOString().slice(0, 10)
      }
      const title = clean(
        document.querySelector('.album-title span')?.textContent ||
          document.querySelector('.album-title')?.textContent,
      )
      const artist = clean(
        document.querySelector('.band-name span')?.textContent ||
          document.querySelector('.band-name')?.textContent,
      )
      const upc =
        clean(infoVal(/DistroKid\s*UPC/) || document.querySelector('#js-album-upc')?.textContent || '')
          .replace(/\D/g, '') || null
      const tracks = [...document.querySelectorAll('.track-row.trackRow')].map((row, i) => {
        const num =
          parseInt(clean(row.querySelector('.track-num')?.textContent), 10) || i + 1
        const t = clean(
          row.querySelector('.track-name span')?.getAttribute('title') ||
            row.querySelector('.track-name')?.textContent,
        )
        const isrc =
          clean(row.querySelector('.isrc-value')?.textContent)
            .replace(/-/g, '')
            .toUpperCase() || null
        const download_url = abs(
          row.querySelector('a[href*="vault/download"]')?.getAttribute('href'),
        )
        const credits_url = abs(
          row.querySelector('a[href*="credits/track"]')?.getAttribute('href'),
        )
        const lyrics_url = abs(
          row.querySelector('a[href*="lyrics/track"]')?.getAttribute('href'),
        )
        return { track_number: num, title: t, isrc, download_url, credits_url, lyrics_url }
      })
      const byStore = new Map()
      for (const a of document.querySelectorAll('a[href]')) {
        let href = abs(a.getAttribute('href'))
        if (!href) continue
        if (href.startsWith('http://')) href = 'https://' + href.slice(7)
        let store = null
        if (/open\.spotify\.com\/(album|track)\//i.test(href)) store = 'spotify'
        else if (/music\.apple\.com\//i.test(href)) store = 'apple_music'
        else if (/deezer\.com\/album/i.test(href)) store = 'deezer'
        if (!store) continue
        if (store === 'apple_music' && byStore.has('apple_music') && /app=itunes/i.test(href))
          continue
        if (!byStore.has(store) || (store === 'apple_music' && /app=music/i.test(href))) {
          byStore.set(store, href)
        }
      }
      const hf = [...document.querySelectorAll('a[href*="hyperfollow/"]')]
        .map((a) => abs(a.getAttribute('href')))
        .find((h) => h && !/ref=globalmenu/i.test(h) && /\/hyperfollow\/[^/]+\/[^/?]+/i.test(h))
      return {
        albumuuid: new URLSearchParams(location.search).get('albumuuid')?.toUpperCase() || '',
        title,
        artist,
        label: infoVal(/Record\s*Label/),
        release_date: parseDate(infoVal(/Release\s*date/)),
        upload_date: parseDate(infoVal(/Upload\s*date/)),
        upc,
        artwork_url: abs(document.querySelector('img.album-image')?.getAttribute('src')),
        hyperfollow_url: hf || null,
        tracks,
        store_links: [...byStore.entries()].map(([store, url]) => ({ store, url })),
        type_hint: tracks.length <= 1 ? 'single' : tracks.length <= 6 ? 'ep' : 'album',
      }
    })

    if (release.albumuuid) catalog.releases.push(release)

    for (const track of release.tracks) {
      if (!track.download_url) continue
      const safeTitle = String(track.title || 'track')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 60)
      const fileName = `${track.isrc || `${release.albumuuid}-${track.track_number}`}-${safeTitle}.wav`
      const out = path.join(outDir, fileName)
      if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
        downloads.push({
          isrc: track.isrc,
          title: track.title,
          file: out,
          status: 'exists',
          size: fs.statSync(out).size,
        })
        continue
      }
      try {
        const res = await page.request.get(track.download_url)
        const body = await res.body()
        if (res.status() !== 200 || body.length < 1000) {
          downloads.push({
            isrc: track.isrc,
            title: track.title,
            status: 'error',
            message: `HTTP ${res.status()} size=${body.length}`,
          })
          continue
        }
        fs.writeFileSync(out, body)
        downloads.push({
          isrc: track.isrc,
          title: track.title,
          file: out,
          status: 'downloaded',
          size: body.length,
          head: body.slice(0, 4).toString('ascii'),
        })
      } catch (e) {
        downloads.push({
          isrc: track.isrc,
          title: track.title,
          status: 'error',
          message: String(e),
        })
      }
      await page.waitForTimeout(300)
    }
  }

  const catalogPath = path.join(outDir, 'catalog-v2.json')
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2))

  return {
    pageUrl: page.url(),
    albumCount: catalog.releases.length,
    trackCount: catalog.releases.reduce((n, r) => n + r.tracks.length, 0),
    downloads,
    catalogPath,
  }
}
