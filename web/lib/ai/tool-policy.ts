/**
 * Tool execution policy extracted from admin-ai.ts.
 * Keeps Preview → Approve as the mandatory write path for operational tools.
 */

export type AdminAiTool =
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

export type ToolRiskTier = 'tier_1_draft' | 'tier_2_operational'

export type ToolPolicy = {
  riskTier: ToolRiskTier
  requiresApproval: boolean
  /** When true, dry-run/preview is mandatory before apply. */
  writeSideEffect: boolean
}

export const TOOL_POLICY: Record<AdminAiTool, ToolPolicy> = {
  create_release_checklist: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
  draft_product_strategy_pack: { riskTier: 'tier_1_draft', requiresApproval: true, writeSideEffect: false },
  generate_campaign_draft: { riskTier: 'tier_1_draft', requiresApproval: true, writeSideEffect: true },
  generate_smartlink_utm_plan: { riskTier: 'tier_1_draft', requiresApproval: true, writeSideEffect: true },
  run_playwright_e2e: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
  run_applescript: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
  query_ops_snapshot: { riskTier: 'tier_1_draft', requiresApproval: true, writeSideEffect: false },
  query_release_studio_snapshot: { riskTier: 'tier_1_draft', requiresApproval: true, writeSideEffect: false },
  query_studio_command_center: { riskTier: 'tier_1_draft', requiresApproval: true, writeSideEffect: false },
  patch_release_marketing_copy: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
  update_copyright_checklist: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
  assign_isrcs: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
  create_distribution_release_draft: { riskTier: 'tier_2_operational', requiresApproval: true, writeSideEffect: true },
}

export function isAllowedTool(value: string): value is AdminAiTool {
  return value in TOOL_POLICY
}

function parseGloballyDisabledAdminAiTools(): Set<AdminAiTool> {
  const disabled = new Set<AdminAiTool>()
  const raw = (process.env.ADMIN_AI_DISABLED_TOOLS || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  for (const name of raw) {
    if (name in TOOL_POLICY) disabled.add(name as AdminAiTool)
  }
  return disabled
}

export function isAdminAiToolExecutionEnabled(tool: AdminAiTool): boolean {
  return !parseGloballyDisabledAdminAiTools().has(tool)
}

export function getGloballyDisabledAdminAiTools(): AdminAiTool[] {
  const disabled = parseGloballyDisabledAdminAiTools()
  return (Object.keys(TOOL_POLICY) as AdminAiTool[]).filter((tool) => disabled.has(tool))
}
