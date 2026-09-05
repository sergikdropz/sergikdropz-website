import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { listModelsForAdminProvider } from '@/lib/ai/admin-provider-models'
import { clearOllamaModelTagCache } from '@/lib/ai/ollama-model-resolve'
import type { AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import { ADMIN_AI_CHAT_PROVIDERS } from '@/lib/ai/admin-chat-types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = request.nextUrl.searchParams.get('provider')?.toLowerCase().trim()
  if (!raw || !(ADMIN_AI_CHAT_PROVIDERS as readonly string[]).includes(raw)) {
    return NextResponse.json(
      { error: 'provider query must be anthropic, openai, ollama, or crowelogic' },
      { status: 400 }
    )
  }

  const refresh = request.nextUrl.searchParams.get('refresh') === '1'
  if (refresh && raw === 'ollama') {
    clearOllamaModelTagCache()
  }

  const result = await listModelsForAdminProvider(raw as AdminAiChatProvider)
  return NextResponse.json({
    provider: raw,
    modelIds: result.modelIds.slice(0, 250),
    source: result.source,
    status: result.status,
    message: result.message,
    envDefaultModelId: result.envDefaultModelId,
    envDefaultPresent: result.envDefaultPresent,
  })
}
