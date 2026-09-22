import { describe, expect, it } from 'vitest'
import {
  buildDistroKidReleaseDraft,
  collectDistroKidStoreLinks,
  collectDistroKidSubmittedStores,
  normalizeTitleKey,
  parseDistroKidAlbumHtml,
  parseDistroKidCatalogJson,
  parseDistroKidDate,
  parseDistroKidMyMusicHtml,
  studioTypeFromTrackCount,
  summarizeDistroKidCatalog,
} from '@/lib/studio/distrokid-import'

const MY_MUSIC_FIXTURE = `
<section class="releases-list">
  <a class="tableRow release-row" href="/dashboard/album/?albumuuid=FCFD5797-2DFF-4EC2-A5AC8F959F458E38">
    Soul Candy 5 tracks Sergik
  </a>
  <a href="/dashboard/album/?albumuuid=FCFD5797-2DFF-4EC2-A5AC8F959F458E38">Soul Candy Sergik</a>
  <a class="tableRow release-row" href="/dashboard/album/?albumuuid=A0903A83-D23F-42E7-843B99BB1BB6A2C8">
    How Ya Single Sergik
  </a>
</section>
`

const SOUL_CANDY_ALBUM_FIXTURE = `
<html><body>
<div class="header-content">
<img class="album-image" src="//s3.amazonaws.com/gather.fandalism.com/800x800-soul-candy.jpg">
<div class="name-section">
<div class="album-title" translate="no"><span title="Album title">Soul Candy</span></div>
<div class="band-name" translate="no"><span title="Artist name">Sergik</span></div>
</div>
<div class="release-section">
<div class="release-info">
<div><span>Record Label:</span><span class="info-value">SergikDropz</span></div>
<div><span>Upload date:</span><span class="info-value">February 10, 2025</span></div>
<div><span>Release date:</span><span class="info-value">February 14, 2025</span></div>
<div><span>DistroKid UPC:</span><span id="js-album-upc" class="info-value">199083322052</span></div>
</div>
</div>
</div>
<div class="tracks-section">
<div class="track-row trackRow">
<div class="track-cell track-num" translate="no">1</div>
<div class="track-cell track-name"><span title="Soul Candy">Soul Candy</span></div>
<div class="track-cell track-download desktop-only">
<a href="/vault/download/?id=eQeZ9" class="state-link" title="Download from DistroKid Vault">Download</a>
</div>
<div class="track-cell track-credits desktop-only">
<a href="/credits/track/?id=FCFD5797-2DFF-4EC2-A5AC8F959F458E38,1">Credits</a>
</div>
<div class="track-cell track-isrc desktop-only">
<div class="myISRC isrc-item"><div class="isrc-label">ISRC</div><div class="isrc-value">QZES72569811</div></div>
</div>
</div>
<div class="track-row trackRow">
<div class="track-cell track-num" translate="no">2</div>
<div class="track-cell track-name"><span title="Everyday Gratitude">Everyday Gratitude</span></div>
<div class="track-cell track-isrc desktop-only">
<div class="myISRC isrc-item"><div class="isrc-label">ISRC</div><div class="isrc-value">QZES72569812</div></div>
</div>
</div>
<div class="track-row trackRow">
<div class="track-cell track-num" translate="no">3</div>
<div class="track-cell track-name"><span title="Spring Swing">Spring Swing</span></div>
<div class="track-cell track-isrc desktop-only">
<div class="myISRC isrc-item"><div class="isrc-label">ISRC</div><div class="isrc-value">QZES72569813</div></div>
</div>
</div>
<div class="track-row trackRow">
<div class="track-cell track-num" translate="no">4</div>
<div class="track-cell track-name"><span title="Back to the Basics">Back to the Basics</span></div>
<div class="track-cell track-isrc desktop-only">
<div class="myISRC isrc-item"><div class="isrc-label">ISRC</div><div class="isrc-value">QZES72569814</div></div>
</div>
</div>
<div class="track-row trackRow">
<div class="track-cell track-num" translate="no">5</div>
<div class="track-cell track-name"><span title="All The Vibes">All The Vibes</span></div>
<div class="track-cell track-isrc desktop-only">
<div class="myISRC isrc-item"><div class="isrc-label">ISRC</div><div class="isrc-value">QZES72569815</div></div>
</div>
</div>
</div>
<a href="https://open.spotify.com/album/2zkqOMl5kMNdTvev330BGY"></a>
<a href="https://music.apple.com/us/album/soul-candy-ep/1796383233?uo=4&app=music&at=1001lry3&ct=dashboard"></a>
<a href="https://music.apple.com/us/album/soul-candy-ep/1796383233?uo=4&app=itunes&at=1001lry3&ct=dashboard"></a>
<a href="https://www.deezer.com/album/711004781"></a>
<a href="https://distrokid.com/hyperfollow/sergik/soul-candy">HyperFollow landing page</a>
<a href="http://www.youtube.com/watch?v=V5J88iPseO8">Soul Candy</a>
</body></html>
`

