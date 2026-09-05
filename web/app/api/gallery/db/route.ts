import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getServerSession } from '@/lib/auth'
import { supabaseIsReachable, supabaseUnavailableResponse } from '@/lib/supabaseReachability'

export const dynamic = 'force-dynamic'

// Cache gallery images for 10 minutes to reduce database load
export const revalidate = 600

/**
 * GET /api/gallery/db
 * Fetch all gallery images from Supabase database (source of truth)
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await supabaseIsReachable())) {
      return supabaseUnavailableResponse('Gallery database is temporarily unavailable')
    }

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const activeOnly = searchParams.get('active_only') !== 'false' // Default to true

    let query = supabase
      .from('gallery_images')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })

    // Filter by category if provided
    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    // Filter by active status
    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch gallery images', details: error.message },
        { status: 500 }
      )
    }

    // Transform to match frontend format
    const images = (data || []).map((img) => ({
      id: img.image_id || img.id,
      src: img.storage_url || img.src,
      alt: img.alt,
      category: img.category,
      description: img.description || '',
      filename: img.filename,
      storage_url: img.storage_url,
      is_stored_in_supabase: img.is_stored_in_supabase,
      width: img.width,
      height: img.height,
      created_at: img.created_at,
      updated_at: img.updated_at,
    }))

    return NextResponse.json({ images })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/gallery/db
 * Create a new gallery image entry in Supabase database
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const {
      image_id,
      filename,
      src,
      alt,
      category,
      description,
      storage_url,
      storage_path,
      is_stored_in_supabase = false,
      width,
      height,
      size_bytes,
      mime_type,
      display_order,
      metadata,
    } = body

    // Validate required fields
    if (!image_id || !filename || !src || !alt || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: image_id, filename, src, alt, category' },
        { status: 400 }
      )
    }

    // Validate category
    const validCategories = ['portrait', 'performance', 'studio', 'landscape']
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('gallery_images')
      .insert({
        image_id,
        filename,
        src,
        alt,
        category,
        description: description || null,
        storage_url: storage_url || null,
        storage_path: storage_path || null,
        is_stored_in_supabase,
        width: width || null,
        height: height || null,
        size_bytes: size_bytes || null,
        mime_type: mime_type || null,
        display_order: display_order || 0,
        metadata: metadata || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to create gallery image', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      image: {
        id: data.image_id || data.id,
        src: data.storage_url || data.src,
        alt: data.alt,
        category: data.category,
        description: data.description,
        filename: data.filename,
      },
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/gallery/db
 * Update an existing gallery image entry
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const body = await request.json()

    const { id, image_id, ...updates } = body

    if (!id && !image_id) {
      return NextResponse.json(
        { error: 'Missing required field: id or image_id' },
        { status: 400 }
      )
    }

    // Validate category if provided
    if (updates.category) {
      const validCategories = ['portrait', 'performance', 'studio', 'landscape']
      if (!validCategories.includes(updates.category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Build update query
    const updateData: any = {}
    if (updates.alt !== undefined) updateData.alt = updates.alt
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.display_order !== undefined) updateData.display_order = updates.display_order
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active
    if (updates.src !== undefined) updateData.src = updates.src
    if (updates.storage_url !== undefined) updateData.storage_url = updates.storage_url
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata

    let query = supabase.from('gallery_images').update(updateData)

    // Use image_id if provided, otherwise use id (UUID)
    if (image_id) {
      query = query.eq('image_id', image_id)
    } else {
      query = query.eq('id', id)
    }

    const { data, error } = await query.select().single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to update gallery image', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      image: {
        id: data.image_id || data.id,
        src: data.storage_url || data.src,
        alt: data.alt,
        category: data.category,
        description: data.description,
        filename: data.filename,
      },
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/gallery/db
 * Delete a gallery image entry (soft delete by setting is_active = false, or hard delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await supabaseIsReachable())) return supabaseUnavailableResponse()

    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const image_id = searchParams.get('image_id')
    const hard_delete = searchParams.get('hard_delete') === 'true'

    if (!id && !image_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id or image_id' },
        { status: 400 }
      )
    }

    // Use image_id if provided, otherwise use id (UUID)
    let query: any = supabase.from('gallery_images')

    if (image_id) {
      query = query.eq('image_id', image_id)
    } else {
      query = query.eq('id', id)
    }

    if (hard_delete) {
      // Hard delete - permanently remove from database
      const { error } = await query.delete()
      if (error) {
        console.error('Database error:', error)
        return NextResponse.json(
          { error: 'Failed to delete gallery image', details: error.message },
          { status: 500 }
        )
      }
    } else {
      // Soft delete - set is_active = false
      const { error } = await query.update({ is_active: false })
      if (error) {
        console.error('Database error:', error)
        return NextResponse.json(
          { error: 'Failed to deactivate gallery image', details: error.message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
