import { AdminSkill, SkillSchema, SkillValidationResult } from './types'

const releaseOpsSkill: AdminSkill = {
  id: 'release_ops',
  name: 'Release Ops',
  description: 'Operational release planning and checklist generation.',
  purpose: 'Ensure releases ship on time with complete metadata and launch readiness.',
  requiredContext: ['release_name', 'release_date'],
  allowedTools: ['create_release_checklist'],
  inputSchema: {
    releaseName: { type: 'string', required: true, description: 'Release title' },
    releaseDate: { type: 'string', required: false, description: 'Target release date' },
  },
  outputSchema: {
    releaseName: { type: 'string', required: true, description: 'Resolved release title' },
    releaseDate: { type: 'string', required: true, description: 'Resolved target release date' },
    tasksCreated: { type: 'number', required: true, description: 'Number of tasks generated' },
    tasks: { type: 'array', required: true, description: 'Generated task list' },
  },
  riskTier: 'tier_2_operational',
  confidenceRules: [
    'Require explicit release name for high confidence',
    'Lower confidence when release date is missing or ambiguous',
  ],
  systemPrompt:
    'You are Release Ops. Prioritize timeline integrity, metadata readiness, and actionable checklists.',
}

const productStrategySkill: AdminSkill = {
  id: 'product_strategy',
  name: 'Marketing & Product Strategy',
  description:
    'Turn screenshots, URLs, and goals into audits, conversion workflows, SEO briefs, campaign blueprints, and paste-ready admin snippets.',
  purpose:
    'Ship structured strategy artifacts fast (audit checklists, landing/email scaffolds, SEO outlines, calendars, config templates).',
  requiredContext: ['primary_goal'],
  allowedTools: ['draft_product_strategy_pack'],
  inputSchema: {
    brandName: { type: 'string', required: false, description: 'Brand / artist display name' },
    primaryGoal: { type: 'string', required: true, description: 'Measurable goal or launch thesis' },
    siteUrl: { type: 'string', required: false, description: 'Site URL to audit (production or preview)' },
    timelineWeeks: { type: 'number', required: false, description: 'Planning horizon in weeks (1–24)' },
    focusAreas: {
      type: 'array',
      required: false,
      description:
        'Subset of site_audit | conversion | seo | campaign | admin_config (omit for full pack)',
    },
    refineWithLlm: {
      type: 'boolean',
      required: false,
      description:
        'When true, preview runs an optional LLM polish pass (configured chat providers; dry-run only)',
    },
  },
  outputSchema: {
    generatedAt: { type: 'string', required: true, description: 'ISO timestamp' },
    brandName: { type: 'string', required: true, description: 'Brand used in the pack' },
    primaryGoal: { type: 'string', required: true, description: 'Restated goal' },
    timelineWeeks: { type: 'number', required: true, description: 'Horizon used' },
    focusAreas: { type: 'array', required: true, description: 'Sections included' },
    packVersion: { type: 'string', required: true, description: 'Pack schema revision' },
    contextReminder: { type: 'array', required: true, description: 'Anchors for reviewers' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'Ask for URLs/screenshots when auditing visual hierarchy or accessibility',
    'Treat deterministic sections as scaffolding — polish angles in chat with brand tone',
    'refineWithLlm adds LLM cost/latency and applies during preview (dry-run) only',
  ],
  systemPrompt:
    'You are Marketing & Product Strategy for an independent artist/DJ brand. Prefer actionable frameworks, measurable KPIs, and paste-ready templates. If the user is clearly mid-flight on a Release Studio / pipeline audit (snapshots, distributor drafts, ISRC timelines), defer to Ops Intelligence or Release Studio tool guidance instead of resetting to generic marketing intros—resume their checklist unless they change topics. When users share screenshots or links, run structured critiques against clarity, proof, CTA focus, performance, and accessibility — never invent analytics numbers; instruct how to verify in their stack. For SEO, separate branded vs intent-led clusters and tie pages to real crawl paths. For campaigns, sequence timing against realistic bandwidth. When execution belongs in the database (saved campaigns, smartlinks), say so and point to Growth Marketing + `/exec generate_campaign_draft` or Smartlink + `generate_smartlink_utm_plan`.',
}

const growthMarketingSkill: AdminSkill = {
  id: 'growth_marketing',
  name: 'Growth Marketing',
  description: 'Persisted campaign drafts (Supabase) plus smartlink handoff.',
  purpose: 'Create campaign rows and follow-up tasks aligned to measurable goals.',
  requiredContext: ['artist_name', 'campaign_goal'],
  allowedTools: ['generate_campaign_draft'],
  inputSchema: {
    artistName: { type: 'string', required: true, description: 'Artist name' },
    campaignGoal: { type: 'string', required: true, description: 'Campaign goal' },
    channels: { type: 'array', required: false, description: 'Target channels' },
    releaseId: { type: 'string', required: false, description: 'Linked release id' },
  },
  outputSchema: {
    artistName: { type: 'string', required: true, description: 'Resolved artist name' },
    campaignGoal: { type: 'string', required: true, description: 'Resolved campaign goal' },
    channels: { type: 'array', required: true, description: 'Selected channels' },
    campaign: { type: 'object', required: true, description: 'Created campaign record' },
    smartlink: { type: 'object', required: true, description: 'Created smartlink record' },
    task: { type: 'object', required: true, description: 'Created follow-up task' },
    phases: { type: 'array', required: true, description: 'Recommended campaign phases' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'Higher confidence when campaign goal is measurable',
    'Lower confidence if channels are omitted and inferred',
  ],
  systemPrompt:
    'You are Growth Marketing. Optimize for launch velocity, conversion, and measurable outcomes.',
}

const smartlinkSeoSkill: AdminSkill = {
  id: 'smartlink_seo',
  name: 'Smartlink + UTM',
  description: 'Tracked destination URLs, smartlink rows, and UTM naming discipline.',
  purpose: 'Create trackable links and attribution-safe campaign URLs.',
  requiredContext: ['destination', 'campaign', 'source', 'medium'],
  allowedTools: ['generate_smartlink_utm_plan'],
  inputSchema: {
    destination: { type: 'string', required: true, description: 'Target URL' },
    campaign: { type: 'string', required: true, description: 'Campaign slug/name' },
    source: { type: 'string', required: true, description: 'Traffic source' },
    medium: { type: 'string', required: true, description: 'Traffic medium' },
    releaseId: { type: 'string', required: false, description: 'Linked release id' },
  },
  outputSchema: {
    destination: { type: 'string', required: true, description: 'Base destination URL' },
    campaign: { type: 'string', required: true, description: 'Campaign identifier' },
    source: { type: 'string', required: true, description: 'UTM source' },
    medium: { type: 'string', required: true, description: 'UTM medium' },
    smartlink: { type: 'object', required: true, description: 'Created smartlink' },
    utmUrl: { type: 'string', required: true, description: 'Resolved UTM URL' },
    linkAliases: { type: 'array', required: true, description: 'Suggested aliases' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'Require destination URL and campaign naming conventions',
    'Lower confidence when campaign/source/medium are inferred defaults',
  ],
  systemPrompt:
    'You are Smartlink & UTM Ops. Favor clean attribution, canonical links, and scalable naming conventions. Route keyword/content SEO strategy questions to the Marketing & Product Strategy agent unless the user only needs tracking links.',
}

const e2eQaSkill: AdminSkill = {
  id: 'e2e_qa',
  name: 'E2E & QA (Playwright)',
  description: 'Run Playwright end-to-end checks against a running dev or staging server.',
  purpose: 'Smoke-test key routes from the admin panel without leaving the app.',
  requiredContext: ['target_server_up'],
  allowedTools: ['run_playwright_e2e'],
  inputSchema: {
    spec: { type: 'string', required: false, description: 'Test file under e2e/, e.g. e2e/admin-guest.spec.ts' },
    project: { type: 'string', required: false, description: 'Playwright project (e.g. chromium-guest)' },
    grep: { type: 'string', required: false, description: 'Optional test name filter' },
  },
  outputSchema: {},
  riskTier: 'tier_2_operational',
  confidenceRules: [
    'Requires the site reachable at PLAYWRIGHT_BASE_URL and ADMIN_AI_PLAYWRIGHT_ENABLED=1 for real runs',
    'Prefer a single spec file over the full suite for faster feedback',
  ],
  systemPrompt:
    'You are QA Automation. Prefer small, fast Playwright runs; use existing specs under e2e/ only; never invent file paths outside e2e/.',
}

const macAutomationSkill: AdminSkill = {
  id: 'mac_automation',
  name: 'Mac automation (AppleScript)',
  description: 'Run AppleScript via osascript for light macOS tasks (automation, UI scripting when enabled).',
  purpose: 'Bridge admin workflows to local macOS (Music, Shortcuts, Finder) with explicit opt-in.',
  requiredContext: ['script'],
  allowedTools: ['run_applescript'],
  inputSchema: {
    script: { type: 'string', required: true, description: 'AppleScript source' },
  },
  outputSchema: {},
  riskTier: 'tier_2_operational',
  confidenceRules: [
    'Only runs on macOS; set ADMIN_AI_APPLESCRIPT_ENABLED=1 and review scripts before approval',
    'Block unsafe shell patterns; prefer tell blocks and app-specific scripting',
  ],
  systemPrompt:
    'You are Mac Automation. Suggest small, testable AppleScript; avoid do shell script unless necessary and never for destructive or network operations.',
}

const adminIntelSkill: AdminSkill = {
  id: 'admin_intel',
  name: 'Ops intelligence',
  description: 'Read-only snapshot of nurturing and Release Studio state from the database.',
  purpose: 'Answer “where are we?” with campaign, fan, smart link, and distribution release metrics.',
  requiredContext: [],
  allowedTools: ['query_ops_snapshot'],
  inputSchema: {
    focus: {
      type: 'string',
      required: false,
      description: 'Optional scope: all (default), nurturing, or studio',
    },
  },
  outputSchema: {
    generatedAt: { type: 'string', required: true, description: 'When the snapshot was taken' },
    nurturing: { type: 'object', required: false, description: 'Campaigns, fans, smart links' },
    studio: { type: 'object', required: false, description: 'Distribution releases' },
    dryRun: { type: 'boolean', required: false, description: 'Whether this was a dry-run preview' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'Recommend Plan mode or /exec query_ops_snapshot when the user asks for counts or pipeline status',
    'Interpret missing sections as optional tables or RLS — suggest checking Supabase if errors appear',
  ],
  systemPrompt:
    'You are Ops Intelligence. Ground answers in measurable pipeline state—never invent counts or DSP statuses. For release pipeline / schedule audits start with `query_ops_snapshot` (studio vs all). Cross-check timelines with Release Studio `query_studio_command_center` when the user cares about due dates. Short acknowledgements (“proceed”, “yes”) should continue the active audit plan instead of switching to unrelated marketing topics.',
}

const studioReleaseSkill: AdminSkill = {
  id: 'studio_release',
  name: 'Release Studio',
  description: 'Create distribution release drafts in Release Studio (distribution_releases).',
  purpose: 'Open a structured draft so tracks, ISRCs, and DSP handoff can be completed in /studio.',
  requiredContext: ['title', 'type'],
  allowedTools: [
    'query_release_studio_snapshot',
    'query_studio_command_center',
    'patch_release_marketing_copy',
    'update_copyright_checklist',
    'assign_isrcs',
    'create_distribution_release_draft',
  ],
  inputSchema: {
    releaseId: { type: 'string', required: false, description: 'Distribution release id' },
    title: { type: 'string', required: false, description: 'Release title (required for new drafts)' },
    marketingCopy: { type: 'object', required: false, description: 'Partial marketing_copy fields to merge' },
    updates: { type: 'object', required: false, description: 'Copyright checklist fields to update' },
    trackIds: { type: 'array', required: false, description: 'Track ids for ISRC assignment' },
    dueWithinDays: { type: 'number', required: false, description: 'Command center due window (days)' },
    type: { type: 'string', required: true, description: 'single, ep, or album' },
    releaseDate: { type: 'string', required: false, description: 'Target date YYYY-MM-DD' },
    id: { type: 'string', required: false, description: 'Optional explicit release id (else auto-generated)' },
    description: { type: 'string', required: false, description: 'Short release description' },
    genre: { type: 'string', required: false, description: 'Primary genre' },
    subgenre: { type: 'string', required: false, description: 'Subgenre' },
  },
  outputSchema: {
    release: { type: 'object', required: true, description: 'distribution_releases row or preview' },
    studioUrl: { type: 'string', required: true, description: 'Path to open in Release Studio' },
    dryRun: { type: 'boolean', required: false, description: 'Preview flag' },
  },
  riskTier: 'tier_2_operational',
  confidenceRules: [
    'Confirm title and format (single/ep/album) before executing',
    'Creating a draft does not distribute — remind the user to attach tracks and submit via Studio',
  ],
  systemPrompt:
    'You are Release Studio Ops. Use query_release_studio_snapshot for a specific release id (blockers, tracks, rights, copy gaps). Use query_studio_command_center for rolling due-date pressure across releases. Pair with Ops Intelligence snapshots when the user wants aggregate pipeline health. Never claim a release is live on DSPs unless distributor_status is live. Continue the same release-audit thread on short prompts like “proceed”—do not pivot to unrelated marketing landing-page strategy unless the user asks.',
}

const skills: AdminSkill[] = [
  releaseOpsSkill,
  productStrategySkill,
  growthMarketingSkill,
  smartlinkSeoSkill,
  e2eQaSkill,
  macAutomationSkill,
  adminIntelSkill,
  studioReleaseSkill,
]

const toolToSkillId: Record<string, string> = {
  create_release_checklist: 'release_ops',
  draft_product_strategy_pack: 'product_strategy',
  generate_campaign_draft: 'growth_marketing',
  generate_smartlink_utm_plan: 'smartlink_seo',
  run_playwright_e2e: 'e2e_qa',
  run_applescript: 'mac_automation',
  query_ops_snapshot: 'admin_intel',
  query_release_studio_snapshot: 'studio_release',
  query_studio_command_center: 'studio_release',
  patch_release_marketing_copy: 'studio_release',
  update_copyright_checklist: 'studio_release',
  assign_isrcs: 'studio_release',
  create_distribution_release_draft: 'studio_release',
}

export function getAllSkills() {
  return skills
}

let allowedSkillIdsCache: Set<string> | null = null

/** Cached skill id set for hot paths (e.g. admin chat route validation). */
export function getAllowedAdminSkillIds(): Set<string> {
  if (!allowedSkillIdsCache) {
    allowedSkillIdsCache = new Set(skills.map((s) => s.id))
  }
  return allowedSkillIdsCache
}

export function getSkillById(skillId: string) {
  return skills.find((skill) => skill.id === skillId) || null
}

export function getSkillByTool(toolName: string) {
  const skillId = toolToSkillId[toolName]
  if (!skillId) return null
  return getSkillById(skillId)
}

export function inferSkillFromIntent(message: string) {
  const content = message.toLowerCase()
  if (
    content.includes('playwright') ||
    content.includes('e2e') ||
    content.includes('end-to-end') ||
    content.includes('end to end') ||
    content.includes('smoke test') ||
    content.includes('regression test')
  ) {
    return e2eQaSkill
  }
  if (content.includes('applescript') || content.includes('osascript') || content.includes('macos automation')) {
    return macAutomationSkill
  }

  const releasePipelineOverview =
    content.includes('future release') ||
    content.includes('upcoming release') ||
    content.includes('release schedule') ||
    content.includes('scheduled release') ||
    content.includes('release calendar') ||
    content.includes('distribution pipeline') ||
    content.includes('release pipeline') ||
    (content.includes('pipeline') && content.includes('distribution'))

  if (releasePipelineOverview) {
    return adminIntelSkill
  }

  if (
    content.includes('snapshot') ||
    content.includes('pipeline status') ||
    content.includes('ops snapshot') ||
    content.includes('how many fans') ||
    content.includes('fan count') ||
    content.includes('campaign count') ||
    (content.includes('dashboard') && content.includes('metric')) ||
    (content.includes('what') && content.includes('pending')) ||
    content.includes('nurturing metrics') ||
    content.includes('distribution status')
  ) {
    return adminIntelSkill
  }
  const strategyCue =
    content.includes('site audit') ||
    content.includes('screenshot') ||
    content.includes('conversion') ||
    content.includes('landing page') ||
    content.includes('email sequence') ||
    content.includes('keyword research') ||
    content.includes('content brief') ||
    content.includes('site structure') ||
    content.includes('information architecture') ||
    content.includes('launch checklist') ||
    content.includes('social calendar') ||
    content.includes('campaign blueprint') ||
    content.includes('go-to-market') ||
    content.includes('gtm') ||
    content.includes('product strategy') ||
    content.includes('positioning') ||
    content.includes('value proposition') ||
    content.includes('value prop') ||
    content.includes('messaging') ||
    content.includes('funnel') ||
    /\bcro\b/i.test(message) ||
    content.includes('seo strategy')

  if (strategyCue) {
    return productStrategySkill
  }

  if (
    content.includes('readiness') ||
    content.includes('blocker') ||
    content.includes('what is missing') ||
    content.includes("what's missing") ||
    content.includes('next step') ||
    content.includes('release snapshot') ||
    content.includes('this release') ||
    content.includes('marketing copy') ||
    content.includes('copyright checklist') ||
    content.includes('assign isrc') ||
    content.includes('command center') ||
    content.includes('due this week') ||
    content.includes('daily priorities')
  ) {
    return studioReleaseSkill
  }
  if (
    content.includes('distribution release') ||
    content.includes('release studio') ||
    content.includes('/studio') ||
    (content.includes('studio') && content.includes('release')) ||
    (content.includes('dsp') && (content.includes('draft') || content.includes('release'))) ||
    (content.includes('create') && content.includes('distribution') && content.includes('release'))
  ) {
    return studioReleaseSkill
  }
  if (content.includes('utm') || content.includes('smartlink') || content.includes('tracking link')) {
    return smartlinkSeoSkill
  }

  const wantsPersistedCampaign =
    content.includes('create campaign') ||
    content.includes('campaign draft') ||
    content.includes('draft campaign') ||
    content.includes('fan segment') ||
    (content.includes('campaign') && content.includes('database'))

  if (wantsPersistedCampaign) {
    return growthMarketingSkill
  }

  if (content.includes('campaign') || content.includes('growth') || content.includes('marketing')) {
    return productStrategySkill
  }
  if (content.includes('release') || content.includes('metadata') || content.includes('checklist')) {
    return releaseOpsSkill
  }
  return productStrategySkill
}

function valueMatchesSchemaType(value: unknown, schemaType: SkillSchema[keyof SkillSchema]['type']) {
  if (schemaType === 'array') return Array.isArray(value)
  if (schemaType === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
  return typeof value === schemaType
}

export function validateAgainstSkillSchema(payload: Record<string, unknown>, schema: SkillSchema): SkillValidationResult {
  const errors: string[] = []

  for (const [field, config] of Object.entries(schema)) {
    const value = payload[field]
    if (config.required && (value === undefined || value === null)) {
      errors.push(`Missing required field: ${field}`)
      continue
    }
    if (value !== undefined && value !== null && !valueMatchesSchemaType(value, config.type)) {
      errors.push(`Invalid type for ${field}: expected ${config.type}`)
    }
  }

  return { valid: errors.length === 0, errors }
}
