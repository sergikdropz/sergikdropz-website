import { describe, expect, it } from 'vitest'
import {
  featuredVideo,
  normalizeCatalog,
  publicVideos,
  removeCatalogVideo,
  reorderCatalogVideos,
  upsertCatalogVideo,
} from '@/lib/videos/catalog-model'

const catalog = normalizeCatalog({
  youtube_channel: 'https://youtube.com/@sergikdropz',
  videos: [
    { id: 'a', title: 'A', youtube_id: 'aaaaaaaaaaa', category: 'music-video', date: '2024' },
    { id: 'b', title: 'B', youtube_id: 'bbbbbbbbbbb', featured: true, date: '2025' },
    { id: 'c', title: 'C', youtube_id: 'ccccccccccc', published: false, date: '2023' },
  ],
})

describe('catalog-model', () => {
  it('normalizes missing published as visible', () => {
    expect(catalog.videos[0].published).toBe(true)
    expect(publicVideos(catalog).map((video) => video.id)).toEqual(['a', 'b'])
  })

  it('uses the featured video as the hero', () => {
    expect(featuredVideo(publicVideos(catalog))?.id).toBe('b')
  })

  it('keeps a single featured video when upserting', () => {
    const next = upsertCatalogVideo(catalog, {
      id: 'a',
      title: 'A',
      description: '',
      youtube_id: 'aaaaaaaaaaa',
      category: 'music-video',
      date: '2024',
      featured: true,
      published: true,
    })
    expect(next.videos.filter((video) => video.featured).map((video) => video.id)).toEqual(['a'])
  })

  it('reorders and removes videos', () => {
    expect(reorderCatalogVideos(catalog.videos, ['c', 'a']).map((video) => video.id)).toEqual(['c', 'a', 'b'])
    expect(removeCatalogVideo(catalog, 'b').videos.map((video) => video.id)).toEqual(['a', 'c'])
  })
})
