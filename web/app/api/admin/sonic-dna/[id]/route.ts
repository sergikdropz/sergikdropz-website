import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'

/**
 * GET - Fetch Sonic DNA for a specific track
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Handle both Promise and direct params (for Next.js 13+ compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const trackId = resolvedParams.id

    if (!trackId) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('audio_files')
      .select('id, title, artist, sonic_dna, bpm, key_signature, energy_level, file_url, file_path, file_name')
      .eq('id', trackId)
      .single()

    if (error) {
      console.error('Error fetching track:', error)
      // If track not found, return 404 instead of 500
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Track not found' }, { status: 404 })
      }
      return NextResponse.json(
        { error: error.message || 'Failed to fetch track' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    return NextResponse.json({ track: data })
  } catch (error: any) {
    console.error('Unexpected error in GET /api/admin/sonic-dna/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Update Sonic DNA for a specific track
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Handle both Promise and direct params (for Next.js 13+ compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const trackId = resolvedParams.id

    if (!trackId) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { sonic_dna, updates } = body

    const supabase = createSupabaseServerClient()

    // If full sonic_dna object provided, replace it
    if (sonic_dna) {
      const { error } = await supabase
        .from('audio_files')
        .update({
          sonic_dna,
          sonic_dna_analyzed_at: new Date().toISOString(),
        })
        .eq('id', trackId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Sonic DNA updated' })
    }

    // If partial updates provided, merge with existing
    if (updates) {
      // Get current Sonic DNA
      const { data: currentTrack, error: fetchError } = await supabase
        .from('audio_files')
        .select('sonic_dna')
        .eq('id', trackId)
        .single()

      if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 })
      }

      // Deep merge updates into existing Sonic DNA
      const currentDNA = currentTrack?.sonic_dna || {}
      const mergedDNA = deepMerge(currentDNA, updates)

      // Also update top-level fields if provided
      const updateData: any = {
        sonic_dna: mergedDNA,
        sonic_dna_analyzed_at: new Date().toISOString(),
      }

      // Update BPM if in technical section
      if (updates.technical?.bpm !== undefined) {
        updateData.bpm = updates.technical.bpm
      }

      // Update key if in harmony section
      if (updates.harmony?.keySignature !== undefined) {
        updateData.key_signature = updates.harmony.keySignature
      }

      // Update energy level if in technical section
      if (updates.technical?.energyLevel !== undefined) {
        updateData.energy_level = updates.technical.energyLevel
      }

      const { error: updateError } = await supabase
        .from('audio_files')
        .update(updateData)
        .eq('id', trackId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Sonic DNA updated',
        sonic_dna: mergedDNA,
      })
    }

    return NextResponse.json(
      { error: 'No updates provided' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Unexpected error in PATCH /api/admin/sonic-dna/[id]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Deep merge utility function
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target }
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }
  return output
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item)
}
