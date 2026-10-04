/**
 * primaryGoal for strategy tools when the payload omitted it.
 * The open release and sticky thread goal already answer that field.
 */

export type KnownGoalContext = {
  goal?: string | null
  releaseTitle?: string | null
  activeStep?: string | null
}

const STRATEGY_GOAL_TOOLS = new Set(['draft_product_strategy_pack', 'run_meta_promo_pipeline'])

export function goalFromKnownRelease(title: string, activeStep?: string | null): string {
  const name = title.trim()
  if (activeStep === 'launch') return `Launch support for "${name}"`
  if (activeStep === 'copy') return `Marketing copy for "${name}"`
  return `Ship "${name}"`
}

export function resolvePrimaryGoal(
  tool: string,
  payload: Record<string, unknown>,
  ctx?: KnownGoalContext | null
): string {
  const explicit = String(payload.primaryGoal ?? payload.primary_goal ?? payload.goal ?? '').trim()
  if (explicit) return explicit
  const sticky = String(ctx?.goal ?? '').trim()
  if (sticky) return sticky
  const title = String(payload.releaseTitle ?? payload.title ?? ctx?.releaseTitle ?? '').trim()
  if (!title || !STRATEGY_GOAL_TOOLS.has(tool)) return ''
  if (tool === 'run_meta_promo_pipeline') return `Meta promo for "${title}"`
  return goalFromKnownRelease(title, ctx?.activeStep)
}

/** Returns the same payload object when nothing needs to be added. */
export function applyKnownPrimaryGoal(
  tool: string,
  payload: Record<string, unknown>,
  ctx?: KnownGoalContext | null
): Record<string, unknown> {
  if (!STRATEGY_GOAL_TOOLS.has(tool)) return payload
  const goal = resolvePrimaryGoal(tool, payload, ctx)
  if (!goal) return payload
  if (String(payload.primaryGoal ?? '').trim() === goal) return payload
  return { ...payload, primaryGoal: goal }
}
