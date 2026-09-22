import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import {
  ingestDistroKidWav,
  isrcFromDistroKidWavFileName,
  titleFromDistroKidWavFileName,
} from '@/lib/studio/distrokid-wav-import-server'
import { wavMasterError } from '@/lib/audio/replace-audio-file'

/**
 * POST /api/studio/releases/from-distrokid/wavs
 * Multipart: file(s) + optional isrc / albumuuid / albumTitle / artist fields.
 * Uploads DistroKid Vault WAV masters to Cloudflare R2 and links Music Vault + distribution_tracks.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const skipIfVaultLinked = formData.get('skipIfVaultLinked') !== 'false'
    const albumuuid =
      typeof formData.get('albumuuid') === 'string'
        ? String(formData.get('albumuuid')).trim()
        : ''
    const albumTitle =
      typeof formData.get('albumTitle') === 'string'
        ? String(formData.get('albumTitle')).trim()
        : ''
    const artist =
      typeof formData.get('artist') === 'string'
        ? String(formData.get('artist')).trim()
        : 'Sergik'

    const files = formData.getAll('file').filter((f): f is File => f instanceof File)
    if (!files.length) {
      const single = formData.get('file')
      if (single instanceof File) files.push(single)
    }
    if (!files.length) {
      return NextResponse.json({ error: 'No WAV file(s) provided' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const results = []

    for (const file of files) {
      const wavError = wavMasterError(file)
      if (wavError) {
        results.push({
          status: 'error',
          fileName: file.name,
          message: wavError,
        })
        continue
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const formIsrc =
        typeof formData.get('isrc') === 'string' ? String(formData.get('isrc')).trim() : ''
      const isrc = formIsrc || isrcFromDistroKidWavFileName(file.name)
      const title =
        (typeof formData.get('title') === 'string' && String(formData.get('title')).trim()) ||
        titleFromDistroKidWavFileName(file.name)

      const result = await ingestDistroKidWav(supabase, {
        buffer,
        fileName: file.name,
        isrc,
        title,
        artist,
        albumTitle: albumTitle || null,
        albumuuid: albumuuid || null,
        skipIfVaultLinked,
      })
      results.push({ fileName: file.name, ...result })
    }

    await logActivity({
      actionType: 'import_distrokid_wavs',
      resourceType: 'release',
      resourceId: albumuuid || 'distrokid-wavs',
      details: {
        count: results.length,
        ingested: results.filter((r) => r.status === 'ingested').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
      },
    })

    return NextResponse.json({ results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'DistroKid WAV import failed'
    console.error('POST /api/studio/releases/from-distrokid/wavs:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
