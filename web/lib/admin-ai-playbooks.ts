import type { AdminAiPageContext } from '@/lib/ai/admin-ai-page-context'
import type { AdminAiQuickStart } from '@/lib/admin-ai-quick-starts'
import type { WorkflowStepId } from '@/lib/studio/constants'

export const PLAYBOOK_QUICK_START_VISIBLE_COUNT = 3
export const PLAYBOOK_MESSAGE_PREFIX = '__playbook__:'

export type AdminAiPlaybookExecStep = {
  kind: 'exec'
  label: string
  tool: string
  payload: Record<string, unknown>
}

export type AdminAiPlaybook = {
  id: string
  label: string
  detail: string
  skillId: string
  /** When true, playbook steps need releaseId from active Studio context. */
  requiresRelease: boolean
  /** Jump here when the playbook starts (optional). */
  openStep?: WorkflowStepId
  steps: AdminAiPlaybookExecStep[]
}

export function buildReleasePlaybooks(releaseId: string, title: string): AdminAiPlaybook[] {
  const safeTitle = title || 'Untitled'
  return [
    {
      id: `playbook-ship-${releaseId}`,
      label: 'Ship EP this week',
      detail: 'Snapshot → copy gaps preview → harness — all dry-run.',
      skillId: 'studio_release',
      requiresRelease: true,
      openStep: 'copy',
      steps: [
        {
          kind: 'exec',
          label: 'Release snapshot',
          tool: 'query_release_studio_snapshot',
          payload: { releaseId },
        },
        {
          kind: 'exec',
          label: 'Intelligence harness',
          tool: 'query_intelligence_harness',
          payload: {
            mode: 'stack',
            releaseId,
            query: 'Sonic DNA unified intelligence Release Studio copy polymath',
          },
        },
        {
          kind: 'exec',
          label: 'Copy dry-run (merge)',
          tool: 'patch_release_marketing_copy',
          payload: {
            releaseId,
            merge: true,
            dryRun: true,
            marketingCopy: {},
          },
        },
      ],
    },
    {
      id: `playbook-post-release-${releaseId}`,
      label: 'Post-release 48h',
      detail: 'Strategy scaffold + smart link UTM plan (preview).',
      skillId: 'product_strategy',
      requiresRelease: true,
      openStep: 'launch',
      steps: [
        {
          kind: 'exec',
          label: 'Release snapshot',
          tool: 'query_release_studio_snapshot',
          payload: { releaseId },
        },
        {
          kind: 'exec',
          label: 'Product strategy pack',
          tool: 'draft_product_strategy_pack',
          payload: {
            brandName: 'SERGIK',
            primaryGoal: `Launch support for "${safeTitle}"`,
            siteUrl: 'https://sergikdropz.com',
            timelineWeeks: 2,
            focusAreas: ['campaign', 'conversion'],
            refineWithLlm: false,
          },
        },
        {
          kind: 'exec',
          label: 'Smart link + UTM',
          tool: 'generate_smartlink_utm_plan',
          payload: {
            destination: 'https://sergikdropz.com/music',
            campaign: `release_${releaseId.slice(0, 8)}`,
            source: 'instagram',
            medium: 'social',
          },
        },
      ],
    },
    {
      id: `playbook-rights-${releaseId}`,
      label: 'Rights packet day',
      detail: 'Music Business Counsel audit, then checklist preview.',
      skillId: 'music_business_counsel',
      requiresRelease: true,
      openStep: 'rights',
      steps: [
        {
          kind: 'exec',
          label: 'Counsel audit',
          tool: 'audit_music_contract',
          payload: { releaseId },
        },
        {
          kind: 'exec',
          label: 'Copyright checklist preview',
          tool: 'update_copyright_checklist',
          payload: { releaseId, updates: {} },
        },
      ],
    },
    {
      id: `playbook-meta-promo-${releaseId}`,
      label: 'Meta promo pipeline',
      detail: 'Status, schedule, arm image slots, preview due posts. Approve before Meta publishes.',
      skillId: 'product_strategy',
      requiresRelease: true,
      openStep: 'launch',
      steps: [
        {
          kind: 'exec',
          label: 'Meta connection + schedule',
          tool: 'run_meta_promo_pipeline',
          payload: {
            releaseId,
            action: 'status',
            primaryGoal: `Meta promo for "${safeTitle}"`,
            brandName: 'SERGIK',
          },
        },
        {
          kind: 'exec',
          label: 'Generate schedule preview',
          tool: 'run_meta_promo_pipeline',
          payload: {
            releaseId,
            action: 'generate',
            primaryGoal: `Generate Meta schedule for "${safeTitle}"`,
            brandName: 'SERGIK',
          },
        },
        {
          kind: 'exec',
          label: 'Arm image slots preview',
          tool: 'run_meta_promo_pipeline',
          payload: {
            releaseId,
            action: 'arm',
            primaryGoal: `Arm Meta image slots for "${safeTitle}"`,
            brandName: 'SERGIK',
          },
        },
        {
          kind: 'exec',
          label: 'Publish due preview',
          tool: 'run_meta_promo_pipeline',
          payload: {
            releaseId,
            action: 'publish',
            primaryGoal: `Publish due Meta slots for "${safeTitle}"`,
            brandName: 'SERGIK',
          },
        },
      ],
    },
  ]
}

