/**
 * Held approval rows for the admin assistant.
 * A write is split into a preview row and a submit row. Only the submit row
 * may be executed for real.
 */

import { TOOL_POLICY, isAllowedTool, type AdminAiTool } from '@/lib/ai/tool-policy'

export type ApprovalRowPhase = 'preview' | 'submit'

export type ApprovalSourceStep = {
  id: string
  tool: string
  payload: Record<string, unknown>
  riskTier: string
}

export type ApprovalRow = {
  id: string
  sourceStepId: string
  tool: AdminAiTool
  payload: Record<string, unknown>
  riskTier: string
  phase: ApprovalRowPhase
  label: string
  detail: string
}

const TOOL_LABELS: Record<AdminAiTool, string> = {
  create_release_checklist: 'Release checklist',
  draft_product_strategy_pack: 'Strategy pack',
  generate_campaign_draft: 'Campaign draft',
  generate_smartlink_utm_plan: 'Smart link',
  run_playwright_e2e: 'Playwright check',
  run_applescript: 'Mac automation',
  query_ops_snapshot: 'Ops snapshot',
  query_release_studio_snapshot: 'Release snapshot',
  query_studio_command_center: 'Command center',
  patch_release_marketing_copy: 'Marketing copy',
  update_copyright_checklist: 'Copyright checklist',
  assign_isrcs: 'ISRC assignment',
  create_distribution_release_draft: 'Release draft',
  query_intelligence_harness: 'Intelligence harness',
  query_sergikai_chat: 'SergikAI chat',
  query_crowe_creative: 'Crowe Creative',
  audit_music_contract: 'Contract audit',
  run_meta_promo_pipeline: 'Meta promo',
  admin_browser: 'Browser',
  query_platform_growth_snapshot: 'Growth snapshot',
}

const DETAIL_KEYS = ['releaseId', 'action', 'title', 'releaseName', 'primaryGoal', 'focus', 'mode', 'query'] as const

/** True when this payload is allowed to write. Preview rows set dryRun and stay held. */
export function payloadSubmits(payload: Record<string, unknown> | undefined): boolean {
  return payload?.dryRun !== true
}

export function payloadWithoutDryRun(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload }
  delete next.dryRun
  return next
}

export function approvalRowDetail(payload: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of DETAIL_KEYS) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim().slice(0, 80)}`)
    }
  }
  return parts.join(' · ')
}

export function buildApprovalRows(steps: ApprovalSourceStep[]): ApprovalRow[] {
  const rows: ApprovalRow[] = []
  for (const step of steps) {
    if (!isAllowedTool(step.tool)) continue
    const tool = step.tool
    const name = TOOL_LABELS[tool]
    const writes = TOOL_POLICY[tool].writeSideEffect
    const stored = payloadWithoutDryRun(step.payload ?? {})
    if (!writes) {
      rows.push({
        id: step.id,
        sourceStepId: step.id,
        tool,
        payload: stored,
        riskTier: step.riskTier,
        phase: 'preview',
        label: name,
        detail: approvalRowDetail(stored),
      })
      continue
    }
    rows.push({
      id: `${step.id}:preview`,
      sourceStepId: step.id,
      tool,
      payload: { ...stored, dryRun: true },
      riskTier: step.riskTier,
      phase: 'preview',
      label: `${name} — preview`,
      detail: approvalRowDetail(stored),
    })
    rows.push({
      id: `${step.id}:submit`,
      sourceStepId: step.id,
      tool,
      payload: stored,
      riskTier: step.riskTier,
      phase: 'submit',
      label: `${name} — submit`,
      detail: approvalRowDetail(stored),
    })
  }
  return rows
}
