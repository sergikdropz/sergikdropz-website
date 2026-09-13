import { NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

/**
 * API Route: Verify Purchase and Get Download URL
 * 
 * GET /api/purchases/verify?sessionId=cs_test_...
 * 
 * Query params:
 * - sessionId: Stripe session ID
 * 
 * Returns: { valid: boolean, fileUrl?: string, trackTitle?: string }
 */

// Force dynamic rendering since we use request.url
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseClient()

    // Look up purchase
    const { data: purchase, error } = await supabase
      .from('purchases')
      .select('file_url, track_title, download_count')
      .eq('stripe_session_id', sessionId)
      .single()

    if (error || !purchase) {
      return NextResponse.json({
        valid: false,
        error: 'Purchase not found',
      })
    }

    // Increment download count
    await supabase
      .from('purchases')
      .update({
        download_count: (purchase.download_count || 0) + 1,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('stripe_session_id', sessionId)

    return NextResponse.json({
      valid: true,
      fileUrl: purchase.file_url,
      trackTitle: purchase.track_title,
    })
  } catch (error: any) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

