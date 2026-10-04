/**
 * Canonical skill that owns a tool's input schema.
 * A skill may still list another owner's tool in allowedTools so the agent can call it.
 * Schema checks must use this map, not the first allowedTools match.
 */
export const TOOL_SKILL_ID = {
  create_release_checklist: 'release_ops',
  draft_product_strategy_pack: 'product_strategy',
  generate_campaign_draft: 'growth_marketing',
  generate_smartlink_utm_plan: 'smartlink_seo',
  query_platform_growth_snapshot: 'growth_marketing',
  admin_browser: 'growth_marketing',
  run_playwright_e2e: 'e2e_qa',
  run_applescript: 'mac_automation',
  query_ops_snapshot: 'admin_intel',
  query_intelligence_harness: 'sergik_intelligence',
  query_sergikai_chat: 'sergik_intelligence',
  query_crowe_creative: 'sergik_intelligence',
  query_release_studio_snapshot: 'studio_release',
  query_studio_command_center: 'studio_release',
  patch_release_marketing_copy: 'studio_release',
  update_copyright_checklist: 'studio_release',
  assign_isrcs: 'studio_release',
  create_distribution_release_draft: 'studio_release',
  audit_music_contract: 'music_business_counsel',
  run_meta_promo_pipeline: 'product_strategy',
} as const

export type ToolSkillId = (typeof TOOL_SKILL_ID)[keyof typeof TOOL_SKILL_ID]

export function skillIdForTool(toolName: string): ToolSkillId | null {
  if (toolName in TOOL_SKILL_ID) return TOOL_SKILL_ID[toolName as keyof typeof TOOL_SKILL_ID]
  return null
}
