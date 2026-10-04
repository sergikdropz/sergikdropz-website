import { createReadStream, existsSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { Zip, ZipPassThrough } from 'fflate'
import { fetchR2Object, presignR2ObjectUrl } from '@/lib/audio/r2Media'

function localAudioPath(relative: string): string | null {
  const root = path.join(process.cwd(), 'public', 'audio')
  const filePath = path.resolve(root, relative)
  if (!filePath.startsWith(root + path.sep)) return null
  if (!existsSync(filePath)) return null
  return filePath
}

export async function presignAttachment(relativePath: string, filename: string): Promise<string | null> {
  return presignR2ObjectUrl(relativePath, 60 * 15, { downloadName: filename })
}

export function contentTypeForDownload(relativePath: string): string {
  if (/\.wav$/i.test(relativePath)) return 'audio/wav'
  if (/\.mp3$/i.test(relativePath)) return 'audio/mpeg'
  return 'application/octet-stream'
}

export async function readVaultAudio(relativePath: string): Promise<Buffer | null> {
  const stream = await openDownloadStream(relativePath)
  if (!stream) return null
  const chunks: Buffer[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.byteLength) chunks.push(Buffer.from(value))
  }
  if (!chunks.length) return null
  return Buffer.concat(chunks)
}

export async function openDownloadStream(relativePath: string): Promise<ReadableStream<Uint8Array> | null> {
  const remote = await fetchR2Object(relativePath, { method: 'GET' })
  if (remote?.body) return remote.body
  const local = localAudioPath(relativePath)
  if (!local) return null
  const node = createReadStream(local)
  return Readable.toWeb(node) as ReadableStream<Uint8Array>
}

async function pushFile(entry: ZipPassThrough, file: { relativePath: string; bytes?: Uint8Array }): Promise<boolean> {
  if (file.bytes?.byteLength) {
    const chunkSize = 64 * 1024
    for (let offset = 0; offset < file.bytes.byteLength; offset += chunkSize) {
      entry.push(file.bytes.subarray(offset, offset + chunkSize), false)
    }
    entry.push(new Uint8Array(), true)
    return true
  }
  const stream = await openDownloadStream(file.relativePath)
  if (!stream) return false
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      entry.push(new Uint8Array(), true)
      return true
    }
    if (value?.byteLength) entry.push(value, false)
  }
}

export function zipDownloadStream(
  files: Array<{ filename: string; relativePath: string; bytes?: Uint8Array }>,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((err, data, final) => {
        if (err) {
          controller.error(err)
          return
        }
        if (data?.byteLength) controller.enqueue(data)
        if (final) controller.close()
      })
      try {
        for (const file of files) {
          const entry = new ZipPassThrough(file.filename)
          zip.add(entry)
          const ok = await pushFile(entry, file)
          if (!ok) entry.push(new Uint8Array(), true)
        }
        zip.end()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
