import { describe, expect, it } from 'vitest'
import {
  FOLDER_MUSIC_VIDEOS_MAX,
  folderMusicVideosMetadataPatch,
  parseFolderMusicVideos,
  serializeFolderMusicVideos,
} from './folder-music-videos'

describe('parseFolderMusicVideos', () => {
  it('returns empty for missing metadata', () => {
    expect(parseFolderMusicVideos(undefined)).toEqual([])
    expect(parseFolderMusicVideos({})).toEqual([])
  })

  it('parses youtube ids, urls, and caps at four', () => {
    const videos = parseFolderMusicVideos({
      music_videos: [
        'RtkwXVUvdQQ',
        { youtube_id: 'OML1I_V4Dy4', title: 'Utopia' },
        { url: 'https://youtu.be/00jCu-4hgZg' },
        'https://www.youtube.com/watch?v=0-ncbzh-7Jw',
        'https://www.youtube.com/watch?v=extraVideo',
      ],
    })
    expect(videos).toHaveLength(FOLDER_MUSIC_VIDEOS_MAX)
    expect(videos.map((v) => v.youtubeId)).toEqual([
      'RtkwXVUvdQQ',
      'OML1I_V4Dy4',
      '00jCu-4hgZg',
      '0-ncbzh-7Jw',
    ])
    expect(videos[1]?.title).toBe('Utopia')
  })

  it('dedupes by youtube id', () => {
    expect(
      parseFolderMusicVideos({
        music_videos: ['RtkwXVUvdQQ', { youtubeId: 'RtkwXVUvdQQ', title: 'Dup' }],
      }),
    ).toHaveLength(1)
  })
})

describe('serializeFolderMusicVideos', () => {
  it('writes a metadata patch ready for folder PUT merge', () => {
    expect(
      folderMusicVideosMetadataPatch([
        { id: 'a', youtubeId: 'RtkwXVUvdQQ', title: 'Smoke Break' },
        { id: 'bad', youtubeId: 'nope' },
      ]),
    ).toEqual({
      music_videos: [{ id: 'a', youtubeId: 'RtkwXVUvdQQ', title: 'Smoke Break' }],
    })
  })

  it('serializes a clean list', () => {
    expect(
      serializeFolderMusicVideos([
        { id: 'x', youtubeId: 'RtkwXVUvdQQ' },
        { id: 'y', youtubeId: 'RtkwXVUvdQQ' },
      ]),
    ).toEqual([{ id: 'x', youtubeId: 'RtkwXVUvdQQ' }])
  })
})
