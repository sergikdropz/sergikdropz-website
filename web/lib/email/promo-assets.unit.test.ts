import { describe, expect, it } from 'vitest'
import {
  formatMailCopy,
  appendMailProse,
  extraComposeMenus,
  insertMailBlock,
  insertPromoMessage,
  readableMailSource,
  mailMessageHtml,
  orderMailBlocks,
  parseMailMessage,
  promoAssetFilename,
  promoAssetText,
  promoMenuItems,
  promoReleaseFromRow,
  suggestPromoAssets,
  type PromoRelease,
} from '@/lib/email/promo-assets'

const staying: PromoRelease = {
  id: 'stay',
  title: 'Staying A Vibe',
  releaseDate: '2026-10-08',
  artworkUrl: 'https://sergikdropz.com/covers/staying.jpg',
  press: 'A four-track house set.',
  caption: 'Out October 8.',
  pitch: 'Late-night house.',
  smartLink: 'https://sergikdropz.com/api/go/presave-stay',
  storeUrl: 'https://open.spotify.com/album/stay',
}

const older: PromoRelease = {
  id: 'old',
  title: 'Soul Candy',
  releaseDate: '2024-01-01',
  artworkUrl: '',
  press: '',
  caption: 'Sweet.',
  pitch: '',
  smartLink: '',
  storeUrl: '',
}

