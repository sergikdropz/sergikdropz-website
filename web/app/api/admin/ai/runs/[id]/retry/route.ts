import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    const { id } = params

    const { data: run, error: runError } = await supabase
      .from('ai_runs')
      .select('id, prompt, request_type, status')
      .eq('id', id)
      .eq('admin_id', session.user.id)
      .maybeSingle()

    if (runError || !run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const { data: created, error: createError } = await supabase
      .from('ai_runs')
      .insert({
        admin_id: session.user.id,
        request_type: run.request_type,
        prompt: run.prompt,
        status: 'pending',
        response: { retry_of: run.id },
      })
      .select('id')
      .single()

    if (createError || !created) {
      return NextResponse.json({ error: createError?.message || 'Failed to create retry run' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Retry run queued. Re-run from the assistant using the same prompt.',
      retryRunId: created.id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
