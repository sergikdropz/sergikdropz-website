import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession()
  if (!session || !session.isAdmin) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true as const }
}

/**
 * GET /api/admin/purchases
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const customerEmail = searchParams.get('customer_email')
    const trackId = searchParams.get('track_id')
    const productType = searchParams.get('product_type')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const supabase = createSupabaseServerClient()

    let query = supabase
      .from('purchases')
      .select('*', { count: 'exact' })
      .order('purchased_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (customerEmail) {
      query = query.ilike('customer_email', `%${customerEmail}%`)
    }

    if (trackId) {
      query = query.eq('track_id', trackId)
    }

    if (productType) {
      query = query.eq('product_type', productType)
    }

    if (startDate) {
      query = query.gte('purchased_at', startDate)
    }

    if (endDate) {
      query = query.lte('purchased_at', endDate)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching purchases:', error)
      return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 })
    }

    return NextResponse.json({
      purchases: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error: any) {
    console.error('Purchases API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/purchases — manually create a purchase record
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const {
      track_id,
      track_title,
      format,
      product_type,
      customer_email,
      customer_name,
      amount_paid,
      currency,
      purchased_at,
      stripe_session_id,
      license_tier,
      file_url,
      notes,
    } = body

    if (!product_type) {
      return NextResponse.json({ error: 'product_type is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { data, error } = await supabase
      .from('purchases')
      .insert({
        stripe_session_id: stripe_session_id || `manual_${Date.now()}`,
        track_id: track_id || null,
        track_title: track_title || null,
        format: format || 'N/A',
        product_type,
        customer_email: customer_email || null,
        customer_name: customer_name || null,
        amount_paid: amount_paid != null ? Math.round(Number(amount_paid) * 100) : 0,
        currency: currency || 'usd',
        purchased_at: purchased_at || new Date().toISOString(),
        license_tier: license_tier || null,
        file_url: file_url || '',
        download_count: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating purchase:', error)
      return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 })
    }

    return NextResponse.json({ purchase: data }, { status: 201 })
  } catch (error: any) {
    console.error('Create purchase error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/purchases — update an existing purchase
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Purchase id is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const allowedFields: Record<string, boolean> = {
      track_id: true,
      track_title: true,
      format: true,
      product_type: true,
      customer_email: true,
      customer_name: true,
      amount_paid: true,
      currency: true,
      purchased_at: true,
      stripe_session_id: true,
      license_tier: true,
      file_url: true,
      download_count: true,
      notes: true,
    }

    const sanitized: Record<string, any> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields[key]) {
        if (key === 'amount_paid' && value != null) {
          sanitized[key] = Math.round(Number(value) * 100)
        } else {
          sanitized[key] = value
        }
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('purchases')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating purchase:', error)
      return NextResponse.json({ error: 'Failed to update purchase' }, { status: 500 })
    }

    return NextResponse.json({ purchase: data })
  } catch (error: any) {
    console.error('Update purchase error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/purchases — delete a purchase record
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Purchase id is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    const { error } = await supabase
      .from('purchases')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting purchase:', error)
      return NextResponse.json({ error: 'Failed to delete purchase' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete purchase error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
