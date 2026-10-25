import { NextResponse } from 'next/server'
import { getServerSession, type ServerAuthSession } from '@/lib/auth'

export type RouteAccess = 'public' | 'fan' | 'admin_read' | 'admin_write' | 'cron'

export type AdminGuardResult =
  | { ok: true; session: ServerAuthSession }
  | { ok: false; response: NextResponse }

export type RoutePolicyEntry = {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  access: RouteAccess
  /** Short reason for audits / reviews. */
  reason: string
}

/**
 * Method-aware access registry for privileged surfaces.
 * Handler-level guards remain authoritative; this registry drives tests and reviews.
 */
export const ROUTE_POLICIES: readonly RoutePolicyEntry[] = [
  // Public playback helpers (used by MusicPlayer / resolveAudioUrl / SonicDNA display)
  { path: '/api/media/session-artwork', method: 'GET', access: 'public', reason: 'Lock-screen Media Session cover bytes' },
  { path: '/api/audio/resolve', method: 'GET', access: 'public', reason: 'Public playback URL resolution' },
  { path: '/api/audio/bpm', method: 'GET', access: 'public', reason: 'Public BPM lookup for player' },
  { path: '/api/audio/waveform', method: 'GET', access: 'public', reason: 'Public waveform for player' },
  { path: '/api/audio/waveform', method: 'POST', access: 'admin_write', reason: 'Persist rescanned waveform peaks' },
  { path: '/api/audio/sonic-dna', method: 'GET', access: 'public', reason: 'Public Sonic DNA display' },

  // Privileged audio / Sonic DNA
  { path: '/api/audio/list', method: 'GET', access: 'admin_read', reason: 'Full library listing + optional AI columns' },
  { path: '/api/audio/agent-status', method: 'GET', access: 'admin_read', reason: 'Agent job status' },
  { path: '/api/audio/analyze-all-sonic-dna', method: 'GET', access: 'admin_read', reason: 'Batch analysis status' },
  { path: '/api/audio/analyze-all-sonic-dna', method: 'POST', access: 'admin_write', reason: 'Batch Sonic DNA analysis' },
  { path: '/api/audio/analyze-collection', method: 'POST', access: 'admin_write', reason: 'Collection Sonic DNA analysis' },
  { path: '/api/audio/regenerate-all-sonic-dna', method: 'GET', access: 'admin_read', reason: 'Batch regenerate status' },
  { path: '/api/audio/regenerate-all-sonic-dna', method: 'POST', access: 'admin_write', reason: 'Batch regenerate Sonic DNA' },
  { path: '/api/audio/regenerate-all-sonic-dna-agents', method: 'GET', access: 'admin_read', reason: 'Agent batch status' },
  { path: '/api/audio/regenerate-all-sonic-dna-agents', method: 'POST', access: 'admin_write', reason: 'Agent batch regenerate' },
  { path: '/api/audio/update-all-enhanced', method: 'GET', access: 'admin_read', reason: 'Enhanced update status' },
  { path: '/api/audio/update-all-enhanced', method: 'POST', access: 'admin_write', reason: 'Enhanced batch update' },
  { path: '/api/audio/sonic-dna', method: 'POST', access: 'admin_write', reason: 'Force regenerate Sonic DNA' },
  { path: '/api/audio/sonic-dna-agents', method: 'POST', access: 'admin_write', reason: 'Run Sonic DNA agents' },
  { path: '/api/audio/sonic-dna-review', method: 'POST', access: 'admin_write', reason: 'Review/edit Sonic DNA report' },
  { path: '/api/audio/upload', method: 'POST', access: 'admin_write', reason: 'Audio upload' },
  { path: '/api/audio/upload-with-pipeline', method: 'POST', access: 'admin_write', reason: 'Upload with analysis pipeline' },
  { path: '/api/audio/replace', method: 'POST', access: 'admin_write', reason: 'Replace audio file' },
  { path: '/api/studio/tracks/[id]/replace-wav', method: 'POST', access: 'admin_write', reason: 'Replace catalog master WAV and vault audio' },
  { path: '/api/audio/reprocess-track', method: 'POST', access: 'admin_write', reason: 'Reprocess track' },
  { path: '/api/audio/artwork', method: 'POST', access: 'admin_write', reason: 'Artwork extraction/upload' },
  { path: '/api/audio/artwork', method: 'DELETE', access: 'admin_write', reason: 'Delete cover art file from pool' },
  { path: '/api/audio/update-bpm', method: 'POST', access: 'admin_write', reason: 'Persist BPM' },
  { path: '/api/audio/artifacts', method: 'POST', access: 'admin_write', reason: 'Audio artifact generation' },

  // Admin AI surfaces (middleware + handler)
  { path: '/api/admin/ai/chat', method: 'POST', access: 'admin_write', reason: 'Admin AI chat' },
  { path: '/api/admin/ai/plan', method: 'POST', access: 'admin_write', reason: 'Admin AI plan' },
  { path: '/api/admin/ai/execute', method: 'POST', access: 'admin_write', reason: 'Admin AI execute/approve' },
  { path: '/api/admin/ai/runs', method: 'GET', access: 'admin_read', reason: 'List AI runs (scoped)' },
  { path: '/api/admin/ai/jobs', method: 'GET', access: 'admin_read', reason: 'Inspect Sonic DNA / AI jobs' },
  { path: '/api/admin/ai/jobs', method: 'POST', access: 'admin_write', reason: 'Enqueue Sonic DNA / AI jobs' },

  // Music library — vault reads vs admin writes
  { path: '/api/music-library/bootstrap', method: 'GET', access: 'fan', reason: 'Lean vault catalog bootstrap' },
  { path: '/api/music-library/browse', method: 'GET', access: 'fan', reason: 'Vault browse' },
  { path: '/api/music-library/catalog-version/stream', method: 'GET', access: 'fan', reason: 'SSE catalog publish version' },
  { path: '/api/music-library/backfill-folder-artwork', method: 'POST', access: 'admin_write', reason: 'Backfill folder covers from tracks' },
  { path: '/api/music-library/sync-artwork', method: 'POST', access: 'admin_write', reason: 'Persist all collection covers to the database' },
  { path: '/api/music-library/tracks', method: 'GET', access: 'fan', reason: 'Vault track list' },
  { path: '/api/music-library/tracks', method: 'POST', access: 'admin_write', reason: 'Create library track' },
  { path: '/api/music-library/tracks', method: 'PUT', access: 'admin_write', reason: 'Update library track' },
  { path: '/api/music-library/tracks', method: 'DELETE', access: 'admin_write', reason: 'Delete library track' },
  { path: '/api/music-library/folders/move', method: 'POST', access: 'admin_write', reason: 'Move library folder' },
  { path: '/api/music-library/wav-root', method: 'GET', access: 'admin_read', reason: 'Local WAV files root path' },
  { path: '/api/music-library/wav-root', method: 'POST', access: 'admin_write', reason: 'Reveal local WAV files root in Finder' },
  { path: '/api/music-library/sync-all-data', method: 'POST', access: 'admin_write', reason: 'Bulk sync library metadata' },
  { path: '/api/music-library/build-sonic-dna-cache', method: 'POST', access: 'admin_write', reason: 'Build Sonic DNA cache' },
  { path: '/api/music-library/build-sonic-dna-cache', method: 'GET', access: 'admin_read', reason: 'Sonic DNA cache stats' },
  { path: '/api/music-library/smart-playlists', method: 'GET', access: 'fan', reason: 'Vault smart playlists' },
  { path: '/api/music-library/smart-playlists', method: 'POST', access: 'admin_write', reason: 'Create smart playlist' },
  { path: '/api/music-library/smart-playlists', method: 'DELETE', access: 'admin_write', reason: 'Delete smart playlist' },
  { path: '/api/music-library/rate', method: 'POST', access: 'admin_write', reason: 'Rate library track' },
  { path: '/api/music-library/play', method: 'POST', access: 'public', reason: 'Play tracking (rate-limited)' },
  { path: '/api/music-library/play', method: 'GET', access: 'fan', reason: 'Play history (vault)' },
  { path: '/api/supabase-check', method: 'GET', access: 'admin_read', reason: 'Supabase diagnostics' },

  // SoundCloud-style share links + embeds
  { path: '/api/shares', method: 'POST', access: 'admin_write', reason: 'Create/reuse music share link' },
  { path: '/api/shares/[token]', method: 'GET', access: 'public', reason: 'Resolve share listen/embed payload' },
  { path: '/api/shares/[token]', method: 'DELETE', access: 'admin_write', reason: 'Revoke share link' },
  { path: '/api/shares/artwork-proxy', method: 'GET', access: 'public', reason: 'Same-origin artwork proxy for accent sampling and story canvas' },
  { path: '/api/shares/[token]/download/access', method: 'GET', access: 'admin_read', reason: 'List emails allowed to download a share' },
  { path: '/api/shares/[token]/download/access', method: 'PUT', access: 'admin_write', reason: 'Set who can download a share and optionally email them' },
  { path: '/api/shares/[token]/download', method: 'GET', access: 'public', reason: 'Download page payload; files only after an invited email is verified' },
  { path: '/api/shares/[token]/download', method: 'POST', access: 'public', reason: 'Email a private open link when the address is on the allowlist' },
  { path: '/api/shares/[token]/download/open', method: 'GET', access: 'public', reason: 'Verify an emailed download code and set the access cookie' },
  { path: '/api/shares/[token]/file', method: 'GET', access: 'public', reason: 'Download one invited track (cookie or admin)' },
  { path: '/api/shares/[token]/pack', method: 'GET', access: 'public', reason: 'Zip download of an invited EP (cookie or admin)' },
  { path: '/api/shares/[token]/facebook-card', method: 'POST', access: 'admin_write', reason: 'Build the playable Facebook timeline card for a share' },
  { path: '/api/shares/[token]/facebook-card', method: 'GET', access: 'public', reason: 'Playable timeline video for a share link' },
  { path: '/api/oembed', method: 'GET', access: 'public', reason: 'oEmbed for share listen URLs' },

  // Release Collab (studio thread + magic-link portal + Resend webhooks)
  { path: '/api/studio/distrokid/queue', method: 'GET', access: 'admin_read', reason: 'Scheduled DistroKid upload queue' },
  { path: '/api/studio/releases/[id]/distrokid', method: 'GET', access: 'admin_read', reason: 'DistroKid upload packet for one release' },
  { path: '/api/studio/releases/[id]/distrokid', method: 'POST', access: 'admin_write', reason: 'Queue, mark submitted, or mark live on DistroKid' },
  { path: '/api/studio/releases/[id]/distrokid/pull', method: 'POST', access: 'admin_write', reason: 'Pull DistroKid album ISRCs onto the release' },
  { path: '/api/studio/royalties/pull', method: 'GET', access: 'admin_read', reason: 'Which royalty sources can be pulled from an official API' },
  { path: '/api/studio/royalties/pull', method: 'POST', access: 'admin_write', reason: 'Pull Meta ad spend or Facebook creator earnings into the ledger' },
  { path: '/api/studio/collab', method: 'GET', access: 'admin_read', reason: 'Release Collab hub overview' },
  { path: '/api/studio/releases/[id]/collab', method: 'GET', access: 'admin_read', reason: 'Release Collab bundle' },
  { path: '/api/studio/releases/[id]/collab/collaborators', method: 'POST', access: 'admin_write', reason: 'Add/update release collaborator' },
  { path: '/api/studio/releases/[id]/collab/collaborators', method: 'DELETE', access: 'admin_write', reason: 'Remove release collaborator' },
  { path: '/api/studio/releases/[id]/collab/messages', method: 'POST', access: 'admin_write', reason: 'Post studio collab message (+ optional email notify)' },
  { path: '/api/studio/releases/[id]/collab/invites', method: 'POST', access: 'admin_write', reason: 'Send magic-link review invite' },
  { path: '/api/studio/releases/[id]/collab/email', method: 'POST', access: 'admin_write', reason: 'Send collab hub email to collaborators' },
  { path: '/api/collab/[token]', method: 'GET', access: 'public', reason: 'Magic-link review portal payload' },
  { path: '/api/collab/[token]', method: 'POST', access: 'public', reason: 'Collaborator message or approve/request changes' },
  { path: '/api/webhooks/resend', method: 'POST', access: 'public', reason: 'Resend delivery/open/bounce + inbound email.received for Release Collab' },
  { path: '/api/studio/releases/[id]/social-promo/share', method: 'POST', access: 'admin_write', reason: 'Create or reuse a collaborator promo schedule link' },
  { path: '/api/studio/social-promo/share', method: 'POST', access: 'admin_write', reason: 'Copy the collaborator promo link from a release or vault folder' },
  { path: '/api/promo/[token]', method: 'GET', access: 'public', reason: 'Collaborator promo schedule. No Meta connection or publish controls.' },

  { path: '/api/licensing/inquiries', method: 'POST', access: 'public', reason: 'Submit a sync or custom-production inquiry' },
  { path: '/api/licensing/confirm', method: 'GET', access: 'public', reason: 'Confirm a licensing inquiry email' },
  { path: '/api/licensing/desk/[token]', method: 'GET', access: 'public', reason: 'Client licensing desk by secret token' },
  { path: '/api/licensing/desk/[token]', method: 'POST', access: 'public', reason: 'Accept a licensing quote from the desk token' },
  { path: '/api/licensing/checkout', method: 'POST', access: 'public', reason: 'Stripe Checkout for an accepted licensing quote' },
  { path: '/api/licensing/verify/[publicId]', method: 'GET', access: 'public', reason: 'Public license status without fee or contract' },
  { path: '/api/admin/licensing/inquiries', method: 'GET', access: 'admin_read', reason: 'List sync licensing inquiries' },
  { path: '/api/admin/licensing/inquiries/[id]', method: 'POST', access: 'admin_write', reason: 'Verify, quote, or activate a licensing inquiry' },
  { path: '/api/admin/licensing/operator', method: 'POST', access: 'admin_write', reason: 'Record copyright owner or Stripe account name for licensing' },

  { path: '/api/admin/merch/designs', method: 'GET', access: 'admin_read', reason: 'List fitting-room merch designs' },
  { path: '/api/admin/merch/designs', method: 'POST', access: 'admin_write', reason: 'Save a fitting-room merch design' },
  { path: '/api/admin/merch/designs/[id]/publish', method: 'POST', access: 'admin_write', reason: 'Send a merch design to Printful and keep it hidden' },
  { path: '/api/admin/merch/designs/[id]/visibility', method: 'POST', access: 'admin_write', reason: 'Show or hide a designed merch product' },
  { path: '/api/admin/merch/designs/[id]/mockups', method: 'GET', access: 'admin_read', reason: 'Poll Printful mockup photos for a design' },
  {
    path: '/api/admin/merch/art',
    method: 'GET',
    access: 'admin_read',
    reason: 'List merch art uploads for the fitting room',
  },
  { path: '/api/admin/merch/art', method: 'POST', access: 'admin_write', reason: 'Upload merch artwork or a baked print file' },
  { path: '/api/admin/merch/art', method: 'DELETE', access: 'admin_write', reason: 'Remove an unused merch art upload from the fitting room' },
  { path: '/api/admin/merch/art-sources', method: 'GET', access: 'admin_read', reason: 'Gallery and release art for the fitting room' },
  { path: '/api/admin/merch/catalog', method: 'GET', access: 'admin_read', reason: 'Browse cached Printful catalog for SERGWEAR' },
  { path: '/api/admin/merch/catalog/categories', method: 'GET', access: 'admin_read', reason: 'Printful catalog category tree for SERGWEAR' },
  { path: '/api/admin/merch/catalog', method: 'POST', access: 'admin_write', reason: 'Refresh Printful catalog cache for SERGWEAR' },
  { path: '/api/admin/merch/catalog/[id]', method: 'GET', access: 'admin_read', reason: 'Printful catalog product detail for SERGWEAR' },
  {
    path: '/api/admin/merch/catalog/[id]/mockup',
    method: 'POST',
    access: 'admin_write',
    reason: 'Request Printful mockup generator task for catalog preview',
  },
  { path: '/api/admin/merch/printful-status', method: 'GET', access: 'admin_read', reason: 'Printful env and catalog readiness for SERGWEAR' },
  { path: '/api/admin/merch/sync', method: 'POST', access: 'admin_write', reason: 'Sync Printful store products to merch-products.json' },
  { path: '/api/merch/art/[id]', method: 'GET', access: 'public', reason: 'Public merch print file' },
  { path: '/api/admin/ai/browser', method: 'POST', access: 'admin_write', reason: 'Drive the Admin browser, or mint a pass for the Mac dev server' },
  { path: '/api/local/admin-browser', method: 'POST', access: 'admin_write', reason: 'Loopback Admin browser. Requires a pass minted by a signed-in admin. Refused on Vercel.' },
] as const

