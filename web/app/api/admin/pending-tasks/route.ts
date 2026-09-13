import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      {
        tracksNeedingAnalysis: 0,
        releasesPendingDistribution: 0,
        failedUploads: 0,
        warning: 'Supabase environment variables are not configured.',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }

  const supabase = createSupabaseServerClient()

  let tracksNeedingAnalysis = 0
  let releasesPendingDistribution = 0
  let failedUploads = 0

  try {
    const { count } = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .or('analysis_status.eq.pending,sonic_dna_status.eq.pending')
    tracksNeedingAnalysis = count || 0
  } catch (error) {
    console.error('Pending tasks: tracks needing analysis query failed', error)
  }

  try {
    const { count } = await supabase
      .from('distribution_releases')
      .select('id', { count: 'exact', head: true })
      .in('distributor_status', ['draft', 'submitted', 'delivered', 'error'])
    releasesPendingDistribution = count || 0
  } catch (error) {
    console.error('Pending tasks: releases query failed', error)
  }

  try {
    const { count } = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .or('analysis_status.eq.failed,sonic_dna_status.eq.failed')
    failedUploads = count || 0
  } catch (error) {
    console.error('Pending tasks: failed uploads query failed', error)
  }

  return NextResponse.json(
    {
      tracksNeedingAnalysis,
      releasesPendingDistribution,
      failedUploads,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
