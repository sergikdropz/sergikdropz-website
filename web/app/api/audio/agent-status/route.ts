/**
 * Agent Team Status API
 * Get performance metrics and status of the agent pipeline
 */

import { NextResponse } from 'next/server'
import { getPerformanceReport } from '@/utils/agentPerformanceMonitor'
import { createSupabaseServerClient } from '@/lib/supabase'
import { requireAdminApi } from '@/lib/auth/route-policy'

export const dynamic = 'force-dynamic'

/**
 * GET /api/audio/agent-status
 * 
 * Get agent team performance and status
 */
export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const performanceReport = getPerformanceReport()
    
    // Get database stats
    const supabase = createSupabaseServerClient()
    const { count: totalTracks } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
    
    const { count: processedCount } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
      .eq('sonic_dna_status', 'completed')
    
    const { count: processingCount } = await supabase
      .from('audio_files')
      .select('*', { count: 'exact', head: true })
      .eq('sonic_dna_status', 'processing')

    return NextResponse.json({
      status: 'operational',
      agentTeam: {
        totalAgents: 10,
        agents: [
          'Waveform Generator (The "Father")', // Highest priority - runs first
          'Technical Analyzer',
          'Harmony Analyst',
          'Intention Analyst',
          'Description Writer',
          'Drum Pattern Expert',
          'Genre Specialist',
          'Musicologist',
          'Cultural Analyst',
          'Emotional Psychologist'
        ],
        features: [
          'Automatic retry logic',
          'Quality checks',
          'Parallel processing',
          'Performance monitoring',
          'Intelligent caching'
        ]
      },
      performance: performanceReport,
      database: {
        totalTracks: totalTracks || 0,
        processed: processedCount || 0,
        processing: processingCount || 0,
        pending: (totalTracks || 0) - (processedCount || 0) - (processingCount || 0)
      },
      autoProcessing: {
        enabled: true,
        description: 'Automatically processes all uploaded tracks'
      }
    })
  } catch (error: any) {
    console.error('Agent status error:', error)
    return NextResponse.json(
      { error: 'Failed to get agent status', details: error.message },
      { status: 500 }
    )
  }
}

