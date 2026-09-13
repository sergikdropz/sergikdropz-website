import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { staticWaveformRelPath } from '@/lib/audio/waveform-playback-alignment'

export const dynamic = 'force-dynamic'

const WAVEFORMS_ROOT = path.resolve(process.cwd(), 'public', 'waveforms')

function safeWaveformAbsPath(storageRel: string): string | null {
  if (!storageRel || storageRel.includes('\0')) return null
  const rel = staticWaveformRelPath(storageRel).replace(/^[/\\]+/, '')
  if (!rel || rel.split(/[/\\]/).some((part) => part === '..' || part === '')) return null
  const abs = path.resolve(WAVEFORMS_ROOT, rel)
  if (!abs.startsWith(WAVEFORMS_ROOT + path.sep)) return null
  return abs
}

async function waveformsDirReady(): Promise<boolean> {
  try {
    const entries = await fs.readdir(WAVEFORMS_ROOT)
    return entries.some((name) => !name.startsWith('.'))
  } catch {
    return false
  }
}

/** Probe the waveforms tree, or read one tape without a browser 404. */
export async function GET(request: Request) {
  const rel = new URL(request.url).searchParams.get('rel')
  if (!rel) {
    return NextResponse.json(
      { ready: await waveformsDirReady() },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  }

  const abs = safeWaveformAbsPath(rel)
  if (!abs) {
    return NextResponse.json({ available: false }, { status: 200 })
  }

  try {
    const raw = await fs.readFile(abs, 'utf8')
    return NextResponse.json(JSON.parse(raw), {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json(
      { available: false },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
      },
    )
  }
}
