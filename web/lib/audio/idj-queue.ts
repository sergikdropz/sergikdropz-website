/** Unique-id queue walk. Pass `occupiedId` only when a deck must not land on that track. */

export type QueueNeighborTrack = { id: string }

export function nextQueueNeighbor<T extends QueueNeighborTrack>(
  queue: T[],
  currentId: string | null,
  occupiedId: string | null,
  direction: 1 | -1,
): T | null {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const track of queue) {
    if (!track?.id || seen.has(track.id)) continue
    seen.add(track.id)
    unique.push(track)
  }
  const pool = occupiedId ? unique.filter((track) => track.id !== occupiedId) : unique
  if (pool.length === 0) return null
  const idx = currentId ? pool.findIndex((track) => track.id === currentId) : -1
  const from = idx >= 0 ? idx : direction === 1 ? -1 : 0
  return pool[(from + direction + pool.length) % pool.length] ?? null
}
