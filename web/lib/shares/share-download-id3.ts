/**
 * ID3v2.3 tags that Music, iTunes, and Finder read from MP3 and WAV files.
 * Text frames use UTF-16 so titles with punctuation stay intact.
 */

export type ShareAudioTagFields = {
  title: string
  artist: string
  album: string
  albumArtist: string
  composer: string
  genre: string
  grouping: string
  year: string
  /** "2" or "2/8" */
  track: string
  /** "1/1" */
  disc: string
  bpm: string
  /** Initial key. Camelot code when we know it (8A), otherwise a short musical key (Cm). */
  key: string
  /** Spelled key, e.g. "C minor". */
  musicalKey?: string
  /** Camelot wheel code, e.g. "5A". */
  camelot?: string
  /** 1–10, the scale DJ apps show as energy. */
  energy?: string
  comment: string
  description: string
}

function utf16(value: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(value, 'utf16le')])
}

function frame(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(10)
  header.write(id, 0, 4, 'latin1')
  header.writeUInt32BE(body.length, 4)
  return Buffer.concat([header, body])
}

function textFrame(id: string, value: string): Buffer | null {
  const text = value.trim()
  if (!text) return null
  return frame(id, Buffer.concat([Buffer.from([1]), utf16(text)]))
}

function commentFrame(value: string): Buffer | null {
  const text = value.trim()
  if (!text) return null
  const body = Buffer.concat([
    Buffer.from([1]),
    Buffer.from('eng'),
    Buffer.from([0xff, 0xfe, 0x00, 0x00]),
    utf16(text),
  ])
  return frame('COMM', body)
}

function userTextFrame(description: string, value: string): Buffer | null {
  const text = value.trim()
  if (!text) return null
  const body = Buffer.concat([
    Buffer.from([1]),
    utf16(description),
    Buffer.from([0x00, 0x00]),
    utf16(text),
  ])
  return frame('TXXX', body)
}

function jpegFrame(jpeg: Uint8Array): Buffer {
  const body = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from('image/jpeg\0', 'latin1'),
    Buffer.from([0x03]),
    Buffer.from([0x00]),
    Buffer.from(jpeg),
  ])
  return frame('APIC', body)
}

function synchsafe(size: number): Buffer {
  return Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f])
}

export function unsynchsafe(bytes: Uint8Array): number {
  return ((bytes[0]! & 0x7f) << 21) | ((bytes[1]! & 0x7f) << 14) | ((bytes[2]! & 0x7f) << 7) | (bytes[3]! & 0x7f)
}

export function buildShareId3(fields: ShareAudioTagFields, artworkJpeg?: Uint8Array | null): Buffer {
  const frames = [
    textFrame('TIT2', fields.title),
    textFrame('TPE1', fields.artist),
    textFrame('TALB', fields.album),
    textFrame('TPE2', fields.albumArtist),
    textFrame('TCOM', fields.composer),
    textFrame('TCON', fields.genre),
    textFrame('TIT1', fields.grouping),
    textFrame('TIT3', fields.description),
    textFrame('TYER', fields.year),
    textFrame('TRCK', fields.track),
    textFrame('TPOS', fields.disc),
    textFrame('TBPM', fields.bpm),
    textFrame('TKEY', fields.camelot || fields.key),
    textFrame('TSOT', fields.title),
    textFrame('TSOP', fields.artist),
    textFrame('TSOA', fields.album),
    textFrame('TSO2', fields.albumArtist),
    textFrame('TSOC', fields.composer),
    textFrame('TPUB', 'SERGIK'),
    commentFrame(fields.comment),
    userTextFrame('Description', fields.description),
    userTextFrame('Sonic DNA', fields.comment),
    userTextFrame('INITIALKEY', fields.camelot || fields.key),
    userTextFrame('KEY', fields.musicalKey || fields.key),
    userTextFrame('ENERGYLEVEL', fields.energy || ''),
    userTextFrame('BPM', fields.bpm),
    artworkJpeg?.byteLength ? jpegFrame(artworkJpeg) : null,
  ].filter((part): part is Buffer => Boolean(part))

  const body = Buffer.concat(frames)
  const header = Buffer.alloc(10)
  header.write('ID3', 0, 3, 'latin1')
  header[3] = 3
  header[4] = 0
  synchsafe(body.length).copy(header, 6)
  return Buffer.concat([header, body])
}

export function stampPreservesAudio(original: Buffer, tagged: Buffer, format: 'mp3' | 'wav'): boolean {
  if (format === 'wav') {
    const originalData = wavPcmLength(original)
    const taggedData = wavPcmLength(tagged)
    return (
      originalData != null &&
      originalData > 0 &&
      originalData === taggedData &&
      tagged.length >= original.length &&
      tagged.toString('ascii', 0, 4) === 'RIFF' &&
      tagged.toString('ascii', 8, 12) === 'WAVE'
    )
  }
  if (tagged.length < 10 || tagged.toString('ascii', 0, 3) !== 'ID3') return false
  const sourceAudio = stripMp3Tags(original)
  const stampedAudio = stripMp3Tags(tagged)
  if (sourceAudio.length < 64 || sourceAudio.length !== stampedAudio.length) return false
  const head = Math.min(4096, sourceAudio.length)
  const tail = Math.min(4096, sourceAudio.length)
  return (
    sourceAudio.subarray(0, head).equals(stampedAudio.subarray(0, head)) &&
    sourceAudio.subarray(sourceAudio.length - tail).equals(stampedAudio.subarray(stampedAudio.length - tail))
  )
}

