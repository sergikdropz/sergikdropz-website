import type { AdminAiPageContext } from '@/lib/ai/admin-ai-page-context'
import { getStudioStepAiPrompt } from '@/lib/studio/admin-ai-step-prompts'
import { WORKFLOW_STEPS, type WorkflowStepId } from '@/lib/studio/constants'

export type MissionDockAction =
  | { type: 'fix-blocker' }
  | { type: 'snapshot' }
  | { type: 'copy-dry-run' }
  | { type: 'open-launch' }
  | { type: 'harness'; query: string }
  | { type: 'week' }
  | { type: 'prompt'; message: string }
  | { type: 'distrokid-hydrate'; target?: 'upload' | 'my_music' }

export type MissionDockItem = {
  id: string
  label: string
  title?: string
  className?: string
  action: MissionDockAction
}

export type MissionDockMenu = {
  id: string
  label: string
  items: MissionDockItem[]
}

export type MissionDockModel = {
  areaLabel: string
  subject: string | null
  statusFallback: string
  menus: MissionDockMenu[]
}

function exec(tool: string, payload: Record<string, unknown>): string {
  return `/exec ${tool} ${JSON.stringify(payload)}`
}

function item(
  id: string,
  label: string,
  action: MissionDockAction,
  extra?: Pick<MissionDockItem, 'title' | 'className'>,
): MissionDockItem {
  return { id, label, action, ...extra }
}

function menu(id: string, label: string, items: MissionDockItem[]): MissionDockMenu {
  return { id, label, items }
}

function harnessItem(id: string, query: string): MissionDockItem {
  return item(id, 'Intelligence stack', { type: 'harness', query }, {
    title: 'OlliN Pro harness, Crowe Logic, and Sonic DNA',
    className: 'text-cyan-100',
  })
}

function snapshotItem(id = 'snapshot'): MissionDockItem {
  return item(id, 'Snapshot', { type: 'snapshot' }, { title: 'Run the release snapshot in chat' })
}

function fixItem(): MissionDockItem {
  return item('fix', 'Fix top blocker', { type: 'fix-blocker' }, { className: 'text-amber-100' })
}

function isWorkflowStep(value: string | null | undefined): value is WorkflowStepId {
  return WORKFLOW_STEPS.some((step) => step.id === value)
}

