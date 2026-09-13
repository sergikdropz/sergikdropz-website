import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { inferSkillFromIntent } from '@/lib/ai/skills/registry'
import { explainAutoRoute } from '@/lib/ai/admin-chat-router'
import { resolveDefaultAdminChatProvider, listAdminChatProvidersStatus } from '@/lib/ai/admin-chat-providers'
import { ADMIN_AI_CHAT_PROVIDERS, type AdminAiChatProvider } from '@/lib/ai/admin-chat-types'
import { pickSmartChatModelId } from '@/lib/ai/admin-smart-model-picker'

export const dynamic = 'force-dynamic'

function buildEnvOrderPreview(): { providerOrder: AdminAiChatProvider[]; fallback: AdminAiChatProvider | null } {
  const fallback = resolveDefaultAdminChatProvider()
  const order: AdminAiChatProvider[] = []
  if (fallback) order.push(fallback)
  for (const p of ADMIN_AI_CHAT_PROVIDERS) {
    if (!order.includes(p)) order.push(p)
  }
  return { providerOrder: order, fallback }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { message?: string }
  const message = body.message?.trim() || 'Help me plan a release campaign for next month.'
  const skill = inferSkillFromIntent(message)
  const smart = explainAutoRoute(message, skill)
  const envOrder = buildEnvOrderPreview()
  const smartModelPicks = Object.fromEntries(
    ADMIN_AI_CHAT_PROVIDERS.map((p) => [p, pickSmartChatModelId(p, message, skill)])
  ) as Record<AdminAiChatProvider, string>

  return NextResponse.json({
    messageSample: message,
    inferredSkill: {
      id: skill.id,
      name: skill.name,
      riskTier: skill.riskTier,
    },
    smart: smart,
    envOrderPreview: envOrder,
    smartModelPicks,
    providersConfigured: listAdminChatProvidersStatus(),
  })
}
