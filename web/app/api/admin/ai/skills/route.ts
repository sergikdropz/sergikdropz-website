import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { getAllSkills } from '@/lib/ai/skills/registry'
import { getGloballyDisabledAdminAiTools, isAdminAiToolExecutionEnabled, isAllowedTool } from '@/lib/admin-ai'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const skills = getAllSkills().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    purpose: skill.purpose,
    requiredContext: skill.requiredContext,
    allowedTools: skill.allowedTools.filter(
      (toolName) => isAllowedTool(toolName) && isAdminAiToolExecutionEnabled(toolName)
    ),
    riskTier: skill.riskTier,
    confidenceRules: skill.confidenceRules,
    inputSchema: skill.inputSchema ?? null,
  }))

  return NextResponse.json({
    skills,
    disabledTools: getGloballyDisabledAdminAiTools(),
  })
}
