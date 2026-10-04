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
  allowedTools: ['draft_product_strategy_pack', 'run_meta_promo_pipeline', 'admin_browser'],
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
    releaseId: {
      type: 'string',
      required: false,
      description: 'Distribution release id for run_meta_promo_pipeline',
    },
    action: {
      type: 'string',
      required: false,
      description: 'Meta promo action: status | generate | arm | publish | advance',
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
    'Meta promo writes (generate, arm, publish, advance) always preview with dryRun before approval',
    'Never claim a post is live on Instagram or Facebook unless run_meta_promo_pipeline returned a meta id',
    'Do not offer or simulate Instagram or Messenger blasts to all followers',
  ],
  systemPrompt:
    'You are Marketing & Product Strategy for an independent artist/DJ brand. Prefer actionable frameworks, measurable KPIs, and paste-ready templates. If the user is clearly mid-flight on a Release Studio / pipeline audit (snapshots, distributor drafts, ISRC timelines), defer to Ops Intelligence or Release Studio tool guidance instead of resetting to generic marketing intros—resume their checklist unless they change topics. When users share screenshots or links, run structured critiques against clarity, proof, CTA focus, performance, and accessibility — never invent analytics numbers; instruct how to verify in their stack (or hand off to Growth Marketing `/exec query_platform_growth_snapshot`). For SEO, separate branded vs intent-led clusters and tie pages to real crawl paths. For campaigns, sequence timing against realistic bandwidth. Meta promo is your publish desk: `/exec run_meta_promo_pipeline {"releaseId":"<id>","action":"status","primaryGoal":"Meta promo"}` then generate, arm, and publish. action status reads the connection and schedule; generate builds the PT cadence (T-14 to T+3) from the street date; arm marks planned feed, story stills, and Facebook Page photos Assets ready; publish sends due ready image slots; advance does generate-if-empty, arm, then publish. Always dryRun first. Reels and vinyl videos stay manual. Instagram and Messenger cannot message every follower — do not propose promo DMs. Connect Meta on Launch (redirect /api/studio/meta/callback, scopes pages_show_list, pages_manage_posts, instagram_basic, instagram_content_publish, business_management). Artwork must be public https. When execution belongs in the database (saved campaigns, smartlinks) or DSP growth scorecards, say so and point to Growth Marketing (`query_platform_growth_snapshot`, `generate_campaign_draft`) or Smartlink + `generate_smartlink_utm_plan`.',
}

