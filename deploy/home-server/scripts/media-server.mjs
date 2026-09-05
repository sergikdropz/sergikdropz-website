#!/usr/bin/env node
/**
 * CORS + Range static server for web/public (audio + images).
 * Used so sergikdropz.com can play MP3s while cloud Storage is down.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../web/public')
const PORT = Number(process.env.MEDIA_PORT || 8088)

const MIME = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
}

const server = http.createServer((req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/') rel = '/index.html'
  const filePath = path.normalize(path.join(ROOT, rel))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end()
    return
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404)
      res.end('not found')
      return
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    const range = req.headers.range
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=86400')

    if (range && range.startsWith('bytes=')) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-')
      const start = Number(startStr)
      const end = endStr ? Number(endStr) : st.size - 1
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` })
        res.end()
        return
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      fs.createReadStream(filePath, { start, end }).pipe(res)
      return
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(filePath).pipe(res)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[media-server] http://127.0.0.1:${PORT} root=${ROOT}`)
})
