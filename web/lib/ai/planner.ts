import { getSkillById, getSkillByTool, inferSkillFromIntent } from '@/lib/ai/skills/registry'

export type PlannerTool =
  | 'create_release_checklist'
  | 'draft_product_strategy_pack'
  | 'generate_campaign_draft'
  | 'generate_smartlink_utm_plan'
  | 'run_playwright_e2e'
  | 'run_applescript'
  | 'query_ops_snapshot'
  | 'query_release_studio_snapshot'
  | 'query_studio_command_center'
  | 'patch_release_marketing_copy'
  | 'update_copyright_checklist'
  | 'assign_isrcs'
  | 'create_distribution_release_draft'

export type ExecutionPlan = {
  skill: {
    id: string
    name: string
    description: string
    riskTier: string
  } | null
  tool: PlannerTool
  canExecute: boolean
  missingRequiredFields: string[]
  suggestedPayload: Record<string, unknown>
}

function placeholderForType(type: 'string' | 'number' | 'boolean' | 'object' | 'array') {
  if (type === 'number') return 0
  if (type === 'boolean') return false
  if (type === 'array') return []
  if (type === 'object') return {}
  return 'TBD'
}

export function buildExecutionPlan(tool: PlannerTool, payload: Record<string, unknown>): ExecutionPlan {
  const skill = getSkillByTool(tool)
  const schema = skill?.inputSchema ?? {}
  const suggestedPayload: Record<string, unknown> = { ...payload }

  for (const [field, config] of Object.entries(schema)) {
    if (suggestedPayload[field] === undefined || suggestedPayload[field] === null) {
      suggestedPayload[field] = placeholderForType(config.type)
    }
  }

  const missingRequiredFields = Object.entries(schema)
    .filter(([, config]) => Boolean(config.required))
    .map(([field]) => field)
    .filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '')

  return {
    skill: skill
      ? {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          riskTier: skill.riskTier,
        }
      : null,
    tool,
    canExecute: missingRequiredFields.length === 0,
    missingRequiredFields,
    suggestedPayload,
  }
}

export function buildIntentPlan(
  message: string,
  options?: {
    /** When set, use this admin skill for planning instead of inferring from the message. */
    skillId?: string
  }
) {
  const skill =
    (options?.skillId && getSkillById(options.skillId)) || inferSkillFromIntent(message)
  const recommendedTool = (skill.allowedTools[0] ?? null) as PlannerTool | null
  return {
    skill: {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      riskTier: skill.riskTier,
    },
    recommendedTool,
    confidenceRules: skill.confidenceRules,
    requiredContext: skill.requiredContext,
  }
}
