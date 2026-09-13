import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

/**
 * After Stripe verifies payment, redirect to the asset URL.
 * Do NOT readFile() from process.cwd()/public — Next NFT packs public media
 * into the serverless function and blows past Vercel's 250MB limit.
 */
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
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 403 }
      )
    }

    if (session.metadata?.trackId !== trackId || session.metadata?.format !== format) {
      return NextResponse.json(
        { error: 'Invalid download request' },
        { status: 403 }
      )
    }

    const purchasableTracks = await import('@/data/purchasable-tracks.json')
    const track = purchasableTracks.tracks.find((t: any) => t.id === trackId)

    if (!track) {
      return NextResponse.json(
        { error: 'Track not found' },
        { status: 404 }
      )
    }

    const selectedFormat = track.formats.find((f: any) => f.type === format)
    if (!selectedFormat?.file) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      )
    }

    const file = String(selectedFormat.file)
    if (/^https?:\/\//i.test(file)) {
      return NextResponse.redirect(file, 302)
    }

    const path = file.startsWith('/') ? file : `/${file}`
    return NextResponse.redirect(new URL(path, request.url), 302)
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process download' },
      { status: 500 }
    )
  }
}
