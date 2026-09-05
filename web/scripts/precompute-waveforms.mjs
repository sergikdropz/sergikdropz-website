#!/usr/bin/env node
/**
 * Precompute DSP waveform envelopes from web/public/audio into web/public/waveforms.
 * Deployed with the site so production can paint accurate tapes without the media tunnel.
 *
 * Usage: node scripts/precompute-waveforms.mjs [--limit N] [--force]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const audioRoot = path.join(webRoot, 'public', 'audio')
const outRoot = path.join(webRoot, 'public', 'waveforms')
const BUCKETS = 2000

const args = process.argv.slice(2)
const force = args.includes('--force')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity

function onePoleCoeff(cutoffHz, sampleRate) {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / Math.max(1, sampleRate))
}

function envelopesFromPcm(samples, sampleRate, buckets = BUCKETS) {
  const n = samples.length
  if (n < 32) return []
  const block = Math.max(1, Math.floor(n / buckets))
  const aLow = onePoleCoeff(250, sampleRate)
  const aMid = onePoleCoeff(2500, sampleRate)
  let lpLow = 0
  let lpMid = 0
  const out = []
  let maxPeak = 1e-8
  let maxBand = 1e-8

  for (let b = 0; b < buckets; b++) {
    const start = b * block
    const end = b === buckets - 1 ? n : Math.min(n, start + block)
    let sumSq = 0
    let peak = 0
    let sumLow = 0
    let sumMid = 0
    let sumHigh = 0
    let count = 0
    for (let i = start; i < end; i++) {
      const x = samples[i] || 0
      const ax = Math.abs(x)
      lpLow += aLow * (x - lpLow)
      lpMid += aMid * (x - lpMid)
      const low = lpLow
      const mid = lpMid - lpLow
      const high = x - lpMid
      peak = Math.max(peak, ax)
      sumSq += x * x
      sumLow += Math.abs(low)
      sumMid += Math.abs(mid)
      sumHigh += Math.abs(high)
      count++
    }
    const c = Math.max(1, count)
    const env = {
      peak,
      rms: Math.sqrt(sumSq / c),
      low: sumLow / c,
      mid: sumMid / c,
      high: sumHigh / c,
    }
    maxPeak = Math.max(maxPeak, env.peak, env.rms)
    maxBand = Math.max(maxBand, env.low, env.mid, env.high)
    out.push(env)
  }

  for (const e of out) {
    e.peak /= maxPeak
    e.rms /= maxPeak
    e.low /= maxBand
    e.mid /= maxBand
    e.high /= maxBand
  }
  return out
}

function decodeMonoF32(filePath) {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      'ffmpeg',
      ['-v', 'error', '-i', filePath, '-ac', '1', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const chunks = []
    let err = ''
    ff.stdout.on('data', (c) => chunks.push(c))
    ff.stderr.on('data', (c) => {
      err += c.toString()
    })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err || `ffmpeg exit ${code}`))
        return
      }
      const buf = Buffer.concat(chunks)
      const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
      resolve(samples)
    })
  })
}

function probeSampleRate(filePath) {
  return new Promise((resolve) => {
    const ff = spawn(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', filePath],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    let out = ''
    ff.stdout.on('data', (c) => {
      out += c.toString()
    })
    ff.on('close', () => {
      const sr = Number(String(out).trim().split('\n')[0])
      resolve(Number.isFinite(sr) && sr > 0 ? sr : 44100)
    })
    ff.on('error', () => resolve(44100))
  })
}

function walkMp3(dir, base = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walkMp3(full, base, acc)
    else if (/\.mp3$/i.test(name)) acc.push(full)
  }
  return acc
}

async function main() {
  const files = walkMp3(audioRoot).sort()
  const selected = files.slice(0, Number.isFinite(limit) ? limit : files.length)
  fs.mkdirSync(outRoot, { recursive: true })

  console.log(`[precompute-waveforms] ${selected.length}/${files.length} tracks → ${outRoot}`)
  let ok = 0
  let skip = 0
  let fail = 0

  for (let i = 0; i < selected.length; i++) {
    const filePath = selected[i]
    const rel = path.relative(audioRoot, filePath).replace(/\\/g, '/')
    const outPath = path.join(outRoot, rel.replace(/\.mp3$/i, '.json'))
    if (!force && fs.existsSync(outPath)) {
      skip++
      continue
    }
    process.stdout.write(`[${i + 1}/${selected.length}] ${rel} ... `)
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      const sampleRate = await probeSampleRate(filePath)
      const pcm = await decodeMonoF32(filePath)
      const envelopes = envelopesFromPcm(pcm, sampleRate, BUCKETS)
      const data = envelopes.map((e) => e.rms * 0.7 + e.peak * 0.3)
      const payload = {
        v: 1,
        p: rel,
        sr: sampleRate,
        d: data.map((n) => +Number(n).toFixed(5)),
        e: envelopes.map((x) => [
          +x.peak.toFixed(5),
          +x.rms.toFixed(5),
          +x.low.toFixed(5),
          +x.mid.toFixed(5),
          +x.high.toFixed(5),
        ]),
      }
      fs.writeFileSync(outPath, JSON.stringify(payload))
      ok++
      console.log(`ok (${envelopes.length})`)
    } catch (e) {
      fail++
      console.log(`FAIL ${e.message || e}`)
    }
  }

  // Manifest for quick lookup
  const manifest = {
    generatedAt: new Date().toISOString(),
    count: ok + skip,
    buckets: BUCKETS,
  }
  fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`[precompute-waveforms] done ok=${ok} skip=${skip} fail=${fail}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
