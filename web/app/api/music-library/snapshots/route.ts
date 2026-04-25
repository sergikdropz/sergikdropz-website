import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { join } from 'path'
import { readdir, stat } from 'fs/promises'

/**
 * GET /api/music-library/snapshots
 * Lists local snapshot files in data/backups/.
 * (Dev/local safety tool; requires admin.)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dir = join(process.cwd(), 'data', 'backups')
    let files: string[] = []
    try {
      files = await readdir(dir)
    } catch {
      return NextResponse.json({ snapshots: [] })
    }

    const snapshots = await Promise.all(
      files
        .filter((f) => f.endsWith('.json') && f.includes('music-library-db-snapshot-'))
        .map(async (f) => {
          const s = await stat(join(dir, f))
          return { file: f, mtimeMs: s.mtimeMs, size: s.size }
        }),
    )

    snapshots.sort((a, b) => b.mtimeMs - a.mtimeMs)

    return NextResponse.json({ snapshots })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to list snapshots' }, { status: 500 })
  }
}