function releaseStepMenus(step: WorkflowStepId, releaseId: string, title: string): MissionDockMenu[] {
  const runbook = getStudioStepAiPrompt(step, releaseId, title)
  const runbookItem = item('runbook', runbook.label, { type: 'prompt', message: runbook.message })
  const check = menu('check', 'Check', [
    snapshotItem(),
    harnessItem('harness', `${step} ${title} SERGIK release ops`),
  ])

  switch (step) {
    case 'catalog':
      return [
        menu('tracks', 'Tracks', [
          fixItem(),
          runbookItem,
          item(
            'isrc',
            'Preview ISRCs',
            { type: 'prompt', message: exec('assign_isrcs', { releaseId, dryRun: true }) },
            { title: 'Dry-run ISRC assignment' },
          ),
        ]),
        menu('ingest', 'Ingest', [
          item('dsp', 'DSP ingest check', {
            type: 'prompt',
            message: `Review DSP ingest hygiene for "${title}" (${releaseId}): cover vs original, songwriter legal names, AI declaration, Apple performer and producer, title hygiene, and preview-clip start. Start from the release snapshot. Do not invent ISRCs.`,
          }),
        ]),
        check,
      ]
    case 'metadata':
      return [
        menu('metadata', 'Metadata', [fixItem(), runbookItem]),
        menu('artwork', 'Artwork', [
          item('artwork', 'Artwork and genre', {
            type: 'prompt',
            message: `For "${title}" (${releaseId}), list missing DSP genre, previously-released flag, artwork ownership, street date, and UPC issues. Use the release snapshot. Do not invent codes.`,
          }),
        ]),
        check,
      ]
    case 'rights':
      return [
        menu('rights', 'Rights', [fixItem(), runbookItem, snapshotItem()]),
        menu('paperwork', 'Paperwork', [
          item('splits', 'Split sheet', {
            type: 'prompt',
            message: `Audit the split sheet for "${title}" (${releaseId}) as Music Business Counsel. /exec audit_music_contract ${JSON.stringify({ releaseId, dealKind: 'split_sheet' })} Call out shares that do not total 100%, missing legal names, and master vs composition. Do not invent splits.`,
          }),
          item('checklist', 'Copyright checklist', {
            type: 'prompt',
            message: `From the counsel audit and snapshot for "${title}" (${releaseId}), say which copyright checklist items are still open and which update_copyright_checklist fields are safe to preview with dryRun. Do not mark items true without evidence.`,
          }),
        ]),
        menu('clearance', 'Clearance', [
          item('ugc', 'UGC pack', {
            type: 'prompt',
            message: `Check SERGIK UGC enrollment for "${title}" (${releaseId}). Do not claim YouTube, TikTok, or Meta earnings unless the pack is live.`,
          }),
          item('samples', 'Sample clearance', {
            type: 'prompt',
            message: `Audit sample clearance and attestations for "${title}" (${releaseId}). /exec audit_music_contract ${JSON.stringify({ releaseId, dealKind: 'sample' })} Do not invent licenses.`,
          }),
        ]),
      ]
    case 'copy':
      return [
        menu('copy', 'Copy', [
          item('draft', 'Draft copy', { type: 'prompt', message: runbook.message }),
          item('preview', 'Copy preview', { type: 'copy-dry-run' }, {
            title: 'Marketing merge dry-run',
            className: 'text-violet-100',
          }),
        ]),
        menu('pitch', 'Pitch', [
          item('pitch', 'Store and social', {
            type: 'prompt',
            message: `Draft store, social, and press lines for "${title}" (${releaseId}) from catalog facts only. No invented guests, cities, or chart numbers.`,
          }),
        ]),
        check,
      ]
    case 'delivery':
      return [
        menu('stores', 'Stores', [fixItem(), runbookItem]),
        menu('distrokid', 'DistroKid', [
          item(
            'dk-fill',
            'Fill DistroKid desk',
            { type: 'distrokid-hydrate', target: 'upload' },
            {
              title: 'Open signed-in DistroKid /new/ and fill metadata from the Studio packet (never submits)',
              className: 'text-amber-100',
            },
          ),
          item(
            'dk-mymusic',
            'Open My Music desk',
            { type: 'distrokid-hydrate', target: 'my_music' },
            { title: 'Open DistroKid My Music desk after upload' },
          ),
          item('dk-submitted', 'After upload stamp', {
            type: 'prompt',
            message: [
              `DistroKid handoff for "${title}" (${releaseId}).`,
              `/exec query_release_studio_snapshot ${JSON.stringify({ releaseId })}`,
              'After you finish the DistroKid upload in the Admin browser desk, use Delivery → DistroKid schedule → Mark submitted (Studio stamp only — DistroKid has no partner upload API). Then confirm store links before claiming live. Do not invent album UUIDs or store URLs.',
            ].join('\n'),
          }),
        ]),
        menu('ids', 'IDs', [
          item('upc', 'UPC and artist IDs', {
            type: 'prompt',
            message: `Check UPC, artist IDs, and store links for "${title}" (${releaseId}). Do not claim a store is live unless a link exists.`,
          }),
        ]),
        check,
      ]
    case 'launch':
      return [
        menu('launch', 'Launch', [
          fixItem(),
          runbookItem,
          item('open', 'Open launch step', { type: 'open-launch' }, { className: 'text-purple-100' }),
        ]),
        menu('campaign', 'Campaign', [
          item('week', 'Week priorities', { type: 'week' }),
          item('strategy', 'Strategy pack', {
            type: 'prompt',
            message: `Draft a product strategy pack preview for "${title}" (${releaseId}) after the launch snapshot. Dry-run only.`,
          }),
        ]),
        check,
      ]
    default:
      return [menu('release', 'Release', [fixItem(), snapshotItem()]), check]
  }
}