const growthMarketingSkill: AdminSkill = {
  id: 'growth_marketing',
  name: 'Growth Marketing',
  description:
    'Platform growth coach: desk baselines, weekly scorecard, campaign drafts, smartlinks, and browser re-ingest.',
  purpose:
    'Close the loop from live DSP/social metrics → P0/P1 moves → persisted campaigns → re-measure.',
  requiredContext: [],
  allowedTools: [
    'query_platform_growth_snapshot',
    'admin_browser',
    'generate_campaign_draft',
    'generate_smartlink_utm_plan',
  ],
  inputSchema: {
    artistName: { type: 'string', required: false, description: 'Artist name (required for generate_campaign_draft)' },
    campaignGoal: {
      type: 'string',
      required: false,
      description: 'Measurable campaign goal (required for generate_campaign_draft)',
    },
    channels: { type: 'array', required: false, description: 'Target channels' },
    releaseId: { type: 'string', required: false, description: 'Linked release id' },
    action: {
      type: 'string',
      required: false,
      description: 'admin_browser action: status | navigate | read | …',
    },
    url: { type: 'string', required: false, description: 'admin_browser navigate URL' },
    destination: { type: 'string', required: false, description: 'Smartlink destination URL' },
    campaign: { type: 'string', required: false, description: 'UTM campaign slug' },
    source: { type: 'string', required: false, description: 'UTM source' },
    medium: { type: 'string', required: false, description: 'UTM medium' },
  },
  outputSchema: {
    ok: { type: 'boolean', required: false, description: 'Growth snapshot ok flag' },
    capturedAt: { type: 'string', required: false, description: 'Snapshot capture date' },
    scorecard: { type: 'object', required: false, description: 'Weekly growth scorecard' },
    artistName: { type: 'string', required: false, description: 'Resolved artist name' },
    campaignGoal: { type: 'string', required: false, description: 'Resolved campaign goal' },
    channels: { type: 'array', required: false, description: 'Selected channels' },
    campaign: { type: 'object', required: false, description: 'Created campaign record' },
    smartlink: { type: 'object', required: false, description: 'Created smartlink record' },
    task: { type: 'object', required: false, description: 'Created follow-up task' },
    phases: { type: 'array', required: false, description: 'Recommended campaign phases' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'Start with query_platform_growth_snapshot (or cite injected PLATFORM GROWTH SNAPSHOT) before claiming metrics',
    'Never invent Spotify/IG/YT/SC numbers; ask for admin_browser re-ingest if snapshot ageDays > 7 or stale',
    'Do not recommend Marquee/Showcase while scorecard.spotifyMarqueeEligible is false',
    'Prefer MusicBank / smartlink owned funnel until monthly listeners clear preferOwnedFunnelUntilMonthlyListeners',
    'Require measurable campaignGoal + artistName before generate_campaign_draft',
    'Weekly scorecard keys: Spotify ML+streams, SC top plays, YT views/subs, IG→site UTM clicks, MusicBank unlocks',
    'Collab-first when SC Bone/Nood heat leads; Meta promo publish stays on product_strategy run_meta_promo_pipeline',
  ],
  systemPrompt:
    'You are Growth Marketing for SERGIK — a closed-loop growth coach, not a generic marketer. Doctrine: (1) Never invent DSP/social analytics — `/exec query_platform_growth_snapshot {}` or admin_browser read first; cite capturedAt/ageDays. (2) At current scale prefer owned funnel (sergikdropz.com MusicBank + HyperFollow/smartlinks) over streaming-royalty fantasies. (3) Collabs (Bone/Nood/ROIL) outpace solo on SoundCloud — lean that lane. (4) IG→DSP conversion is the bottleneck (IG ~2k vs Spotify ML tens) — every drop needs a tracked listen/vault link, not Linktree-only. (5) Reject Marquee/Showcase until scorecard says eligible. (6) P0 unblockers: Apple Artists claim, Meta verify + IG messaging, bio alignment Spotify/YT↔site, SC Fan Support + Spotlight 5/5, fix dead Revelator HOMES URL. Weekly Growth Board: snapshot → delta vs last week → 3 P0/P1 moves → optional generate_campaign_draft + generate_smartlink_utm_plan → hand Meta schedules to product_strategy. Browser: navigate HOMES desks then read; leave You drive on for logins; never store passwords. Persist campaigns only when the goal is measurable (ML, follows, vault unlocks, UTM clicks).',
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

const sergikIntelligenceSkill: AdminSkill = {
  id: 'sergik_intelligence',
  name: 'SergikAI intelligence stack',
  description:
    'Probe OlliN Pro harness (catalog, RAG probe, knowledge search), Crowe Logic gateway, and Sonic DNA unified roll-ups.',
  purpose:
    'Connect Admin AI to Unified SergikAI / OlliN Pro intelligence harness and site-side Sonic DNA without inventing capabilities.',
  requiredContext: [],
  allowedTools: ['query_intelligence_harness', 'query_sergikai_chat', 'query_crowe_creative'],
  inputSchema: {
    mode: {
      type: 'string',
      required: false,
      description: 'stack (default) | ping | catalog | probe | knowledge | dev_mode',
    },
    query: { type: 'string', required: false, description: 'Harness probe or knowledge search query' },
    content: { type: 'string', required: false, description: 'SergikAI chat message body' },
    sessionId: { type: 'string', required: false, description: 'OlliN Pro session id (optional)' },
    action: {
      type: 'string',
      required: false,
      description: 'Crowe Creative: models | credits | quote | generate_image | generate_video',
    },
    prompt: { type: 'string', required: false, description: 'Crowe Creative prompt' },
    kind: { type: 'string', required: false, description: 'Crowe quote kind: video | image' },
    limit: { type: 'number', required: false, description: 'Probe hit limit (default 8)' },
    k: { type: 'number', required: false, description: 'Knowledge search top-k (default 8)' },
    full: { type: 'boolean', required: false, description: 'Full harness catalog when mode=catalog' },
    withKnowledge: { type: 'boolean', required: false, description: 'Include RAG in probe (default true)' },
    releaseId: {
      type: 'string',
      required: false,
      description: 'When mode=stack, attach Sonic DNA unified summary for this release',
    },
  },
  outputSchema: {
    dryRun: { type: 'boolean', required: false, description: 'Preview flag' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'Start with mode=stack before deep probes — it reports OlliN Pro, Crowe Logic, and optional Sonic DNA status',
    'If OlliN Pro API is offline, say so and list AIBLETON_API_BASE — do not invent harness rows',
    'Harness probe hits are grounding only; cross-check Release Studio snapshots for release-specific truth',
    'Crowe Creative generate_* always preview with dryRun first — quote credits before approve',
    'SergikAI chat may run OlliN server-side tools — keep messages scoped and require approval',
  ],
  systemPrompt:
    'You are the SergikAI intelligence connector for the SERGIK web admin. Tools: query_intelligence_harness (OlliN harness stack + Sonic DNA roll-up), query_sergikai_chat (OlliN Pro /api/sessions/.../messages — Unified SergikAI with server-side tools), query_crowe_creative (models, credits, quote, generate_image, generate_video on api.crowelogic.com). Crowe Logic chat gateway is separate (Admin AI provider crowelogic). Sonic DNA unified intelligence on releases: query_release_studio_snapshot adminAiBrief.sonicDnaUnified and copy_intel. Always quote Crowe Creative before generate_video. Never claim OlliN Canvas/Live tools ran unless chat or probe output confirms.',
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
    'For marketing copy, read adminAiBrief on the snapshot (empty fields, Sonic DNA intel cards, YouTube timestamp timeline) before drafting',
    'Preview patch_release_marketing_copy with dryRun:true; pair product_strategy + growth_marketing when expanding tags, social, or store discovery',
  ],
  systemPrompt:
    'You are Release Studio Ops. Contract audits and deal-fault memos belong to Music Business Counsel (`audit_music_contract`); you still preview update_copyright_checklist when a blocker is actually resolved. Use query_release_studio_snapshot for a specific release id (blockers, tracks, rights, copy gaps). Snapshots include adminAiBrief: marketing field status, per-track copy_intel summaries, sonicDnaUnified counts, and a continuous YouTube visualizer timestamp timeline — ground polymath copy there, never invent guests, cities, charts, or durations. For harness/RAG on product truth or Canvas capabilities, use query_intelligence_harness (mode stack with releaseId). Use patch_release_marketing_copy (merge:true, dryRun preview first) for elevator_pitch, press_blurb, spotify_pitch, social_caption, store_description, youtube_visualizer, platform_tags, credits_block. Platform tags keep labeled surfaces distinct (YouTube comma tags vs hashed IG/X/TikTok). Use query_studio_command_center for rolling due-date pressure across releases. Pair with Ops Intelligence snapshots when the user wants aggregate pipeline health. Never claim a release is live on DSPs unless distributor_status is live or a store link exists. DSP connect in Delivery resolves Spotify/Apple/YouTube/Deezer pages from a URL, ISRC, or UPC — it does not upload audio. Until Revelator Partner API is live, scheduled DSP delivery is Pipeline → DistroKid: copy the Launch upload packet into distrokid.com/new/, then mark submitted. DistroKid has no upload API. SERGIK UGC pack on Rights is first-party Content ID / TikTok / Meta fingerprinting through this platform, not DistroKid. Continue the same release-audit thread on short prompts like “proceed”—do not pivot to unrelated marketing landing-page strategy unless the user asks. Meta Instagram and Facebook promo is Marketing & Product Strategy `run_meta_promo_pipeline` (status, generate, arm, publish, advance). Preview dryRun before publish. Do not DM followers.',
}

const musicBusinessCounselSkill: AdminSkill = {
  id: 'music_business_counsel',
  name: 'Music Business Counsel',
  description:
    'SergikAI polymath specialist for music-business contracts: audit masters, compositions, neighboring rights, and deal drafts against global practice notes.',
  purpose:
    'Find faults in split sheets, producer, collab, publishing, sync, sample, and distribution paperwork, and list what to address before a lawyer signs off.',
  requiredContext: [],
  allowedTools: ['audit_music_contract'],
  inputSchema: {
    text: { type: 'string', required: false, description: 'Contract or packet text to audit' },
    releaseId: { type: 'string', required: false, description: 'Release Studio id — audits Catalog splits and generated packets' },
    dealKind: {
      type: 'string',
      required: false,
      description: 'split_sheet | producer | collab | featured_artist | publishing | distribution | sync | sample | session',
    },
    jurisdiction: { type: 'string', required: false, description: 'Governing law or country hint' },
    question: { type: 'string', required: false, description: 'Optional issue to look up in the music-law digest' },
  },
  outputSchema: {
    disclaimer: { type: 'string', required: true, description: 'Not-a-lawyer notice' },
    dealKind: { type: 'string', required: true, description: 'Deal type reviewed' },
    findings: { type: 'array', required: true, description: 'Issue list' },
    severityCounts: { type: 'object', required: true, description: 'Counts by severity' },
    addressPlan: { type: 'array', required: true, description: 'Ordered fixes' },
    memo: { type: 'string', required: true, description: 'Paste-ready memo' },
    knowledgeHits: { type: 'array', required: true, description: 'Corpus cards used' },
  },
  riskTier: 'tier_1_draft',
  confidenceRules: [
    'This agent issue-spots. It is not legal advice and not a substitute for counsel admitted in the governing jurisdiction.',
    'Never invent parties, split percentages, licenses, registration numbers, or case citations.',
    'Do not mark copyright checklist items true. Checklist writes stay on Release Studio update_copyright_checklist.',
    'Ground findings in audit_music_contract and the music-law digest topic ids.',
    'Master copyright and composition copyright stay in separate clauses.',
  ],
  systemPrompt:
    'You are Music Business Counsel on the SergikAI polymath desk. You audit and tighten music-business paperwork for SERGIK: split sheets, producer agreements, collab agreements, features, publishing admin, sync, samples, and distribution. Run `/exec audit_music_contract {"releaseId":"…"}` or pass `text` and `dealKind`. Report blockers, then material issues, then what to address. Cite digest topic ids from the tool output. Distinguish the sound recording from the musical work, and neighboring rights (SoundExchange, PPL, GVL, Re:Sound) from PRO/CMO composition income (ASCAP/BMI/SESAC/GMR, PRS, GEMA, SACEM, SOCAN, APRA AMCOS, JASRAC, KOMCA). SERGIK house rules: songwriter legal name Jordan Caboga, publisher SERGIK Music, ISRC prefix QTA53, DistroKid is a delivery vendor, UGC partner is SERGIK. Do not change Catalog percentages unless Catalog data contradicts the draft. Do not claim a registration, a sample license, or UGC earnings without evidence. Every memo starts from the tool disclaimer: you are not the user’s lawyer.',
}

const skills: AdminSkill[] = [
  releaseOpsSkill,
  productStrategySkill,
  growthMarketingSkill,
  smartlinkSeoSkill,
  e2eQaSkill,
  macAutomationSkill,
  adminIntelSkill,
  sergikIntelligenceSkill,
  studioReleaseSkill,
  musicBusinessCounselSkill,
]

const toolToSkillId: Record<string, string> = {
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
  const copyrightChecklist =
    content.includes('copyright checklist') || content.includes('update_copyright_checklist')
  const counselCue =
    !copyrightChecklist &&
    (content.includes('music counsel') ||
      content.includes('music lawyer') ||
      content.includes('business counsel') ||
      content.includes('contract audit') ||
      content.includes('audit this contract') ||
      content.includes('audit the contract') ||
      content.includes('audit this agreement') ||
      content.includes('split sheet') ||
      content.includes('music business counsel') ||
      content.includes('audit rights') ||
      content.includes('rights paperwork') ||
      content.includes('producer agreement') ||
      content.includes('collab agreement') ||
      content.includes('governing law') ||
      content.includes('work for hire') ||
      content.includes('work-for-hire') ||
      content.includes('neighboring rights') ||
      content.includes('moral rights') ||
      content.includes('controlled composition') ||
      content.includes('cross-collateral') ||
      content.includes('sample clearance') ||
      content.includes('sync license') ||
      content.includes('publishing admin') ||
      content.includes('360 deal') ||
      (content.includes('contract') && (content.includes('audit') || content.includes('fault') || content.includes('red flag'))) ||
      (content.includes('agreement') && (content.includes('audit') || content.includes('fault') || content.includes('issue'))))

  if (counselCue) {
    return musicBusinessCounselSkill
  }

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

  if (
    content.includes('intelligence harness') ||
    content.includes('harness probe') ||
    content.includes('harness_catalog') ||
    content.includes('ollin pro') ||
    content.includes('ollin-pro') ||
    content.includes('sergikai') ||
    content.includes('sergikai harness') ||
    content.includes('crowe logic') ||
    content.includes('crowelogic') ||
    content.includes('unified intelligence') ||
    content.includes('intelligence stack') ||
    content.includes('knowledge search') ||
    content.includes('sergikai chat') ||
    content.includes('crowe creative') ||
    (content.includes('dev mode') && content.includes('ollin'))
  ) {
    return sergikIntelligenceSkill
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

  const growthDeskCue =
    content.includes('growth board') ||
    content.includes('platform growth') ||
    content.includes('growth snapshot') ||
    content.includes('grow spotify') ||
    content.includes('grow the brand') ||
    content.includes('monthly listeners') ||
    content.includes('ig to dsp') ||
    content.includes('instagram to spotify') ||
    content.includes('how do we grow') ||
    content.includes('how can we grow') ||
    content.includes('growth plan') ||
    content.includes('fan support') ||
    (content.includes('marquee') && !content.includes('meta promo')) ||
    (content.includes('grow') &&
      (content.includes('spotify') ||
        content.includes('youtube') ||
        content.includes('soundcloud') ||
        content.includes('instagram') ||
        content.includes('listeners') ||
        content.includes('followers')))

  if (growthDeskCue) {
    return growthMarketingSkill
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
    content.includes('seo strategy') ||
    content.includes('meta promo') ||
    content.includes('social promo') ||
    content.includes('promo schedule') ||
    content.includes('promo pipeline')

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
    content.includes('daily priorities') ||
    content.includes('elevator pitch') ||
    content.includes('press blurb') ||
    content.includes('spotify pitch') ||
    content.includes('spotify editorial') ||
    content.includes('social caption') ||
    content.includes('store description') ||
    content.includes('youtube visualizer') ||
    content.includes('platform tags') ||
    content.includes('credits block') ||
    content.includes('copywriting') ||
    content.includes('refine copy') ||
    content.includes('sonic dna') ||
    content.includes('polymath')
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

  if (content.includes('growth') || content.includes('grow ')) {
    return growthMarketingSkill
  }

  if (content.includes('campaign') || content.includes('marketing')) {
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
