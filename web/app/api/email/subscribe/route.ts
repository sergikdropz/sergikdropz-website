import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { email, name, source, trackId } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    // Upsert subscriber
    const { data: subscriber, error: dbError } = await supabase
      .from('email_subscribers')
      .upsert(
        {
          email: email.toLowerCase().trim(),
          name: name || null,
          source: source || 'website',
          source_track_id: trackId || null,
          is_active: true,
        },
        { onConflict: 'email' }
      )
      .select()
      .single()

    if (dbError) {
      console.error('Error saving subscriber:', dbError)
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
    }

    // Build download URL if this is a free download request
    let downloadUrl: string | null = null
    if (trackId) {
      const getBaseUrl = () => {
        if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
        const url = new URL(request.url)
        return `${url.protocol}//${url.host}`
      }
      downloadUrl = `${getBaseUrl()}/api/download/free?trackId=${trackId}&token=${subscriber.unsubscribe_token}`
    }

    // Send welcome email
    try {
      const getBaseUrl = () => {
        if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
        const url = new URL(request.url)
        return `${url.protocol}//${url.host}`
      }
      const baseUrl = getBaseUrl()

      await sendEmail({
        to: email,
        subject: trackId ? 'Your Free Download is Ready!' : 'Welcome to the SERGIK community!',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a1a; color: #ddd; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #0a0a0a; padding: 40px; border-radius: 8px;">
    <h1 style="color: #fff; text-align: center; font-size: 28px; margin: 0 0 20px;">SERGIK</h1>
    <p>Hey${name ? ` ${name}` : ''},</p>
    ${downloadUrl
      ? `<p>Your free download is ready! Click the button below:</p>
         <p style="text-align: center;"><a href="${downloadUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">Download Now</a></p>`
      : `<p>Thanks for joining the community! You'll be the first to know about new releases, exclusive content, and more.</p>`
    }
    <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; font-size: 12px; color: #666;">
      <p>&copy; 2026 SERGIK. All rights reserved.</p>
      <p><a href="${baseUrl}/api/email/unsubscribe?token=${subscriber.unsubscribe_token}" style="color: #666;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
        `,
      })
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError)
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
    })
  } catch (error: any) {
    console.error('Subscribe error:', error)
    return NextResponse.json(
      { error: error.message || 'Subscription failed' },
      { status: 500 }
    )
  }
}
