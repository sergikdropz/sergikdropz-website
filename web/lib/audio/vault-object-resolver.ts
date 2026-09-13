/**
 * Which extension of a vault asset actually exists on R2.
 *
 * The catalog stores `.mp3` for masters that were only ever uploaded as `.wav`
 * or `.m4a`. Without this, every range request re-walks the miss chain
 * (mp3 404 → m4a 404 → wav hit), which more than doubles streaming latency.
 *
 * Probes run in parallel and results are cached, so a track pays the lookup
 * once instead of on every seek.
 */

import { getR2MediaConfig, r2ObjectExists } from '@/lib/audio/r2Media'
import { vaultRelativePathCandidates } from '@/lib/audio/vault-audio-extensions'

const HIT_TTL_MS = 10 * 60_000
/** Short, so a freshly uploaded object is picked up without a redeploy. */
const MISS_TTL_MS = 30_000

type Entry = { value: string | null; expiresAt: number }

const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<string | null>>()

function readCache(key: string): Entry | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    cache.delete(key)
    return null
  }
  return hit
}

function writeCache(key: string, value: string | null) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS),
  })
}

async function probe(relative: string): Promise<string | null> {
  const candidates = vaultRelativePathCandidates(relative)
  // Probe together, then honour candidate order — one round trip, not four.
  const found = await Promise.all(candidates.map((c) => r2ObjectExists(c)))
  const index = found.findIndex(Boolean)
  return index >= 0 ? candidates[index] : null
}

/**
 * Vault-relative path that exists on R2, or null when no extension matches.
 * Returns the input unchanged when R2 is not configured (local/dev serving).
 */
export async function resolveVaultObjectPath(relative: string): Promise<string | null> {
  if (!relative) return null
  if (!getR2MediaConfig()) return relative

  const cached = readCache(relative)
  if (cached) return cached.value

  const pending = inFlight.get(relative)
  if (pending) return pending

  const task = probe(relative)
    .then((value) => {
      writeCache(relative, value)
      return value
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(relative)
    })

  inFlight.set(relative, task)
  return task
}

/** Candidate order for a request, with the known-good path first. */
export async function orderedVaultCandidates(relative: string): Promise<string[]> {
  const resolved = await resolveVaultObjectPath(relative)
  const candidates = vaultRelativePathCandidates(relative)
  if (!resolved) return candidates
  return [resolved, ...candidates.filter((c) => c !== resolved)]
}

export function clearVaultObjectCache() {
  cache.clear()
  inFlight.clear()
}
