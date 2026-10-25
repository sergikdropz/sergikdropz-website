import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/route-policy'
import type { MetaBusinessAgentAction } from '@/lib/meta/business-agent'
import { runMetaBusinessAgent } from '@/lib/meta/business-agent-run'

export const dynamic = 'force-dynamic'

function actionFrom(value: unknown): MetaBusinessAgentAction {
  return value === 'test' || value === 'onboard' ? value : 'status'
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const result = await runMetaBusinessAgent({ action: 'status' })
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown
    message?: unknown
    conversationId?: unknown
  }
  const action = actionFrom(body.action)
  const result = await runMetaBusinessAgent({
    action,
    message: typeof body.message === 'string' ? body.message : '',
    conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
    allowOnboard: action === 'onboard',
  })
  return NextResponse.json(result)
}
