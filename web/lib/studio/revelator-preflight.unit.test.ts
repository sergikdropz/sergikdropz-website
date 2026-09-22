import { describe, expect, it } from 'vitest'
import {
  beatportGenreAllowed,
  finalizePreflight,
  filterTargetsForRevelator,
  isAggregatorMasterUrl,
  lintReleaseTitles,
  mergeProbeIntoPreflight,
  parseRevelatorDeliveryRights,
  runRevelatorPreflight,
  marketingCopyWithRevelatorRights,
  summarizeMastersReadiness,
} from '@/lib/studio/revelator-preflight'

describe('revelator-preflight', () => {
  it('accepts wav/flac masters and rejects mp3', () => {
    expect(isAggregatorMasterUrl('https://cdn.example.com/a.wav')).toBe(true)
    expect(isAggregatorMasterUrl('https://cdn.example.com/a.flac')).toBe(true)
    expect(isAggregatorMasterUrl('https://cdn.example.com/a.mp3')).toBe(false)
  })

  it('lints banned title junk', () => {
    const issues = lintReleaseTitles(['FTP (Exclusive)', 'Clean Radio'])
    expect(issues.some((i) => /Exclusive/i.test(i.message))).toBe(true)
    expect(issues.some((i) => /Clean/i.test(i.message))).toBe(true)
  })

  it('filters UGC and Beatport by rights', () => {
    const { effective, dropped } = filterTargetsForRevelator({
      targets: ['spotify', 'tiktok', 'beatport'],
      rights: {
        streaming: true,
        download: true,
        ugc: false,
        beatport_enabled: false,
        track_origin_original: false,
        linking_fields_acknowledged: false,
      },
    })
    expect(effective).toEqual(['spotify'])
    expect(dropped.map((d) => d.store).sort()).toEqual(['beatport', 'tiktok'])
  })

  it('beatport genre allowlist', () => {
    expect(beatportGenreAllowed('Tech House')).toBe(true)
    expect(beatportGenreAllowed('Country')).toBe(false)
  })

  it('blocks previously released without linking ack', () => {
    const result = finalizePreflight(
      runRevelatorPreflight({
        id: 'r1',
        title: 'FTP',
        upc: '198669278325',
        artwork_url: 'https://cdn.example.com/cover.jpg',
        artwork_dsp_url: 'https://cdn.example.com/release-covers/r1/dsp-ready.jpg',
        genre: 'House',
        previously_released: true,
        marketing_copy: {},
        target_stores: ['spotify', 'apple_music'],
        tracks: [
          {
            title: 'FTP',
            isrc: 'QZTAS2424269',
            wav_url: 'https://cdn.example.com/ftp.wav',
          },
        ],
      })
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some((b) => /linking field lock/i.test(b))).toBe(true)
  })

  it('blocks when DSP cover is missing', () => {
    const result = finalizePreflight(
      runRevelatorPreflight({
        id: 'r1',
        title: 'FTP',
        upc: '198669278325',
        artwork_url: 'https://cdn.example.com/cover.jpg',
        target_stores: ['spotify'],
        tracks: [
          {
            title: 'FTP',
            isrc: 'QZTAS2424269',
            wav_url: 'https://cdn.example.com/ftp.wav',
          },
        ],
      })
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some((b) => /DSP-ready cover|release-covers/i.test(b))).toBe(true)
  })

  it('passes when rights + masters are ready', () => {
    const copy = marketingCopyWithRevelatorRights(
      {},
      {
        linking_fields_acknowledged: true,
        track_origin_original: true,
        ugc: true,
      }
    )
    const result = finalizePreflight(
      runRevelatorPreflight({
        id: 'r1',
        title: 'FTP',
        upc: '198669278325',
        artwork_url: 'https://cdn.example.com/cover.jpg',
        artwork_dsp_url: 'https://cdn.example.com/release-covers/r1/dsp-ready.jpg',
        genre: 'House',
        previously_released: true,
        marketing_copy: copy,
        target_stores: ['spotify', 'apple_music'],
        tracks: [
          {
            title: 'FTP',
            isrc: 'QZTAS2424269',
            wav_url: 'https://cdn.example.com/ftp.wav',
          },
        ],
      })
    )
    expect(result.ok).toBe(true)
    expect(result.resolvedStores.storeIds).toEqual([1, 9])
    expect(result.checklist.some((c) => c.id === 'dsp-cover' && c.done)).toBe(true)
  })

  it('parses rights defaults', () => {
    expect(parseRevelatorDeliveryRights(null).streaming).toBe(true)
    expect(parseRevelatorDeliveryRights({ revelator_delivery: { ugc: false } }).ugc).toBe(false)
  })

  it('force still requires WAV', () => {
    const result = finalizePreflight(
      runRevelatorPreflight({
        id: 'r1',
        title: 'FTP',
        upc: '198669278325',
        artwork_url: 'https://cdn.example.com/cover.jpg',
        artwork_dsp_url: 'https://cdn.example.com/dsp.jpg',
        target_stores: ['spotify'],
        tracks: [{ title: 'FTP', isrc: 'QZTAS2424269', wav_url: '' }],
      }),
      true
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some((b) => /WAV|FLAC|master/i.test(b))).toBe(true)
  })

  it('summarizes masters readiness', () => {
    const summary = summarizeMastersReadiness([
      { title: 'A', isrc: 'QZTAS2424269', wav_url: 'https://cdn.example.com/a.wav' },
      { title: 'B', isrc: null, wav_url: 'https://cdn.example.com/b.mp3' },
      { title: 'C', isrc: 'QZTAS2424270', wav_url: '' },
    ])
    expect(summary.trackCount).toBe(3)
    expect(summary.withMaster).toBe(1)
    expect(summary.withIsrc).toBe(2)
    expect(summary.nonLossless).toEqual(['B'])
    expect(summary.missingMaster).toEqual(['C'])
  })

  it('merges dimension probe into preflight', () => {
    const base = finalizePreflight(
      runRevelatorPreflight({
        id: 'r1',
        title: 'FTP',
        upc: '198669278325',
        artwork_url: 'https://cdn.example.com/cover.jpg',
        artwork_dsp_url: 'https://cdn.example.com/dsp.jpg',
        target_stores: ['spotify'],
        tracks: [
          { title: 'FTP', isrc: 'QZTAS2424269', wav_url: 'https://cdn.example.com/ftp.wav' },
        ],
      })
    )
    const merged = mergeProbeIntoPreflight(
      base,
      {
        site: {
          url: 'https://cdn.example.com/cover.jpg',
          width: 800,
          height: 800,
          bytes: 1000,
          ok: false,
          issues: ['Cover is 800×800 — DSPs require at least 1400×1400'],
        },
        dsp: null,
      },
      summarizeMastersReadiness([
        { title: 'FTP', isrc: 'QZTAS2424269', wav_url: 'https://cdn.example.com/ftp.wav' },
      ])
    )
    expect(merged.ok).toBe(false)
    expect(merged.blockers.some((b) => /800×800|≥1400/i.test(b))).toBe(true)
    expect(merged.masters?.withMaster).toBe(1)
  })
})
