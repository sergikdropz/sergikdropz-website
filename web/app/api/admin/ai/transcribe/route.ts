import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 24 * 1024 * 1024

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Transcription failed'
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not set. Add it to enable audio file transcription (Whisper).' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Expected multipart field "file"' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 400 })
    }

    const name = (formData.get('filename') as string | null) || 'audio.webm'
    const upstream = new FormData()
    upstream.append('model', 'whisper-1')
    upstream.append('file', file, name)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    })

    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } }

    if (!res.ok) {
      const msg = body.error?.message || `OpenAI error (${res.status})`
      return NextResponse.json({ error: msg }, { status: res.status >= 400 && res.status < 600 ? res.status : 502 })
    }

    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) {
      return NextResponse.json({ error: 'Empty transcription result' }, { status: 502 })
    }

    return NextResponse.json({ text })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 })
  }
}
