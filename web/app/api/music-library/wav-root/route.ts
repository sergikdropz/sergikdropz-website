import { spawn } from 'child_process'
import { stat } from 'fs/promises'
import { NextResponse } from 'next/server'
import { describeWavFilesRoot, getWavFilesRoot } from '@/lib/audio/export-folder-dates'
import { requireAdminApi } from '@/lib/auth/route-policy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/music-library/wav-root
 * Local WAV masters folder. This is not the Music Vault “DSP Masters” folder.
 */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const root = await describeWavFilesRoot()
  return NextResponse.json(root)
}

/** Open the WAV root in Finder on the machine running this server. */
export async function POST() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const path = getWavFilesRoot()
  if (process.platform !== 'darwin') {
    return NextResponse.json(
      { ok: false, path, error: 'Show in Finder only works on the Mac running this site' },
      { status: 400 },
    )
  }

  try {
    const info = await stat(path)
    if (!info.isDirectory()) {
      return NextResponse.json({ ok: false, path, error: 'WAV root is not a folder' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ ok: false, path, error: 'WAV root is not mounted' }, { status: 404 })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('open', [path], { stdio: 'ignore' })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`open exited ${code}`))
      })
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, path, error: error instanceof Error ? error.message : 'Could not open Finder' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, path })
}
