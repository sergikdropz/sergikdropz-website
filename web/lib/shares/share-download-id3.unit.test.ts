import { describe, expect, it } from 'vitest'
import { applyShareId3, buildShareId3, stampPreservesAudio, stripMp3Tags } from '@/lib/shares/share-download-id3'
import { shareDownloadTagFields } from '@/lib/shares/share-download-tag-text'

const fields = shareDownloadTagFields({
  title: 'Listen Up',
  artist: 'SERGIK x Slick Floyd',
  album: 'Psychoacousnatics',
  albumArtist: 'SERGIK',
  genre: 'House',
  subgenre: 'Tech House',
  trackNumber: 2,
  trackCount: 6,
  bpm: 128,
  key: 'C minor',
  year: 2024,
  dnaSummary: 'A high-energy house track at 128 BPM.',
  dnaDescription: 'Kick is a steady four-on-the-floor pulse.',
  dnaDrums: 'four-on-the-floor',
})

function frameIds(tag: Buffer): string[] {
  const ids: string[] = []
  let n = 10
  while (n + 10 <= tag.length) {
    const id = tag.toString('latin1', n, n + 4)
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const size = tag.readUInt32BE(n + 4)
    ids.push(id)
    n += 10 + size
    if (size <= 0) break
  }
  return ids
}

function tinyWav(): Buffer {
  const data = Buffer.alloc(8, 1)
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0)
  fmt.writeUInt16LE(1, 2)
  fmt.writeUInt32LE(44100, 4)
  fmt.writeUInt32LE(88200, 8)
  fmt.writeUInt16LE(2, 12)
  fmt.writeUInt16LE(16, 14)
  const chunks = Buffer.concat([
    Buffer.from('fmt '),
    uint32(fmt.length),
    fmt,
    Buffer.from('data'),
    uint32(data.length),
    data,
  ])
  const out = Buffer.concat([Buffer.from('RIFF'), uint32(4 + chunks.length), Buffer.from('WAVE'), chunks])
  return out
}

function uint32(n: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(n, 0)
  return buf
}

describe('share download tags', () => {
  it('fills the Music columns from catalog fields and Sonic DNA', () => {
    expect(fields.title).toBe('Listen Up')
    expect(fields.album).toBe('Psychoacousnatics')
    expect(fields.albumArtist).toBe('SERGIK')
    expect(fields.genre).toBe('Tech House')
    expect(fields.grouping).toBe('House · Tech House · 5A')
    expect(fields.key).toBe('5A')
    expect(fields.musicalKey).toBe('C minor')
    expect(fields.bpm).toBe('128')
    expect(fields.track).toBe('2/6')
    expect(fields.year).toBe('2024')
    expect(fields.comment.startsWith('5A · C minor · 128 BPM')).toBe(true)
    expect(fields.comment).toContain('four on the floor')
    expect(fields.description).toContain('128 BPM')
  })

  it('writes artwork plus the columns iTunes reads from the file', () => {
    const tag = buildShareId3(fields, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))
    expect(tag.toString('ascii', 0, 3)).toBe('ID3')
    expect(tag[3]).toBe(3)
    const ids = frameIds(tag)
    for (const id of ['TIT2', 'TPE1', 'TALB', 'TPE2', 'TCOM', 'TCON', 'TIT1', 'TIT3', 'TYER', 'TRCK', 'TPOS', 'TBPM', 'TKEY', 'COMM', 'APIC']) {
      expect(ids).toContain(id)
    }
  })

  it('keeps WAV audio and stores both INFO and ID3 chunks', () => {
    const wav = tinyWav()
    const tagged = applyShareId3(wav, 'wav', fields)
    expect(tagged.toString('ascii', 0, 4)).toBe('RIFF')
    expect(tagged.includes(Buffer.from('INAM'))).toBe(true)
    expect(tagged.includes(Buffer.from('id3 '))).toBe(true)
    expect(tagged.includes(Buffer.from('ID3'))).toBe(true)
    expect(tagged.includes(wav.subarray(wav.length - 8))).toBe(true)
    expect(stampPreservesAudio(wav, tagged, 'wav')).toBe(true)
  })

  it('replaces an existing MP3 tag instead of stacking one', () => {
    const audio = Buffer.concat([buildShareId3({ ...fields, title: 'Old' }), Buffer.from('AUDIO')])
    const next = applyShareId3(audio, 'mp3', fields)
    expect(stripMp3Tags(next).toString()).toBe('AUDIO')
    expect(next.indexOf(Buffer.from('AUDIO'))).toBeGreaterThan(10)
    expect(next.lastIndexOf(Buffer.from('ID3'))).toBe(0)
  })
})
