import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const store = String(body.store || '').trim()
    const url = String(body.url || '').trim()
    if (!store || !url) {
      return NextResponse.json({ error: 'store and url are required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const id = `${params.id}-${store}-${Date.now()}`

    const { data, error } = await supabase
      .from('distribution_store_links')
      .insert({
        id,
        release_id: params.id,
        store,
        url,
        verified_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ link: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add store link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const linkId = searchParams.get('linkId')
    if (!linkId) {
      return NextResponse.json({ error: 'linkId is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    const { error } = await supabase
      .from('distribution_store_links')
      .delete()
      .eq('id', linkId)
      .eq('release_id', params.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete store link'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