export function getPrivilegedAudioPolicies(): RoutePolicyEntry[] {
  return ROUTE_POLICIES.filter(
    (entry) =>
      entry.path.startsWith('/api/audio/') &&
      (entry.access === 'admin_read' || entry.access === 'admin_write')
  )
}

export function getPrivilegedMusicLibraryPolicies(): RoutePolicyEntry[] {
  return ROUTE_POLICIES.filter(
    (entry) =>
      entry.path.startsWith('/api/music-library/') &&
      (entry.access === 'admin_read' || entry.access === 'admin_write')
  )
}

export function findRoutePolicy(
  path: string,
  method: RoutePolicyEntry['method']
): RoutePolicyEntry | null {
  return ROUTE_POLICIES.find((entry) => entry.path === path && entry.method === method) ?? null
}

/**
 * API-route admin guard. Returns a 401 response instead of throwing
 * (unlike {@link requireAdmin} in lib/auth.ts which is for server components).
 */
export async function requireAdminApi(): Promise<AdminGuardResult> {
  const session = await getServerSession()
  if (!session?.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized', code: 'ADMIN_REQUIRED' },
        { status: 401 }
      ),
    }
  }
  return { ok: true, session }
}

/** Reject likely secret-bearing attachment filenames before they reach LLM providers. */
export function isSecretBearingAttachmentName(filename: string): boolean {
  const name = filename.trim().toLowerCase()
  if (!name) return false
  return (
    name === '.env' ||
    name.startsWith('.env.') ||
    name.endsWith('.pem') ||
    name.endsWith('.key') ||
    name.includes('id_rsa') ||
    name.includes('credentials') ||
    name.includes('service_account') ||
    name.endsWith('.p12') ||
    name.endsWith('.pfx')
  )
}