const ADMIN_PREFIXES: Array<{ prefix: string; label: string; kind: string }> = [
  { prefix: '/admin/music-vault', label: 'Music Vault', kind: 'vault' },
  { prefix: '/admin/videos-manager', label: 'Videos', kind: 'videos' },
  { prefix: '/admin/nurturing/smart-links', label: 'Smart Links', kind: 'smartlinks' },
  { prefix: '/admin/nurturing/campaigns', label: 'Campaigns', kind: 'campaigns' },
  { prefix: '/admin/nurturing/segments', label: 'Segments', kind: 'segments' },
  { prefix: '/admin/nurturing/templates', label: 'Templates', kind: 'templates' },
  { prefix: '/admin/nurturing/analytics', label: 'Nurturing analytics', kind: 'nurture-analytics' },
  { prefix: '/admin/nurturing/fans', label: 'Fans', kind: 'fans' },
  { prefix: '/admin/nurturing', label: 'Nurturing', kind: 'nurturing' },
  { prefix: '/admin/purchasable-tracks', label: 'Products', kind: 'products' },
  { prefix: '/admin/memberships', label: 'Memberships', kind: 'memberships' },
  { prefix: '/admin/subscribers', label: 'Subscribers', kind: 'subscribers' },
  { prefix: '/admin/purchases', label: 'Purchases', kind: 'purchases' },
  { prefix: '/admin/analytics', label: 'Analytics', kind: 'analytics' },
  { prefix: '/admin/licenses', label: 'Licenses', kind: 'licenses' },
  { prefix: '/admin/bundles', label: 'Bundles', kind: 'bundles' },
  { prefix: '/admin/gallery', label: 'Gallery', kind: 'gallery' },
  { prefix: '/admin/settings', label: 'Settings', kind: 'settings' },
  { prefix: '/admin/database', label: 'Database', kind: 'database' },
  { prefix: '/admin/splits', label: 'Splits', kind: 'shop-splits' },
  { prefix: '/admin/users', label: 'Users', kind: 'users' },
  { prefix: '/admin/tools', label: 'Tools', kind: 'tools' },
  { prefix: '/admin/music', label: 'Music', kind: 'music' },
  { prefix: '/admin/merch', label: 'Merch', kind: 'merch' },
  { prefix: '/admin/logs', label: 'Logs', kind: 'logs' },
  { prefix: '/admin', label: 'Dashboard', kind: 'dashboard' },
].sort((a, b) => b.prefix.length - a.prefix.length)

function matchAdmin(pathname: string) {
  return ADMIN_PREFIXES.find((row) => pathname === row.prefix || pathname.startsWith(`${row.prefix}/`))
}

function studioListMenus(kind: 'home' | 'releases' | 'create' | 'pipeline' | 'collab' | 'royalties'): MissionDockMenu[] {
  const pipeline = item('pipeline', 'Pipeline snapshot', {
    type: 'prompt',
    message: exec('query_ops_snapshot', { focus: 'studio' }),
  })
  const week = item('week', 'Week priorities', { type: 'week' })
  if (kind === 'create') {
    return [
      menu('create', 'Create', [
        item('draft', 'New release draft', {
          type: 'prompt',
          message: exec('create_distribution_release_draft', { title: 'Untitled SERGIK release', type: 'single' }),
        }),
        item('checklist', 'Release checklist', {
          type: 'prompt',
          message: exec('create_release_checklist', { releaseName: 'Next SERGIK release', releaseDate: 'TBD' }),
        }),
      ]),
      menu('look', 'Look ahead', [week, pipeline]),
    ]
  }
  if (kind === 'collab') {
    return [
      menu('collab', 'Collab', [
        item('pack', 'Collab packet', {
          type: 'prompt',
          message:
            'Review Release Collab: who is waiting on a split, which releases need collaborator emails, and what can be sent for signing. Do not invent agreements.',
        }),
      ]),
      menu('studio', 'Studio', [pipeline, week]),
    ]
  }
  if (kind === 'royalties') {
    return [
      menu('royalties', 'Royalties', [
        item('statements', 'Statement gaps', {
          type: 'prompt',
          message:
            'Review royalty ops: missing split sheets, unallocated statement lines, and payees that would stay 100% with the label. Do not invent amounts.',
        }),
      ]),
      menu('studio', 'Studio', [pipeline]),
    ]
  }
  return [
    menu('studio', kind === 'pipeline' ? 'Pipeline' : 'Releases', [pipeline, week]),
    menu('intel', 'Intel', [harnessItem('harness', 'Release Studio pipeline priorities')]),
  ]
}

