import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return new Response(htmlPage('Invalid Link', 'No unsubscribe token provided.'), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('email_subscribers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('unsubscribe_token', token)
      .select()
      .single()

    if (error || !data) {
      return new Response(htmlPage('Not Found', 'Subscriber not found or already unsubscribed.'), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return new Response(
      htmlPage('Unsubscribed', 'You have been successfully unsubscribed. Sorry to see you go!'),
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (error) {
    console.error('Unsubscribe error:', error)
    return new Response(htmlPage('Error', 'Something went wrong. Please try again.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

function htmlPage(title: string, message: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} - SERGIK</title></head>
<body style="font-family: -apple-system, sans-serif; background: #0a0a0a; color: #ddd; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 400px; padding: 40px;">
    <h1 style="color: #fff; font-size: 24px;">${title}</h1>
    <p style="color: #aaa;">${message}</p>
    <a href="/" style="color: #9333ea; text-decoration: none;">Back to SERGIK</a>
  </div>
</body>
</html>`
}
