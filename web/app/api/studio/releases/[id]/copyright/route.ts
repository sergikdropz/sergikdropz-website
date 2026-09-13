import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getSingleReleaseCopyrightReadiness } from '@/lib/studio/copyright-pipeline'

const ALLOWED_FIELDS = [
  'rights_intake_complete',
  'legal_locked',
  'composition_registered',
  'master_registered',
  'pro_registered',
  'monitoring_enabled',
  'owner_name',
  'role_queue',
  'split_sheet_status',
  'producer_agreement_status',
  'sample_clearance_status',
  'due_date',
] as const

type AllowedField = (typeof ALLOWED_FIELDS)[number]

function pickAllowedFields(body: Record<string, unknown>) {
  const updates: Partial<Record<AllowedField, boolean | string>> = {}
  for (const field of ALLOWED_FIELDS) {
    if (typeof body[field] === 'boolean') {
      updates[field] = body[field] as boolean
    }
    if (
      (field === 'owner_name' ||
        field === 'role_queue' ||
        field === 'split_sheet_status' ||
        field === 'producer_agreement_status' ||
        field === 'sample_clearance_status' ||
        field === 'due_date') &&
      typeof body[field] === 'string'
    ) {
      updates[field] = body[field] as string
    }
  }
  return updates
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)

    return NextResponse.json({ readiness })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch copyright readiness' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const updates = pickAllowedFields(body || {})
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid checklist fields provided' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('release_copyright_checklists').upsert(
      {
        release_id: params.id,
        ...updates,
      },
      { onConflict: 'release_id' }
    )

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to update copyright checklist' },
        { status: 500 }
      )
    }

    const readiness = await getSingleReleaseCopyrightReadiness(supabase, params.id)
    return NextResponse.json({ readiness })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update copyright checklist' },
      { status: 500 }
    )
  }
}
