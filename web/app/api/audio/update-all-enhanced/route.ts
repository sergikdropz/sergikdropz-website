import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

/**
 * Enhanced Sonic DNA Batch Update API
 * 
 * GET: Check status of tracks needing enhanced analysis
 * POST: Start batch update process
 */

// Check if track needs enhanced analysis
function needsEnhancedAnalysis(sonicDna: any): boolean {
  if (!sonicDna) return true
  
  const metadata = sonicDna._metadata
  if (!metadata) return true
  
  // Check agent version (2.1 = enhanced)
  if (metadata.agentVersion !== '2.1') return true
  
  // Check for enhanced analysis markers
  if (!metadata.enhancedAnalysis?.hasDrumPatternAnalysis) return true
  if (!metadata.enhancedAnalysis?.hasSubgenreClassification) return true
  if (!metadata.enhancedAnalysis?.hasTimingAnalysis) return true
  
  // Check for timing section
  if (!sonicDna.timing?.feel) return true
  
  // Check for advanced drum analysis
  if (!sonicDna.drums?.cadence || !sonicDna.drums?.timing) return true
  
  // Check for subgenre classification
  if (!sonicDna.genres?.subgenreClassification?.primary) return true
  
  return false
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    
    // Get all audio files with sonic DNA info
    const { data: audioFiles, error } = await supabase
      .from('audio_files')
      .select('id, title, sonic_dna, sonic_dna_status')
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Categorize tracks
    let needsUpdate = 0
    let enhanced = 0
    let processing = 0
    let failed = 0
    let noAnalysis = 0
    
    const needsUpdateList: { id: string; title: string }[] = []
    
    for (const track of (audioFiles || [])) {
      if (track.sonic_dna_status === 'processing') {
        processing++
      } else if (track.sonic_dna_status === 'failed') {
        failed++
      } else if (!track.sonic_dna) {
        noAnalysis++
        needsUpdate++
        needsUpdateList.push({ id: track.id, title: track.title })
      } else if (needsEnhancedAnalysis(track.sonic_dna)) {
        needsUpdate++
        needsUpdateList.push({ id: track.id, title: track.title })
      } else {
        enhanced++
      }
    }
    
    const total = audioFiles?.length || 0
    const progress = total > 0 ? ((enhanced / total) * 100).toFixed(1) : '0'
    
    return NextResponse.json({
      total,
      enhanced,
      needsUpdate,
      processing,
      failed,
      noAnalysis,
      progress: `${progress}%`,
      needsUpdateSample: needsUpdateList.slice(0, 10),
      version: '2.1',
      features: [
        'Advanced drum pattern analysis',
        'Half-time/full-time detection',
        'Extended subgenre classification (150+)',
        'Percussion cadence analysis',
        'Bassline style detection',
        'MusicBrainz integration'
      ]
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : null
    const batchSize = parseInt(searchParams.get('batchSize') || '3')
    
    const supabase = createSupabaseServerClient()
    
    // Get tracks that need updating
    let query = supabase
      .from('audio_files')
      .select('id, title, artist, file_path, file_url, sonic_dna, sonic_dna_status')
      .neq('sonic_dna_status', 'processing')
      .order('created_at', { ascending: false })
    
    if (limit) {
      query = query.limit(limit)
    }
    
    const { data: audioFiles, error } = await query
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Filter to tracks needing update
    const tracksToUpdate = (audioFiles || []).filter(track => 
      force || needsEnhancedAnalysis(track.sonic_dna)
    )
    
    if (tracksToUpdate.length === 0) {
      return NextResponse.json({
        status: 'complete',
        message: 'All tracks already have enhanced analysis',
        total: audioFiles?.length || 0,
        needsUpdate: 0
      })
    }
    
    // Mark tracks as processing
    const trackIds = tracksToUpdate.map(t => t.id)
    
    // Start processing in batches (background)
    processTracksInBackground(trackIds, batchSize, supabase).catch(console.error)
    
    return NextResponse.json({
      status: 'started',
      message: `Started enhanced analysis for ${tracksToUpdate.length} tracks`,
      total: tracksToUpdate.length,
      batchSize,
      force,
      tracks: tracksToUpdate.slice(0, 10).map(t => ({ id: t.id, title: t.title }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function processTracksInBackground(trackIds: string[], batchSize: number, supabase: any) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  
  for (let i = 0; i < trackIds.length; i += batchSize) {
    const batch = trackIds.slice(i, i + batchSize)
    
    // Process batch in parallel
    const promises = batch.map(async (trackId) => {
      try {
        // Get track info
        const { data: track } = await supabase
          .from('audio_files')
          .select('file_path, file_url')
          .eq('id', trackId)
          .single()
        
        if (!track) return
        
        const path = track.file_path || track.file_url
        if (!path) return
        
        // Trigger analysis
        await fetch(`${siteUrl}/api/audio/sonic-dna?path=${encodeURIComponent(path)}&force=true`, {
          method: 'POST'
        })
      } catch (err) {
        console.error(`Error processing track ${trackId}:`, err)
      }
    })
    
    await Promise.all(promises)
    
    // Wait between batches
    if (i + batchSize < trackIds.length) {
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}