const GROWTH_BOARD_PLAYBOOK: AdminAiPlaybook = {
  id: 'playbook-growth-board',
  label: 'Weekly Growth Board',
  detail: 'Snapshot → Spotify Artists desk read → campaign draft (approve before write).',
  skillId: 'growth_marketing',
  requiresRelease: false,
  steps: [
    {
      kind: 'exec',
      label: 'Growth scorecard',
      tool: 'query_platform_growth_snapshot',
      payload: {},
    },
    {
      kind: 'exec',
      label: 'Open Spotify for Artists',
      tool: 'admin_browser',
      payload: {
        action: 'navigate',
        url: 'https://artists.spotify.com/c/artist/7MnvMhWoSe4wYXuiI6iQ8H/home',
      },
    },
    {
      kind: 'exec',
      label: 'Read Spotify Artists page',
      tool: 'admin_browser',
      payload: { action: 'read' },
    },
    {
      kind: 'exec',
      label: 'Campaign draft (P0/P1)',
      tool: 'generate_campaign_draft',
      payload: {
        artistName: 'SERGIK',
        campaignGoal:
          'Weekly growth: convert IG to MusicBank + Spotify follows; cite query_platform_growth_snapshot baselines',
        channels: ['instagram', 'spotify', 'youtube', 'soundcloud'],
      },
    },
    {
      kind: 'exec',
      label: 'Smart link + UTM',
      tool: 'generate_smartlink_utm_plan',
      payload: {
        destination: 'https://sergikdropz.com/music',
        campaign: 'growth_board_weekly',
        source: 'instagram',
        medium: 'social',
      },
    },
  ],
}

const PIPELINE_PLAYBOOK: AdminAiPlaybook = {
  id: 'playbook-pipeline-week',
  label: 'Studio week at a glance',
  detail: 'Command center + ops snapshot (no release required).',
  skillId: 'studio_release',
  requiresRelease: false,
  steps: [
    {
      kind: 'exec',
      label: 'Command center',
      tool: 'query_studio_command_center',
      payload: { dueWithinDays: 7 },
    },
    {
      kind: 'exec',
      label: 'Ops snapshot',
      tool: 'query_ops_snapshot',
      payload: { focus: 'studio' },
    },
  ],
}

export function resolvePlaybooksForContext(ctx: AdminAiPageContext | null | undefined): AdminAiPlaybook[] {
  const rid = ctx?.studio?.releaseId
  const title = ctx?.studio?.title || 'Untitled'
  if (rid) {
    return [...buildReleasePlaybooks(rid, title), GROWTH_BOARD_PLAYBOOK, PIPELINE_PLAYBOOK]
  }
  return [GROWTH_BOARD_PLAYBOOK, PIPELINE_PLAYBOOK]
}

export function playbookToQuickStart(book: AdminAiPlaybook): AdminAiQuickStart {
  return {
    id: book.id,
    kind: 'priority',
    label: book.label,
    detail: book.detail,
    message: `${PLAYBOOK_MESSAGE_PREFIX}${book.id}`,
    skillId: book.skillId,
    priorityScore: 9,
  }
}

export function playbookPoolAsQuickStarts(ctx: AdminAiPageContext | null | undefined): AdminAiQuickStart[] {
  return resolvePlaybooksForContext(ctx).map(playbookToQuickStart)
}

export function findPlaybookById(
  ctx: AdminAiPageContext | null | undefined,
  playbookId: string,
): AdminAiPlaybook | undefined {
  return resolvePlaybooksForContext(ctx).find((book) => book.id === playbookId)
}

export function parsePlaybookIdFromQuickStart(start: AdminAiQuickStart): string | null {
  if (start.message.startsWith(PLAYBOOK_MESSAGE_PREFIX)) {
    return start.message.slice(PLAYBOOK_MESSAGE_PREFIX.length).trim() || null
  }
  return start.id.startsWith('playbook-') ? start.id : null
}
