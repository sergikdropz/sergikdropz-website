#!/usr/bin/env node
/**
 * Builds the Psychoacousnatics 32-bar square loop.
 * Bars 1–16 are the clips already on disk. Bars 17–32 are generated
 * through fal Wan 3 when FAL_KEY is set, then hard-joined.
 *
 *   cd web && node scripts/psychoacousnatics-loop-pipeline.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createWriteStream } from 'node:fs'

const HOME = homedir()
const OUT_DIR = join(HOME, 'Movies', 'SERGIK Visualizers')
const FRAME_DIR = join(OUT_DIR, 'frames')
const CLIP_A = join(
  HOME,
  'Downloads',
  'Bars 1-8 of a 32-bar seamless loop at 125 BPM _quarter note.mp4',
)
const CLIP_B = join(OUT_DIR, 'psychoacousnatics-bars9-16-1440.mp4')
const HALF = join(OUT_DIR, 'psychoacousnatics-bars1-16-1440.mp4')
const MASTER = join(OUT_DIR, 'psychoacousnatics-32bar-1440.mp4')
const OPENING = join(FRAME_DIR, 'clip1-first.png')
const HANDOFF = join(FRAME_DIR, 'clip2-last.png')

const BPM = 125
const BAR_SEC = (4 * 60) / BPM
const TARGET_SEC = 32 * BAR_SEC
const RETURN_SEC = 10
const MIDDLE_SEC = Math.round((TARGET_SEC - 30.08 - RETURN_SEC) * 10) / 10

const HIERARCHY = [
  '125 BPM house visualizer of this exact 1:1 hand-drawn synth laboratory.',
  'Do not move everything equally.',
  'Hero: rainbow plume keeps its silhouette, curls, colors flowing, brightness on each downbeat. Galaxy flask rotates in layers, not as one flat spin. Kick only swells those two.',
  'Performance: left scientist nods 2-3 degrees on beats 1 and 3. Right scientist accents beats 2 and 4. Independent blinks. Faces, sunglasses, hands, and lettering never morph. Hat, hair, beard, and coat lag a few frames.',
  'Musical: left Moog/AKAI and right Korg/Roland sequence differently. Chassis stays still. LEDs, meters, oscilloscope, and a few crystals react like a drum machine.',
  'Atmosphere only: stars, slow portal, barely drifting planets, UFO hover of a few pixels.',
  'Still anchors: table, skull, synth chassis, notebook drawings.',
  'Fixed square frame. No crop, zoom, cuts, or new objects.',
].join(' ')

const PHASES = [
  {
    id: 'bars-17-27',
    duration: MIDDLE_SEC,
    prompt: `${HIERARCHY} PHASE: full laboratory groove into a psychedelic peak. Do not return to the opening pose. Leave the last frame in motion.`,
    end: false,
  },
  {
    id: 'return-10s',
    duration: RETURN_SEC,
    prompt: `${HIERARCHY} PHASE: controlled return. Keep a light groove at first, then over this whole clip settle every moving part back onto the supplied last frame, which is the exact opening picture.`,
    end: true,
  },
]

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function probe(file) {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,avg_frame_rate,duration',
      '-of',
      'default=nw=1',
      file,
    ],
    { encoding: 'utf8' },
  )
  const map = Object.fromEntries(
    out
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  )
  return {
    width: Number(map.width),
    height: Number(map.height),
    fps: map.avg_frame_rate,
    duration: Number(map.duration),
  }
}

function stitch(files, dest) {
  const list = join(dirname(dest), `concat-${Date.now()}.txt`)
  writeFileSync(
    list,
    files.map((file) => `file '${file.replaceAll("'", "'\\''")}'\n`).join(''),
  )
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', dest])
}

function lastFrame(video, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  run('ffmpeg', ['-y', '-sseof', '-0.08', '-i', video, '-update', '1', '-frames:v', '1', dest])
}

function scaleToMaster(input, dest) {
  run('ffmpeg', [
    '-y',
    '-i',
    input,
    '-vf',
    'scale=1440:1440:force_original_aspect_ratio=increase,crop=1440:1440,fps=24',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    dest,
  ])
}

async function falUpload(filePath) {
  const key = process.env.FAL_KEY
  const body = readFileSync(filePath)
  const res = await fetch('https://fal.run/fal-ai/upload', {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'image/png',
    },
    body,
  })
  if (!res.ok) {
    const via = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content_type: 'image/png',
        file_name: filePath.split('/').pop(),
      }),
    })
    if (!via.ok) throw new Error(`fal upload failed (${res.status} / ${via.status})`)
    const init = await via.json()
    const put = await fetch(init.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body,
    })
    if (!put.ok) throw new Error(`fal put failed (${put.status})`)
    return init.file_url
  }
  const data = await res.json()
  return data.url || data.file_url
}

async function falGenerate(input) {
  const key = process.env.FAL_KEY
  const queued = await fetch('https://queue.fal.run/fal-ai/wan-3/image-to-video', {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!queued.ok) throw new Error(`fal queue ${queued.status}: ${await queued.text()}`)
  const job = await queued.json()
  const statusUrl = job.status_url
  const responseUrl = job.response_url
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 8000))
    const status = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } })
    const body = await status.json()
    console.log(body.status || body)
    if (body.status === 'COMPLETED') break
    if (body.status === 'FAILED' || body.error) throw new Error(JSON.stringify(body))
  }
  const done = await fetch(responseUrl, { headers: { Authorization: `Key ${key}` } })
  if (!done.ok) throw new Error(`fal result ${done.status}`)
  return done.json()
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  await new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    res.body.pipe(file)
    res.body.on('error', reject)
    file.on('finish', resolve)
  })
}

async function main() {
  mkdirSync(FRAME_DIR, { recursive: true })
  for (const file of [CLIP_A, CLIP_B, OPENING]) {
    if (!existsSync(file)) throw new Error(`missing ${file}`)
  }
  stitch([CLIP_A, CLIP_B], HALF)
  lastFrame(CLIP_B, HANDOFF)
  const half = probe(HALF)
  console.log('half', half, HALF)

  if (!process.env.FAL_KEY) {
    const plan = {
      targetSec: TARGET_SEC,
      haveSec: half.duration,
      missingSec: TARGET_SEC - half.duration,
      handoffFrame: HANDOFF,
      openingFrame: OPENING,
      phases: PHASES,
      blocked: 'Set FAL_KEY and rerun. Runway and OpenArt cannot render the remainder from this machine.',
    }
    writeFileSync(join(OUT_DIR, 'loop-remaining.json'), JSON.stringify(plan, null, 2))
    console.log(JSON.stringify(plan, null, 2))
    process.exitCode = 2
    return
  }

  const openingUrl = await falUpload(OPENING)
  let startUrl = await falUpload(HANDOFF)
  const generated = []
  for (const phase of PHASES) {
    const input = {
      prompt: phase.prompt,
      start_image_url: startUrl,
      aspect_ratio: '1:1',
      resolution: '720p',
      duration: phase.duration,
      audio: false,
      enable_prompt_expansion: false,
      enable_safety_checker: true,
    }
    if (phase.end) input.end_image_url = openingUrl
    console.log('generate', phase.id, phase.duration)
    const result = await falGenerate(input)
    const raw = join(OUT_DIR, `${phase.id}-raw.mp4`)
    const fitted = join(OUT_DIR, `${phase.id}.mp4`)
    await download(result.video.url, raw)
    scaleToMaster(raw, fitted)
    generated.push(fitted)
    const frame = join(FRAME_DIR, `${phase.id}-last.png`)
    lastFrame(fitted, frame)
    startUrl = await falUpload(frame)
  }
  stitch([HALF, ...generated], MASTER)
  console.log('master', probe(MASTER), MASTER)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
