import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { readFile } from 'fs/promises'
import { join } from 'path'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')
  const trackId = searchParams.get('track_id')
  const format = searchParams.get('format')

  if (!sessionId || !trackId || !format) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    )
  }

  try {
    // Verify the session with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 403 }
      )
    }

    // Verify the track and format match
    if (session.metadata?.trackId !== trackId || session.metadata?.format !== format) {
      return NextResponse.json(
        { error: 'Invalid download request' },
        { status: 403 }
      )
    }

    // Get track data
    const purchasableTracks = await import('@/data/purchasable-tracks.json')
    const track = purchasableTracks.tracks.find((t: any) => t.id === trackId)
    
    if (!track) {
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      )
    }

    const selectedFormat = track.formats.find((f: any) => f.type === format)
    if (!selectedFormat) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      )
    }

    // Read the file
    const filePath = join(process.cwd(), 'public', selectedFormat.file)
    
    try {
      const fileBuffer = await readFile(filePath)
      const fileName = `${track.title.replace(/[^a-z0-9]/gi, '_')}.${format.toLowerCase()}`

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': format === 'MP3' ? 'audio/mpeg' : format === 'WAV' ? 'audio/wav' : 'audio/flac',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      })
    } catch (fileError) {
      console.error('File read error:', fileError)
      return NextResponse.json(
        { error: 'File not found on server' },
        { status: 404 }
      )
    }
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process download' },
      { status: 500 }
    )
  }
}

