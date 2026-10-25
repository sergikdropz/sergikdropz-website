/**
 * Deterministic marketing / product strategy scaffolding for Admin AI.
 * No external APIs — safe to run offline; pairs with chat for narrative polish.
 */

export type StrategyFocus =
  | 'site_audit'
  | 'conversion'
  | 'seo'
  | 'campaign'
  | 'admin_config'

export type ProductStrategyPackParams = {
  brandName: string
  primaryGoal: string
  siteUrl: string | null
  timelineWeeks: number
  focusAreas: StrategyFocus[]
}

export type NormalizedProductStrategyPackInput = ProductStrategyPackParams & {
  refineWithLlm: boolean
}

const ALL_FOCUS: StrategyFocus[] = ['site_audit', 'conversion', 'seo', 'campaign', 'admin_config']

/** True only for real affirmatives. The string "false" stays off. */
export function parseRefineWithLlmFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value !== 'string') return false
  const text = value.trim().toLowerCase()
  return text === 'true' || text === '1' || text === 'yes' || text === 'on'
}

export function payloadWithoutStrategyPolish(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload }
  delete next.refineWithLlm
  delete next.refine_with_llm
  return next
}

/** The pack-polish switch wins over a flag left on an older payload. */
export function withStrategyPackPolish<T extends { tool: string; payload: Record<string, unknown> }>(
  steps: T[],
  prefer: boolean,
): T[] {
  return steps.map((step) => {
    if (step.tool !== 'draft_product_strategy_pack') return step
    const payload = payloadWithoutStrategyPolish(step.payload)
    if (prefer) payload.refineWithLlm = true
    return { ...step, payload }
  })
}

export type StrategyPackPolishMode = 'suggest' | 'auto' | 'always' | 'off'

const POLISH_CUE =
  /\bdraft_product_strategy_pack\b|strategy pack|site audit|go-to-market|campaign calendar|conversion workflow/i

/** True when a strategy-pack brief is the useful next step. Operational chats stay quiet. */
export function strategyPackPolishCue(input: {
  agentMode?: string | null
  planTools?: string[]
  texts?: string[]
}): boolean {
  if (input.agentMode === 'product_strategy') return true
  if (input.planTools?.includes('draft_product_strategy_pack')) return true
  return POLISH_CUE.test((input.texts ?? []).join('\n'))
}

export type StrategyPackPolishState = 'applied' | 'failed' | 'scaffold'

export function readStrategyPackPolish(output: Record<string, unknown> | null | undefined): {
  state: StrategyPackPolishState
  note: string
} | null {
  if (!output || typeof output !== 'object') return null
  const note = typeof output.refinementNote === 'string' ? output.refinementNote.trim() : ''
  if (output.refinementStatus === 'applied') {
    const meta = output.refinementMeta as { provider?: string | null } | undefined
    return {
      state: 'applied',
      note: note || (meta?.provider ? `Polished by ${meta.provider}.` : 'Editorial brief is on this preview.'),
    }
  }
  if (output.refinementStatus === 'failed') {
    return { state: 'failed', note: note || 'The model did not return a brief. Scaffold kept.' }
  }
  if (output.refinementStatus === 'skipped') {
    return { state: 'scaffold', note: note || 'Scaffold only.' }
  }
  if (typeof output.refinedMarkdown === 'string' && output.refinedMarkdown.trim()) {
    return { state: 'applied', note: 'Editorial brief is on this preview.' }
  }
  return null
}

function uniqFocus(areas: unknown): StrategyFocus[] {
  if (!Array.isArray(areas) || areas.length === 0) return ALL_FOCUS.slice()
  const set = new Set<StrategyFocus>()
  for (const a of areas) {
    const id = String(a).trim() as StrategyFocus
    if (ALL_FOCUS.includes(id)) set.add(id)
  }
  return set.size ? Array.from(set) : ALL_FOCUS.slice()
}