describe('promo assets', () => {
  it('reads release copy and drops empty titles', () => {
    expect(
      promoReleaseFromRow({
        id: '1',
        title: 'Staying A Vibe',
        release_date: '2026-10-08T07:00:00.000Z',
        artwork_url: '/covers/stay.jpg',
        marketing_copy: { press_blurb: 'Press', social_caption: 'Caption' },
      }),
    ).toMatchObject({ title: 'Staying A Vibe', releaseDate: '2026-10-08', press: 'Press', caption: 'Caption' })
    expect(promoReleaseFromRow({ id: '', title: 'Nope' })).toBeNull()
  })

  it('suggests the release named in the draft and skips a cover that is missing', () => {
    const covers = suggestPromoAssets([staying, older], 'cover', 'note about Staying A Vibe', '2026-10-04')
    expect(covers.map((release) => release.id)).toEqual(['stay'])
    const captions = suggestPromoAssets([staying, older], 'caption', '', '2026-10-04')
    expect(captions[0]?.id).toBe('stay')
  })

  it('names attached files from the release', () => {
    expect(promoAssetFilename('Staying A Vibe', 'press')).toBe('staying-a-vibe-press.txt')
    expect(promoAssetText(staying, 'link')).toContain('https://sergikdropz.com/api/go/presave-stay')
  })

  it('puts the cover, press, promo copy, and smart link into the message', () => {
    const body = insertPromoMessage(insertPromoMessage('Hi there', staying, 'cover'), staying, 'link')
    const parsed = parseMailMessage(body)
    expect(parsed.prose).toBe('Hi there')
    expect(parsed.blocks.map((block) => block.kind)).toEqual(['cover', 'link', 'link'])
    const html = mailMessageHtml(body)
    expect(html).toContain('<img ')
    expect(html).toContain('https://sergikdropz.com/api/go/presave-stay')
    expect(html).toContain('Hi there')
    expect(mailMessageHtml('Hello <script>')).toContain('Hello &lt;script&gt;')
    expect(mailMessageHtml('Hello <script>')).not.toContain('<script>')
    expect(html).toContain('display:block')
  })

  it('breaks a run-on press note into sentences and a track list', () => {
    const text =
      'SERGIK feat. Janis presents "Staying A Vibe", a 5-track EP. Pre Party arrives already moving. Also on the EP: Tequila Power, Hydrate, Last Night.'
    const pieces = formatMailCopy(text)
    expect(pieces[0]).toMatchObject({ type: 'paragraph', text: expect.stringContaining('feat. Janis presents') })
    expect(pieces[1]).toMatchObject({ type: 'paragraph', text: 'Pre Party arrives already moving.' })
    expect(pieces[2]).toMatchObject({
      type: 'tracks',
      label: 'Also on the EP',
      tracks: ['Tequila Power', 'Hydrate', 'Last Night'],
    })
    const html = mailMessageHtml(`:::press\nStaying A Vibe\n${text}\n:::`)
    expect(html).toContain('<ul')
    expect(html).toContain('Tequila Power')
    expect(html.match(/<p /g)?.length).toBeGreaterThan(2)
  })

  it('splits a long aside so a sentence does not stay one wall of text', () => {
    const text =
      'Pre Party arrives already moving — a low-slung F minor groove that does not announce itself so much as pull you in by the shoulders and keep the room waiting.'
    const pieces = formatMailCopy(text)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces[0]).toMatchObject({ type: 'paragraph', text: 'Pre Party arrives already moving.' })
    expect(pieces[1]).toMatchObject({ type: 'paragraph', text: expect.stringMatching(/^A low-slung/) })
  })

  it('places the press note above the promo title', () => {
    const body = insertPromoMessage(insertPromoMessage('', staying, 'caption'), staying, 'press')
    expect(parseMailMessage(body).blocks.map((block) => block.kind)).toEqual(['press', 'caption'])
    expect(orderMailBlocks(parseMailMessage(body).blocks).map((block) => block.kind)).toEqual(['press', 'caption'])
    const html = mailMessageHtml(body)
    expect(html.indexOf('>Press<')).toBeLessThan(html.indexOf('>Promo<'))
  })

  it('places the cover above the press note and the links under the cover', () => {
    let body = insertPromoMessage('', staying, 'press')
    body = insertPromoMessage(body, staying, 'caption')
    body = insertPromoMessage(body, staying, 'link')
    body = insertPromoMessage(body, staying, 'cover')
    expect(parseMailMessage(body).blocks.map((block) => block.kind)).toEqual(['cover', 'link', 'link', 'press', 'caption'])
    expect(mailMessageHtml(body)).toContain('max-width:576px')
  })

  it('lists each copy field and store link as its own menu row', () => {
    const release = promoReleaseFromRow({
      id: 'stay',
      title: 'Staying A Vibe',
      release_date: '2026-10-08',
      artwork_url: 'https://sergikdropz.com/covers/staying.jpg',
      marketing_copy: {
        press_blurb: 'Press note.',
        elevator_pitch: 'One line hook.',
        social_caption: 'Out now.',
        store_description: 'Store copy.',
        spotify_pitch: 'Editorial pitch.',
        credits_block: 'Written by SERGIK.',
        platform_tags: '#SERGIK',
      },
    })
    expect(release?.pressBlurb).toBe('Press note.')
    const rich: PromoRelease = {
      ...release!,
      promoLabUrl: 'https://sergikdropz.com/promo/stay-token-00000001',
      smartLinks: ['https://sergikdropz.com/api/go/presave-stay', 'https://sergikdropz.com/api/go/stay-live'],
      storeLinks: [
        { store: 'apple', url: 'https://music.apple.com/album/stay' },
        { store: 'spotify', url: 'https://open.spotify.com/album/stay' },
        { store: 'traxsource', url: 'https://www.traxsource.com/search' },
        { store: 'local', url: 'http://127.0.0.1:3001/release' },
      ],
    }
    const other: PromoRelease = {
      ...older,
      smartLink: 'https://sergikdropz.com/api/go/soul-candy',
      smartLinks: ['https://sergikdropz.com/api/go/soul-candy'],
      storeUrl: 'https://open.spotify.com/album/soul',
    }
    const linkMenu = promoMenuItems([rich, other], 'link', 'Staying A Vibe', '2026-10-04')
    expect(linkMenu.map((item) => `${item.group}: ${item.label}`)).toEqual([
      'Staying A Vibe: Promo Lab',
      'Staying A Vibe: Pre-save',
      'Staying A Vibe: Smart link',
      'Staying A Vibe: Spotify',
      'Staying A Vibe: Apple Music',
      'Soul Candy: Smart link',
      'Site: Music page',
    ])
    expect(linkMenu[0]).toMatchObject({
      detail: 'sergikdropz.com/promo/stay-token-00000001',
      block: { kind: 'link', url: 'https://sergikdropz.com/promo/stay-token-00000001', label: 'Promo Lab — Staying A Vibe' },
    })
    expect(promoMenuItems([rich], 'press', '', '2026-10-04').map((item) => item.label)).toEqual([
      'Press blurb',
      'Elevator pitch',
      'Credits',
    ])
    expect(promoMenuItems([rich], 'caption', '', '2026-10-04').map((item) => item.label)).toEqual([
      'Launch caption',
      'Store description',
      'Spotify pitch',
      'Tags',
    ])
    const next = { ...older, id: 'next', title: 'Next Room', artworkUrl: 'https://sergikdropz.com/covers/next.jpg' }
    expect(promoMenuItems([next, staying], 'cover', 'note about Staying A Vibe', '2026-10-04').map((item) => item.group)).toEqual([
      'Staying A Vibe',
      'Next Room',
    ])
    const spotify = promoMenuItems([rich], 'link', '', '2026-10-04').find((item) => item.label === 'Spotify')
    const body = insertMailBlock('', spotify!.block!)
    expect(parseMailMessage(body).blocks).toEqual([
      expect.objectContaining({ kind: 'link', label: 'Spotify — Staying A Vibe' }),
    ])
  })

  it('offers a tracklist, codes, a date line, and a subject for the release', () => {
    const release: PromoRelease = {
      ...staying,
      artist: 'SERGIK',
      genre: 'Funky House',
      releaseType: 'ep',
      upc: '700563968501',
      tracks: [
        { title: 'Pre Party', isrc: 'QTA532610001', durationSec: 204 },
        { title: 'Tequila Power', isrc: 'QTA532610002', durationSec: 251 },
      ],
    }
    const menus = extraComposeMenus([release], 'Staying A Vibe', '2026-10-04', 'studio')
    const tracks = menus.find((menu) => menu.id === 'tracks')
    const codes = menus.find((menu) => menu.id === 'codes')
    const when = menus.find((menu) => menu.id === 'when')
    const subject = menus.find((menu) => menu.id === 'subject')
    const signoff = menus.find((menu) => menu.id === 'signoff')
    expect(tracks?.items.map((item) => item.label)).toEqual(['Tracklist', 'Numbered list', 'With times', 'With ISRCs'])
    expect(tracks?.items[0]?.block).toMatchObject({ kind: 'note', text: expect.stringContaining('Pre Party') })
    expect(codes?.items.map((item) => item.label)).toEqual(['UPC', 'ISRCs', 'UPC and ISRCs'])
    expect(when?.items.map((item) => item.label)).toContain('Out in 4 days')
    expect(subject?.items.map((item) => item.subject)).toContain('Pre-save Staying A Vibe')
    expect(signoff?.items[0]?.label).toBe('Release Studio')
    const letter = appendMailProse('Hi there', when?.items.find((item) => item.label === 'Out in 4 days')?.prose || '')
    expect(parseMailMessage(letter).prose).toContain('out in 4 days')
    expect(appendMailProse(letter, when?.items.find((item) => item.label === 'Out in 4 days')?.prose || '')).toBe(letter)
    const noted = insertMailBlock('', tracks!.items[0]!.block!)
    expect(mailMessageHtml(noted)).toContain('>Tracklist<')
    expect(mailMessageHtml(noted)).toContain('Pre Party')
  })

  it('keeps an edited press note as separate paragraphs', () => {
    const source = readableMailSource(
      'SERGIK feat. Janis presents "Staying A Vibe", a 5-track EP. Pre Party arrives already moving.',
    )
    expect(source).toContain('\n\n')
    expect(readableMailSource(source)).toBe(source)
    const body = insertPromoMessage('', staying, 'press')
    expect(parseMailMessage(body).blocks[0]).toMatchObject({ kind: 'press', text: readableMailSource(staying.press) })
  })
})