function adminMenus(kind: string, label: string): MissionDockMenu[] {
  const ops = (focus: string) =>
    item('ops', 'Ops snapshot', {
      type: 'prompt',
      message: exec('query_ops_snapshot', { focus }),
    })

  if (kind === 'smartlinks') {
    return [
      menu('links', 'Links', [
        item('utm', 'UTM plan', {
          type: 'prompt',
          message: exec('generate_smartlink_utm_plan', {
            destination: 'https://sergik.com/music',
            campaign: 'smartlink_hygiene',
            source: 'instagram',
            medium: 'social',
          }),
        }),
        ops('nurturing'),
      ]),
    ]
  }
  if (kind === 'campaigns') {
    return [
      menu('campaigns', 'Campaigns', [
        item('draft', 'Campaign draft', {
          type: 'prompt',
          message: exec('generate_campaign_draft', {
            artistName: 'SERGIK',
            campaignGoal: 'Next release push',
            channels: ['email'],
          }),
        }),
        ops('nurturing'),
      ]),
    ]
  }
  if (kind === 'fans' || kind === 'segments' || kind === 'templates' || kind === 'nurturing' || kind === 'nurture-analytics') {
    return [
      menu('fans', label, [
        ops('nurturing'),
        item('gap', 'Gap scan', {
          type: 'prompt',
          message: `On ${label}, list the next useful fan, segment, or template ops from a nurturing snapshot. Do not invent subscriber counts.`,
        }),
      ]),
    ]
  }
  if (kind === 'vault' || kind === 'music') {
    return [
      menu('catalog', 'Catalog', [
        item('hygiene', 'Vault hygiene', {
          type: 'prompt',
          message:
            'Review Music Vault hygiene for this view: missing artwork, missing BPM, duplicate titles, and unpublished tracks. Do not invent file paths or counts.',
        }),
      ]),
      menu('intel', 'Intel', [harnessItem('harness', 'Music Vault catalog Sonic DNA gaps'), ops('studio')]),
    ]
  }
  if (kind === 'gallery' || kind === 'videos') {
    return [
      menu('media', label, [
        item('review', 'Media gaps', {
          type: 'prompt',
          message: `Review the ${label} library for missing artwork, unpublished items, and broken media. Do not invent filenames.`,
        }),
        harnessItem('harness', `${label} SERGIK media`),
      ]),
    ]
  }
  if (kind === 'products' || kind === 'licenses' || kind === 'bundles' || kind === 'memberships' || kind === 'merch' || kind === 'shop-splits' || kind === 'subscribers') {
    return [
      menu('shop', label, [
        item('review', `${label} check`, {
          type: 'prompt',
          message: `Review ${label} for missing prices, unpublished items, and split or subscriber gaps. Do not invent revenue.`,
        }),
        ops('all'),
      ]),
    ]
  }
  if (kind === 'purchases') {
    return [
      menu('orders', 'Purchases', [
        item('review', 'Recent orders', {
          type: 'prompt',
          message: 'Review recent purchases for failed checkouts and missing license fulfillment. Do not invent order totals.',
        }),
        ops('all'),
      ]),
    ]
  }
  if (kind === 'analytics') {
    return [
      menu('analytics', 'Analytics', [
        ops('all'),
        item('read', 'What to check', {
          type: 'prompt',
          message:
            'From the ops snapshot, say which studio and nurturing numbers to verify in Analytics. Do not invent metrics.',
        }),
      ]),
    ]
  }
  if (kind === 'tools') {
    return [
      menu('tools', 'Tools', [
        item('journey', 'Fan journey', {
          type: 'prompt',
          message: 'Outline a fan-journey simulator pass for the current catalog. Stay on real routes only.',
        }),
        harnessItem('harness', 'SERGIK fan journey tools'),
      ]),
    ]
  }
  if (kind === 'logs' || kind === 'database' || kind === 'settings' || kind === 'users') {
    return [
      menu('ops', label, [
        item('review', `${label} review`, {
          type: 'prompt',
          message: `Summarize useful ${label} checks for this admin session. Do not change data, users, or secrets.`,
        }),
        harnessItem('harness', `SERGIK admin ${label}`),
      ]),
    ]
  }
  return [
    menu('pulse', 'Pulse', [
      ops('all'),
      item('week', 'Week priorities', { type: 'week' }),
      harnessItem('harness', 'SERGIK admin dashboard'),
    ]),
  ]
}

