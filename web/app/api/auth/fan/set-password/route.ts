import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionFromRequest } from '@/lib/auth/request-session'
import { markFanPasswordCredential } from '@/lib/fan-password-credential'

export const dynamic = 'force-dynamic'

function validPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }
  if (session.isAdmin) {
    return NextResponse.json({ error: 'Not available for admin accounts.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''

  if (!validPassword(password)) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }
  if (password !== passwordConfirm) {
    return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const token = request.cookies.get('sb-auth-token')?.value
  if (!supabaseUrl || !anon || !token) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await markFanPasswordCredential(session.user.id)

  return NextResponse.json({ ok: true })
}