const FTP_STORES_FIXTURE = `
<html><body>
<div class="store-icons">
<a href="https://open.spotify.com/album/2NkWmlDlwoFYpM2foerkHH"><img data-testid="album-store-spotify" title="Submitted to Spotify"></a>
<a href="https://music.apple.com/us/album/ftp-ep/1757184282?uo=4&app=music"><img data-testid="album-store-applemusic" title="Submitted to Apple Music"></a>
<a href="https://music.apple.com/us/album/ftp-ep/1757184282?uo=4&app=itunes"><img data-testid="album-store-itunes" title="Submitted to iTunes"></a>
<span><img data-testid="album-store-facebook" title="Submitted to Instagram/Facebook"></span>
<span><img data-testid="album-store-tiktok" title="Submitted to TikTok"></span>
<span><img data-testid="album-store-google" title="Submitted to YouTube Music"></span>
<a href="http://www.amazon.com/gp/product/B0D9BGZDWK/?tag=distrokid06-20"><img data-testid="album-store-amazon" title="Submitted to Amazon"></a>
<span><img data-testid="album-store-rdio" title="Submitted to Pandora"></span>
<a href="https://www.deezer.com/album/615102062"><img data-testid="album-store-deezer" title="Submitted to Deezer"></a>
<span><img data-testid="album-store-tidal" title="Submitted to Tidal"></span>
<a href="https://www.iheart.com/artist/id-36587473/albums/id-278836343"><img data-testid="album-store-iheart" title="Submitted to iHeartRadio"></a>
<span><img data-testid="album-store-imusica" title="Submitted to Claro Música"></span>
<span><img data-testid="album-store-saavn" title="Submitted to Saavn"></span>
<span><img data-testid="album-store-boomplay" title="Submitted to Boomplay"></span>
<span><img data-testid="album-store-anghami" title="Submitted to Anghami"></span>
<span><img data-testid="album-store-netease" title="Submitted to NetEase"></span>
<span><img data-testid="album-store-tencent" title="Submitted to Tencent"></span>
<span><img data-testid="album-store-qobuz" title="Submitted to Qobuz"></span>
<span><img data-testid="album-store-joox" title="Submitted to Joox"></span>
<span><img data-testid="album-store-kuackmedia" title="Submitted to Kuack Media"></span>
<span><img data-testid="album-store-feedfm" title="Submitted to Adaptr"></span>
<span><img data-testid="album-store-flo" title="Submitted to Flo"></span>
<span><img data-testid="album-store-beats" title="Submitted to MediaNet"></span>
</div>
</body></html>
`

const HOW_YA_SINGLE_FIXTURE = `
<html><body>
<img class="album-image" src="https://s3.amazonaws.com/gather.fandalism.com/how-ya.jpg">
<div class="album-title"><span>How Ya</span></div>
<div class="band-name"><span>Sergik</span></div>
<div><span>Record Label:</span><span class="info-value">SergikDropz</span></div>
<div><span>Release date:</span><span class="info-value">March 1, 2024</span></div>
<div><span>DistroKid UPC:</span><span id="js-album-upc" class="info-value">123456789012</span></div>
<div class="track-row trackRow">
<div class="track-cell track-num">1</div>
<div class="track-cell track-name"><span title="How Ya">How Ya</span></div>
<div class="isrc-value">QZES71234567</div>
</div>
<a href="https://open.spotify.com/album/abc123album"></a>
</body></html>
`

describe('parseDistroKidDate', () => {
  it('parses DistroKid display dates', () => {
    expect(parseDistroKidDate('February 14, 2025')).toBe('2025-02-14')
    expect(parseDistroKidDate('2025-02-14')).toBe('2025-02-14')
  })
})

describe('studioTypeFromTrackCount', () => {
  it('maps singles / EPs / albums', () => {
    expect(studioTypeFromTrackCount(1)).toBe('single')
    expect(studioTypeFromTrackCount(5)).toBe('ep')
    expect(studioTypeFromTrackCount(12)).toBe('album')
  })
})

describe('parseDistroKidMyMusicHtml', () => {
  it('dedupes albumuuid rows and keeps track counts', () => {
    const rows = parseDistroKidMyMusicHtml(MY_MUSIC_FIXTURE)
    expect(rows).toHaveLength(2)
    const soul = rows.find((r) => r.albumuuid.includes('FCFD5797'))
    expect(soul?.title).toMatch(/Soul Candy/i)
    expect(soul?.track_count).toBe(5)
    expect(soul?.type_hint).toBe('ep')
    const howYa = rows.find((r) => r.albumuuid.includes('A0903A83'))
    expect(howYa?.type_hint).toBe('single')
    expect(howYa?.track_count).toBe(1)
  })
})