export function buildMissionDock(ctx: AdminAiPageContext | null | undefined): MissionDockModel {
  const pathname = ctx?.pathname || ''
  const studio = ctx?.studio
  const releaseId = studio?.releaseId

  if (releaseId && isWorkflowStep(studio?.activeStep)) {
    const step = WORKFLOW_STEPS.find((row) => row.id === studio.activeStep)!
    const title = studio.title || 'This release'
    return {
      areaLabel: step.label,
      subject: title,
      statusFallback: studio.nextAction || `${step.label} — pick an action below.`,
      menus: releaseStepMenus(step.id, releaseId, title),
    }
  }

  if (releaseId) {
    const title = studio?.title || 'This release'
    return {
      areaLabel: 'Release',
      subject: title,
      statusFallback: studio?.nextAction || 'Open a workflow step or run a snapshot.',
      menus: [
        menu('release', 'Release', [fixItem(), snapshotItem()]),
        menu('check', 'Check', [harnessItem('harness', `${title} release ops`), item('week', 'Week priorities', { type: 'week' })]),
      ],
    }
  }

  if (pathname === '/studio/pipeline' || pathname.startsWith('/studio/pipeline/')) {
    return {
      areaLabel: 'Pipeline',
      subject: null,
      statusFallback: 'Pipeline-wide release ops.',
      menus: studioListMenus('pipeline'),
    }
  }
  if (pathname === '/studio/create' || pathname.startsWith('/studio/create/')) {
    return {
      areaLabel: 'Create',
      subject: null,
      statusFallback: 'Start a draft without leaving Create.',
      menus: studioListMenus('create'),
    }
  }
  if (pathname === '/studio/collab' || pathname.startsWith('/studio/collab/')) {
    return {
      areaLabel: 'Release Collab',
      subject: null,
      statusFallback: 'Collaborator packets and signing.',
      menus: studioListMenus('collab'),
    }
  }
  if (pathname === '/studio/royalties' || pathname.startsWith('/studio/royalties/')) {
    return {
      areaLabel: 'Royalties',
      subject: null,
      statusFallback: 'Split sheets and statement allocation.',
      menus: studioListMenus('royalties'),
    }
  }
  if (pathname === '/studio/releases' || pathname.startsWith('/studio/releases')) {
    return {
      areaLabel: 'Releases',
      subject: null,
      statusFallback: 'Choose a release or scan the pipeline.',
      menus: studioListMenus('releases'),
    }
  }
  if (pathname === '/studio' || pathname.startsWith('/studio/')) {
    return {
      areaLabel: 'Release Studio',
      subject: null,
      statusFallback: 'Studio home — pipeline first.',
      menus: studioListMenus('home'),
    }
  }

  const admin = matchAdmin(pathname)
  if (admin) {
    return {
      areaLabel: admin.label,
      subject: null,
      statusFallback: `${admin.label} ops for this page.`,
      menus: adminMenus(admin.kind, admin.label),
    }
  }

  return {
    areaLabel: 'Admin',
    subject: null,
    statusFallback: 'Ops for the page in view.',
    menus: adminMenus('dashboard', 'Admin'),
  }
}
