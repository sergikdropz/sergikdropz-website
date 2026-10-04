import { describe, expect, it } from 'vitest'
import {
  buildPlatformGrowthContextPrompt,
  buildPlatformGrowthToolOutput,
  isGrowthDeskIntent,
  loadPlatformGrowthSnapshot,
} from '@/lib/ai/platform-growth-snapshot'
import { buildIntentPlan } from '@/lib/ai/planner'
import { buildPlanGraphForIntent } from '@/lib/ai/orchestrator'
import { getSkillById, inferSkillFromIntent } from '@/lib/ai/skills/registry'
import { TOOL_POLICY } from '@/lib/ai/tool-policy'
import { resolvePlaybooksForContext } from '@/lib/admin-ai-playbooks'

describe('platform growth snapshot', () => {
  it('loads scorecard JSON from knowledge/generated', () => {
    const { data, error } = loadPlatformGrowthSnapshot()
    expect(error).toBeUndefined()
    expect(data?.scorecard.spotifyMonthlyListeners).toBe(55)
    expect(data?.scorecard.spotifyMarqueeEligible).toBe(false)
    expect(data?.thresholds.deferMarqueeUntilMonthlyListeners).toBe(1000)
  })

  it('builds tool output with weekly scorecard keys', () => {
    const out = buildPlatformGrowthToolOutput({ dryRun: true })
    expect(out.ok).toBe(true)
    expect(out.dryRun).toBe(true)
    expect(Array.isArray(out.weeklyScorecardKeys)).toBe(true)
    expect((out.weeklyScorecardKeys as string[]).includes('spotifyMonthlyListeners')).toBe(true)
  })

  it('builds a compact context prompt that forbids inventing analytics', () => {
    const prompt = buildPlatformGrowthContextPrompt()
    expect(prompt).toBeTruthy()
    expect(prompt!).toMatch(/PLATFORM GROWTH SNAPSHOT/)
    expect(prompt!.toLowerCase()).toContain('never invent')
    expect(prompt!).toContain('55')
  })

  it('detects growth desk intents', () => {
    expect(isGrowthDeskIntent('How do we grow Spotify?')).toBe(true)
    expect(isGrowthDeskIntent('Should we buy Marquee?')).toBe(true)
    expect(isGrowthDeskIntent('Update the copyright checklist')).toBe(false)
  })
})

describe('growth marketing skill wiring', () => {
  it('registers query_platform_growth_snapshot in tool policy', () => {
    expect(TOOL_POLICY.query_platform_growth_snapshot.writeSideEffect).toBe(false)
    expect(TOOL_POLICY.query_platform_growth_snapshot.requiresApproval).toBe(true)
  })

  it('exposes snapshot + browser + campaign tools on growth_marketing', () => {
    const skill = getSkillById('growth_marketing')
    expect(skill?.allowedTools).toEqual(
      expect.arrayContaining([
        'query_platform_growth_snapshot',
        'admin_browser',
        'generate_campaign_draft',
        'generate_smartlink_utm_plan',
      ])
    )
  })

  it('routes grow Spotify to growth_marketing and recommends snapshot tool', () => {
    expect(inferSkillFromIntent('How do we grow Spotify monthly listeners?').id).toBe('growth_marketing')
    const plan = buildIntentPlan('How do we grow Spotify monthly listeners?')
    expect(plan.skill?.id).toBe('growth_marketing')
    expect(plan.recommendedTool).toBe('query_platform_growth_snapshot')
  })

  it('plans Growth Board as multi-step snapshot → browser → campaign', () => {
    const graph = buildPlanGraphForIntent('Run the weekly growth board')
    const tools = graph.steps.map((s) => s.tool)
    expect(tools[0]).toBe('query_platform_growth_snapshot')
    expect(tools).toContain('admin_browser')
    expect(tools).toContain('generate_campaign_draft')
  })

  it('includes Weekly Growth Board playbook without a release', () => {
    const books = resolvePlaybooksForContext(null)
    expect(books.some((b) => b.id === 'playbook-growth-board')).toBe(true)
    const board = books.find((b) => b.id === 'playbook-growth-board')!
    expect(board.skillId).toBe('growth_marketing')
    expect(board.steps[0]?.tool).toBe('query_platform_growth_snapshot')
  })
})
