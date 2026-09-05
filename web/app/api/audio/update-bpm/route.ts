import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminApi } from '@/lib/auth/route-policy'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Update BPM for a track in the database
 * POST /api/audio/update-bpm
 * Body: { trackId: string, bpm: number }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminApi()
    if (!auth.ok) return auth.response
    const { trackId, bpm } = await request.json()

    if (!trackId) {
      return NextResponse.json(
        { error: 'Track ID is required' },
        { status: 400 }
      )
    }

    if (bpm === undefined || bpm === null) {
      return NextResponse.json(
        { error: 'BPM value is required' },
        { status: 400 }
      )
    }

    // Validate BPM range
    const bpmValue = parseInt(bpm)
    if (isNaN(bpmValue) || bpmValue < 30 || bpmValue > 300) {
      return NextResponse.json(
        { error: 'BPM must be between 30 and 300' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get current track to preserve original_bpm if not set
    // Try to select original_bpm, but handle gracefully if column doesn't exist yet
    const { data: currentTrack, error: fetchError } = await supabase
      .from('audio_files')
      .select('bpm, original_bpm')
      .eq('id', trackId)
      .single()

    if (fetchError) {
      // If error is about missing column, continue without original_bpm
      if (fetchError.message.includes('original_bpm') || fetchError.message.includes('column')) {
        console.warn('original_bpm column not found, continuing without it:', fetchError.message)
        // Fetch just bpm
        const { data: trackData } = await supabase
          .from('audio_files')
          .select('bpm')
          .eq('id', trackId)
          .single()
        
        if (!trackData) {
          return NextResponse.json(
            { error: `Track not found` },
            { status: 404 }
          )
        }
        
        // Prepare update data without original_bpm
        const updateData: any = {
          bpm: bpmValue,
          updated_at: new Date().toISOString()
        }
        
        // Update the track
        const { data, error } = await supabase
          .from('audio_files')
          .update(updateData)
          .eq('id', trackId)
          .select('id, bpm')

        if (error) {
          console.error('Error updating BPM:', error)
          return NextResponse.json(
            { error: `Failed to update BPM: ${error.message}` },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          data: {
            id: data[0].id,
            bpm: data[0].bpm,
            message: 'BPM updated. Run migration to enable original_bpm tracking.'
          }
        })
      }
      
      return NextResponse.json(
        { error: `Track not found: ${fetchError.message}` },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData: any = {
      bpm: bpmValue,
      updated_at: new Date().toISOString()
    }

    // Set original_bpm if it's not already set (first time detection)
    if (currentTrack && !currentTrack.original_bpm) {
      updateData.original_bpm = bpmValue
    }

    // Update the track
    // Try to select original_bpm, but handle gracefully if column doesn't exist
    let selectFields = 'id, bpm'
    try {
      // Check if original_bpm column exists by trying to select it
      const { error: testError } = await supabase
        .from('audio_files')
        .select('original_bpm')
        .limit(1)
      
      if (!testError) {
        selectFields = 'id, bpm, original_bpm'
      }
    } catch (e) {
      // Column doesn't exist, continue without it
    }
    
    const { data, error } = await supabase
      .from('audio_files')
      .update(updateData)
      .eq('id', trackId)
      .select(selectFields)

    if (error) {
      console.error('Error updating BPM:', error)
      return NextResponse.json(
        { error: `Failed to update BPM: ${error.message}` },
        { status: 500 }
      )
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'Track not found after update' },
        { status: 404 }
      )
    }

    const updatedTrack = data[0] as unknown as { id: string; bpm: number; original_bpm?: number | null }

    // If Sonic DNA exists, update the technical.bpm field
    const { data: trackWithSonicDNA } = await supabase
      .from('audio_files')
      .select('sonic_dna')
      .eq('id', trackId)
      .single()

    if (trackWithSonicDNA?.sonic_dna) {
      const root = trackWithSonicDNA.sonic_dna as Record<string, unknown>
      const updatedSonicDNA: Record<string, unknown> = {
        ...root,
        technical: {
          ...((root.technical as Record<string, unknown>) || {}),
          bpm: bpmValue,
        },
      }
      if (root.measured && typeof root.measured === 'object') {
        updatedSonicDNA.measured = { ...(root.measured as object), bpm: bpmValue }
      }
      const comprehensive = root.comprehensive
      if (comprehensive && typeof comprehensive === 'object') {
        const comp = { ...(comprehensive as Record<string, unknown>) }
        if (comp.measured && typeof comp.measured === 'object') {
          comp.measured = { ...(comp.measured as object), bpm: bpmValue }
        }
        updatedSonicDNA.comprehensive = comp
      }

      await supabase
        .from('audio_files')
        .update({
          sonic_dna: updatedSonicDNA,
        })
        .eq('id', trackId)
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updatedTrack.id,
        bpm: updatedTrack.bpm,
        original_bpm: updatedTrack.original_bpm || null
      }
    })
  } catch (error: any) {
    console.error('Error in update-bpm route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

