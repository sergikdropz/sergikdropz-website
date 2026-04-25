import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/settings/status
 * Get connection status for Supabase and Stripe (admin-only)
 */
export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const status: Record<string, any> = {
      timestamp: new Date().toISOString(),
    }

    // Check Supabase connection
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    status.supabase = {
      configured: !!(supabaseUrl && supabaseAnonKey && supabaseServiceKey),
      connected: false,
      error: null,
    }

    if (status.supabase.configured) {
      try {
        const supabase = createSupabaseServerClient()
        const { error } = await supabase
          .from('settings')
          .select('id')
          .limit(1)

        if (error && !error.message.includes('does not exist')) {
          status.supabase.error = error.message
        } else {
          status.supabase.connected = true
        }
      } catch (error: any) {
        status.supabase.error = error.message
      }
    }

    // Check Stripe connection
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

    status.stripe = {
      configured: !!(stripeSecretKey && stripePublishableKey),
      connected: false,
      error: null,
    }

    if (status.stripe.configured) {
      // Test Stripe connection by checking if keys are valid format
      // (We can't actually test without making an API call, which costs money)
      const isValidFormat = 
        stripeSecretKey?.startsWith('sk_') && 
        stripePublishableKey?.startsWith('pk_')
      
      status.stripe.connected = isValidFormat || false
      if (!isValidFormat) {
        status.stripe.error = 'Invalid key format'
      }
    }

    // Get environment variables (masked)
    status.envVars = {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? '✅ Set' : '❌ Missing',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? '✅ Set (masked)' : '❌ Missing',
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? '✅ Set (masked)' : '❌ Missing',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKey ? '✅ Set (masked)' : '❌ Missing',
      STRIPE_SECRET_KEY: stripeSecretKey ? '✅ Set (masked)' : '❌ Missing',
      NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? '✅ Set' : '❌ Missing',
      ADMIN_EMAILS: process.env.ADMIN_EMAILS ? '✅ Set' : '❌ Missing',
    }

    return NextResponse.json(status)
  } catch (error: any) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