export function normalizeProductStrategyPackPayload(payload: Record<string, unknown>): NormalizedProductStrategyPackInput {
  const brandName = String(payload.brandName || payload.brand_name || 'SERGIK').trim() || 'SERGIK'
  const primaryGoal = String(payload.primaryGoal || payload.primary_goal || payload.goal || '').trim()
  const siteRaw = payload.siteUrl ?? payload.site_url ?? payload.url
  const siteUrl =
    siteRaw != null && String(siteRaw).trim()
      ? String(siteRaw).trim()
      : null
  let timelineWeeks = Number(payload.timelineWeeks ?? payload.timeline_weeks ?? 4)
  if (!Number.isFinite(timelineWeeks) || timelineWeeks < 1) timelineWeeks = 4
  if (timelineWeeks > 24) timelineWeeks = 24
  const focusAreas = uniqFocus(payload.focusAreas ?? payload.focus_areas)
  const refineWithLlm = parseRefineWithLlmFlag(payload.refineWithLlm ?? payload.refine_with_llm)
  return {
    brandName,
    primaryGoal: primaryGoal || 'Grow qualified traffic and conversions for the next release cycle',
    siteUrl,
    timelineWeeks,
    focusAreas,
    refineWithLlm,
  }
}

export function buildProductStrategyPack(params: ProductStrategyPackParams): Record<string, unknown> {
  const { brandName, primaryGoal, siteUrl, timelineWeeks, focusAreas } = params
  const urlLine = siteUrl ? `Primary URL: ${siteUrl}` : 'Primary URL: (paste production + staging links when auditing)'

  const siteAudit =
    focusAreas.includes('site_audit') ?
      {
        howToUse:
          'Paste screenshots or temporary review links in chat; this checklist scores clarity and conversion readiness.',
        stakeholderQuestions: [
          'What is the single primary conversion on each key page (save, follow, ticket, email)?',
          'Which analytics events prove that conversion today?',
          'What mobile breakpoints break hero clarity or CTA visibility?',
        ],
        capturePrompts: [
          'Home above-the-fold (desktop + mobile)',
          'Primary music / release hub',
          'Events or booking funnel',
          'Newsletter or fan capture flow',
          'Footer + legal + cookie/consent surfaces',
        ],
        heuristicChecklist: [
          { area: 'Positioning', checks: ['Headline states category + differentiation in <8 words', 'Social proof near first CTA'] },
          { area: 'Trust', checks: ['Contact path visible', 'Privacy/terms reachable from conversion paths'] },
          { area: 'Performance', checks: ['LCP hero not blocking interaction', 'No autoplay audio without gesture'] },
          { area: 'Accessibility', checks: ['Contrast on CTAs', 'Focus states on forms', 'Alt text on marketing imagery'] },
        ],
      }
    : null

  const conversionWorkflow =
    focusAreas.includes('conversion') ?
      {
        northStarMetric: `Primary lens: ${primaryGoal}`,
        funnel: [
          { stage: 'Awareness', objective: 'Earn attention with hook + proof', metricHint: 'CTR / reach-to-click' },
          { stage: 'Intent', objective: 'Explain offer + reduce doubt', metricHint: 'Time on page / scroll depth' },
          { stage: 'Action', objective: 'One obvious CTA per viewport', metricHint: 'Form starts / saves / follows' },
          { stage: 'Nurture', objective: 'Repeat touch via email + social retargeting', metricHint: 'Open rate / return visits' },
        ],
        landingPageTemplate: [
          { block: 'Hero', content: [`${brandName}: outcome-led headline`, 'Subhead with specificity (who / sound / proof)', 'Primary CTA + secondary micro-commit'] },
          { block: 'Proof', content: ['Streaming/embed credibility', 'Press quotes or playlist placements', 'Tour or recent milestones'] },
          { block: 'Offer', content: ['What they get now (track, ticket tier, list perk)', 'Deadline or scarcity only if real'] },
          { block: 'Objections', content: ['FAQ: shipping regions, ticket tiers, refund policy if merch/tickets'] },
          { block: 'Footer CTA', content: ['Repeat primary CTA', 'Socials + smart link'] },
        ],
        emailSequenceOutline: [
          { dayOffset: -7, subjectAngle: 'Tease — sonic cue + date', bodyGoals: ['Curiosity', 'Save-the-date CTA'] },
          { dayOffset: -3, subjectAngle: 'Proof — playlist / quote', bodyGoals: ['Credibility', 'Pre-save or RSVP'] },
          { dayOffset: 0, subjectAngle: 'Launch — link hub', bodyGoals: ['Single primary CTA', 'Share prompts'] },
          { dayOffset: 3, subjectAngle: 'Reminder — social proof', bodyGoals: ['Second chance CTA', 'UGC prompt'] },
        ],
      }
    : null

  const seoStrategy =
    focusAreas.includes('seo') ?
      {
        seedKeywordBuckets: [
          { bucket: 'Artist branded', examples: [`${brandName} music`, `${brandName} DJ`, `${brandName} official`] },
          { bucket: 'Genre + geo', examples: [`${brandName} techno`, `${brandName} live set`, 'club night [city] DJ'] },
          { bucket: 'Intent', examples: ['book DJ', 'stream link', 'tickets', 'download stems'] },
        ],
        contentBriefs: [
          {
            slugIdea: `/releases/[slug]-liner-notes`,
            intent: 'Capture long-tail around release story + credits',
            outline: ['Hook', 'Production notes', 'Credits + links', 'FAQ schema candidates'],
          },
          {
            slugIdea: `/events/[city-date]`,
            intent: 'Local discovery + calendar syndication',
            outline: ['Venue + ticket CTA', 'Set time', 'Parking/access FAQ'],
          },
          {
            slugIdea: '/studio-or-software-hub',
            intent: 'Commercial intent for DJ tooling',
            outline: ['Problem', 'Feature proof', 'Demo video embed policy', 'Pricing/comparison table'],
          },
        ],
        proposedSiteStructure: [
          { path: '/', role: 'Brand + primary conversion' },
          { path: '/music', role: 'Streaming hubs + smart links' },
          { path: '/events', role: 'Calendar + booking CTA' },
          { path: '/bio', role: 'E-E-A-T signals + press kit anchor' },
          { path: '/contact', role: 'Booking + partnership routing' },
        ],
        technicalNotes: [
          'Title/meta unique per template route; avoid duplicate listen-page URLs.',
          'Stable canonical for smart links pointing off-site.',
          'Structured data: MusicGroup + Event where applicable.',
        ],
      }
    : null

  const campaignBlueprint =
    focusAreas.includes('campaign') ?
      {
        launchChecklist: [
          'Freeze positioning line + 3 proof bullets',
          'UTM naming convention agreed (source/medium/campaign)',
          'Creative sizes listed per channel',
          'Compliance: rights cleared for promo clips',
          'Rollback plan if DSP date slips',
        ],
        socialCalendarScaffold: Array.from({ length: Math.min(timelineWeeks, 8) }, (_, w) => ({
          week: w + 1,
          themes: ['Story arc', 'Behind-the-scenes', 'Fan shout-out', 'Proof / momentum'],
          cadenceHint: 'Short-form 3–5x weekly if capacity allows; email 1× weekly unless launch week',
          slots: [
            { channel: 'Instagram', idea: 'Carousel: lyric hook + comment CTA' },
            { channel: 'YouTube', idea: 'Short vertical clip + pinned comment link' },
            { channel: 'Email', idea: 'Personal voice note + single CTA' },
          ],
        })),
        timingNotes: [
          `Horizon: ${timelineWeeks} weeks — compress pre-launch into final 10 days if timeline short.`,
          'Reserve budget for retargeting warm clicks (smart link visitors).',
          'Release Studio Launch owns the real Meta cadence: Connect Meta, then Admin AI run_meta_promo_pipeline (status → generate → arm → publish). Image slots only. No follower DMs.',
        ],
      }
    : null

  const adminConfigTemplates =
    focusAreas.includes('admin_config') ?
      {
        pasteBlocks: [
          {
            label: 'UTM campaign slug pattern',
            template:
              'utm_source={{channel}}&utm_medium={{format}}&utm_campaign={{release_slug}}_{{phase}}',
          },
          {
            label: 'Newsletter hero copy skeleton',
            template: `[Subject: {{hook}}\nPreheader: {{specificity}}\n\nHey — {{1 sentence proof}}\n\n{{CTA}} → {{smart_link}}\n\n— ${brandName}]`,
          },
          {
            label: 'Fan capture welcome DM / email',
            template:
              'Thanks for tapping in — here’s the hub: {{smart_link}}. Reply with your city if you want show alerts.',
          },
        ],
        envHints: [
          'Stripe live vs test keys isolated per deployment.',
          'Supabase RLS verified on fan tables before exposing capture APIs.',
          'NEXT_PUBLIC_SITE_URL matches canonical domain for OG URLs.',
        ],
      }
    : null

  return {
    generatedAt: new Date().toISOString(),
    packVersion: '1.0.0',
    brandName,
    primaryGoal,
    siteUrl,
    timelineWeeks,
    focusAreas,
    contextReminder: [urlLine, `Goal: ${primaryGoal}`],
    siteAudit,
    conversionWorkflow,
    seoStrategy,
    campaignBlueprint,
    adminConfigTemplates,
  }
}