function wavPcmLength(wav: Buffer): number | null {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    return null
  }
  let offset = 12
  let total = 0
  let found = false
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const next = offset + 8 + size + (size % 2)
    if (next < offset || next > wav.length + 1) return found ? total : null
    if (id === 'data') {
      total += size
      found = true
    }
    offset = Math.min(wav.length, next)
  }
  return found ? total : null
}

export function stripMp3Tags(mp3: Buffer): Buffer {
  let start = 0
  if (mp3.length >= 10 && mp3.toString('ascii', 0, 3) === 'ID3') {
    const tagSize = unsynchsafe(mp3.subarray(6, 10))
    const footer = (mp3[5]! & 0x10) !== 0 ? 10 : 0
    start = Math.min(mp3.length, 10 + tagSize + footer)
  }
  let end = mp3.length
  if (end - start >= 128 && mp3.toString('ascii', end - 128, end - 125) === 'TAG') end -= 128
  return mp3.subarray(start, end)
}

/** Append a WAV `id3 ` chunk so Music/iTunes reads the same tags as an MP3. */
export function injectWavId3(wav: Buffer, id3: Buffer): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    return wav
  }
  const kept: Buffer[] = []
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const next = offset + 8 + size + (size % 2)
    if (next < offset || next > wav.length + 1) break
    const end = Math.min(wav.length, next)
    if (id !== 'id3 ') kept.push(wav.subarray(offset, end))
    offset = end
  }
  const size = Buffer.alloc(4)
  size.writeUInt32LE(id3.length, 0)
  const chunk = Buffer.concat([
    Buffer.from('id3 ', 'ascii'),
    size,
    id3,
    id3.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
  ])
  const body = Buffer.concat([...kept, chunk])
  const out = Buffer.alloc(12 + body.length)
  out.write('RIFF', 0, 4, 'ascii')
  out.writeUInt32LE(out.length - 8, 4)
  out.write('WAVE', 8, 4, 'ascii')
  body.copy(out, 12)
  return out
}

export function applyShareId3(audio: Buffer, format: 'mp3' | 'wav', fields: ShareAudioTagFields, artworkJpeg?: Uint8Array | null): Buffer {
  const tag = buildShareId3(fields, artworkJpeg)
  if (format === 'wav') return injectWavId3(injectWavInfo(audio, fields), tag)
  return Buffer.concat([tag, stripMp3Tags(audio)])
}

function latin1Field(text: string, max: number): Buffer | null {
  const ascii = text
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  if (!ascii) return null
  const body = Buffer.from(`${ascii}\0`, 'latin1')
  const header = Buffer.alloc(8)
  header.write('    ', 0, 4, 'ascii')
  header.writeUInt32LE(body.length, 4)
  const pad = body.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
  return Buffer.concat([header, body, pad])
}

function infoField(id: string, text: string): Buffer | null {
  const chunk = latin1Field(text, 240)
  if (!chunk) return null
  chunk.write(id, 0, 4, 'ascii')
  return chunk
}

/** WAV LIST/INFO chunk for software that does not read the ID3 chunk. */
export function injectWavInfo(wav: Buffer, fields: ShareAudioTagFields): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    return wav
  }
  const parts = [
    infoField('INAM', fields.title),
    infoField('IART', fields.artist),
    infoField('IPRD', fields.album),
    infoField('IGNR', fields.genre),
    infoField('ICMT', fields.comment),
    infoField('ICRD', fields.year),
    infoField('ITRK', fields.track),
    infoField('ISBJ', [fields.camelot, fields.musicalKey, fields.bpm ? `${fields.bpm} BPM` : ''].filter(Boolean).join(' ')),
  ].filter((part): part is Buffer => Boolean(part))
  if (!parts.length) return wav

  const info = Buffer.concat([Buffer.from('INFO', 'ascii'), ...parts])
  const size = Buffer.alloc(4)
  size.writeUInt32LE(info.length, 0)
  const list = Buffer.concat([Buffer.from('LIST', 'ascii'), size, info, info.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)])

  const kept: Buffer[] = []
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const chunkSize = wav.readUInt32LE(offset + 4)
    const next = offset + 8 + chunkSize + (chunkSize % 2)
    if (next < offset || next > wav.length + 1) break
    const end = Math.min(wav.length, next)
    const isInfo = id === 'LIST' && wav.toString('ascii', offset + 8, offset + 12) === 'INFO'
    if (!isInfo) kept.push(wav.subarray(offset, end))
    offset = end
  }
  const body = Buffer.concat([...kept, list])
  const out = Buffer.alloc(12 + body.length)
  out.write('RIFF', 0, 4, 'ascii')
  out.writeUInt32LE(out.length - 8, 4)
  out.write('WAVE', 8, 4, 'ascii')
  body.copy(out, 12)
  return out
}
