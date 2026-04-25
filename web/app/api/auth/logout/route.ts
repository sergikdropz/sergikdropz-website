import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseClient()
    
    // Sign out from Supabase
    await supabase.auth.signOut()

    // Clear the auth cookie
    const response = NextResponse.json({ success: true })
    response.cookies.delete('sb-auth-token')
    response.cookies.delete('sb-refresh-token')
    response.cookies.delete('sb-auth-remember')
    response.cookies.set('sb-auth-token', '', {
      maxAge: 0,
      path: '/',
    })
    response.cookies.set('sb-refresh-token', '', {
      maxAge: 0,
      path: '/',
    })
    response.cookies.set('sb-auth-remember', '', {
      maxAge: 0,
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Also support GET for logout
  return POST(request)
}
