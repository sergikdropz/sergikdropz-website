import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase'
import { loadAdminAiChatPreferences, type AdminAiAssistantLlmChoice } from '@/lib/ai/admin-ai-chat-preferences'
import { listAdminChatProvidersStatus, resolveDefaultAdminChatProvider } from '@/lib/ai/admin-chat-providers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let assistantDefaultLlm: AdminAiAssistantLlmChoice = 'auto'
  try {
    const supabase = createSupabaseServerClient()
    const prefs = await loadAdminAiChatPreferences(supabase)
    assistantDefaultLlm = prefs.assistantDefaultLlm
  } catch {
    assistantDefaultLlm = 'auto'
  }

  return NextResponse.json({
    defaultProvider: resolveDefaultAdminChatProvider(),
    providers: listAdminChatProvidersStatus(),
    assistantDefaultLlm,
  })
}