describe('parseDistroKidAlbumHtml', () => {
  it('extracts Soul Candy metadata, ISRCs, artwork, and album store links', () => {
    const release = parseDistroKidAlbumHtml(SOUL_CANDY_ALBUM_FIXTURE, {
      albumuuid: 'FCFD5797-2DFF-4EC2-A5AC8F959F458E38',
    })
    expect(release.title).toBe('Soul Candy')
    expect(release.artist).toBe('Sergik')
    expect(release.label).toBe('SergikDropz')
    expect(release.upc).toBe('199083322052')
    expect(release.release_date).toBe('2025-02-14')
    expect(release.artwork_url).toMatch(/^https:\/\/s3\.amazonaws\.com/)
    expect(release.tracks).toHaveLength(5)
    expect(release.tracks[0]).toMatchObject({
      track_number: 1,
      title: 'Soul Candy',
      isrc: 'QZES72569811',
      download_url: 'https://distrokid.com/vault/download/?id=eQeZ9',
    })
    expect(release.hyperfollow_url).toMatch(/hyperfollow\/sergik\/soul-candy/)
    expect(release.tracks[4].isrc).toBe('QZES72569815')
    expect(release.store_links.map((l) => l.store).sort()).toEqual([
      'apple_music',
      'deezer',
      'spotify',
    ])
    expect(release.type_hint).toBe('ep')
  })

  it('parses a single', () => {
    const release = parseDistroKidAlbumHtml(HOW_YA_SINGLE_FIXTURE, {
      albumuuid: 'A0903A83-D23F-42E7-843B99BB1BB6A2C8',
    })
    expect(release.title).toBe('How Ya')
    expect(release.tracks).toHaveLength(1)
    expect(release.tracks[0].isrc).toBe('QZES71234567')
    expect(release.type_hint).toBe('single')
  })
})

describe('collectDistroKidStoreLinks', () => {
  it('prefers Apple Music app=music over iTunes', () => {
    const links = collectDistroKidStoreLinks(SOUL_CANDY_ALBUM_FIXTURE)
    const apple = links.find((l) => l.store === 'apple_music')
    expect(apple?.url).toMatch(/app=music/)
  })

  it('captures DistroKid Amazon ASIN and iHeartRadio album links', () => {
    const links = collectDistroKidStoreLinks(FTP_STORES_FIXTURE)
    expect(links.map((l) => l.store).sort()).toEqual([
      'amazon',
      'apple_music',
      'deezer',
      'iheart',
      'spotify',
    ])
    expect(links.find((l) => l.store === 'amazon')?.url).toContain('/gp/product/B0D9BGZDWK')
    expect(links.find((l) => l.store === 'iheart')?.url).toContain('iheart.com')
  })
})

describe('collectDistroKidSubmittedStores', () => {
  it('maps DistroKid album-store icons onto Studio targets (deduping iTunes)', () => {
    const stores = collectDistroKidSubmittedStores(FTP_STORES_FIXTURE)
    expect(stores).toContain('spotify')
    expect(stores).toContain('apple_music')
    expect(stores).toContain('iheart')
    expect(stores).toContain('claro_musica')
    expect(stores).toContain('medianet')
    expect(stores).toContain('adaptr')
    expect(stores.filter((s) => s === 'apple_music')).toHaveLength(1)
    expect(stores).toHaveLength(22)
  })

  it('falls back to linked stores when icons are missing', () => {
    expect(collectDistroKidSubmittedStores(SOUL_CANDY_ALBUM_FIXTURE).sort()).toEqual([
      'apple_music',
      'deezer',
      'spotify',
    ])
  })
})

describe('buildDistroKidReleaseDraft + catalog JSON', () => {
  it('builds previously-released drafts with ISRC parts', () => {
    const release = parseDistroKidAlbumHtml(SOUL_CANDY_ALBUM_FIXTURE, {
      albumuuid: 'FCFD5797-2DFF-4EC2-A5AC8F959F458E38',
    })
    const draft = buildDistroKidReleaseDraft(release, 1_700_000_000_000)
    expect(draft.previously_released).toBe(true)
    expect(draft.upc).toBe('199083322052')
    expect(draft.previous_upc).toBe('199083322052')
    expect(draft.tracks[0].isrc_full).toBe('QZES72569811')
    expect(draft.tracks[0].isrc_prefix).toBe('QZES7')
    expect(draft.id).toMatch(/^release-dk-/)
    expect(draft.marketing_meta.albumuuid).toBe('FCFD5797-2DFF-4EC2-A5AC8F959F458E38')
    expect(draft.target_stores).toEqual(['spotify', 'apple_music', 'deezer'])
  })

  it('parses catalog JSON and summarizes', () => {
    const release = parseDistroKidAlbumHtml(SOUL_CANDY_ALBUM_FIXTURE, {
      albumuuid: 'FCFD5797-2DFF-4EC2-A5AC8F959F458E38',
    })
    const catalog = parseDistroKidCatalogJson({
      version: 1,
      source: 'distrokid',
      extracted_at: '2026-09-17T00:00:00.000Z',
      releases: [release],
    })
    const summary = summarizeDistroKidCatalog(catalog)
    expect(summary.releaseCount).toBe(1)
    expect(summary.trackCount).toBe(5)
    expect(summary.withUpc).toBe(1)
    expect(summary.withIsrc).toBe(5)
    expect(summary.missingIsrc).toBe(0)
  })
})

describe('normalizeTitleKey', () => {
  it('normalizes for vault matching', () => {
    expect(normalizeTitleKey("Like The Ol' Days")).toBe('like the ol days')
  })
})
