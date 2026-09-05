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
  { path: '/api/audio/resolve', method: 'GET', access: 'public', reason: 'Public playback URL resolution' },
  { path: '/api/audio/bpm', method: 'GET', access: 'public', reason: 'Public BPM lookup for player' },
  { path: '/api/audio/waveform', method: 'GET', access: 'public', reason: 'Public waveform for player' },
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
  { path: '/api/audio/reprocess-track', method: 'POST', access: 'admin_write', reason: 'Reprocess track' },
  { path: '/api/audio/artwork', method: 'POST', access: 'admin_write', reason: 'Artwork extraction/upload' },
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
