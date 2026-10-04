import { describe, expect, it } from 'vitest'
import {
  formatThreadMemoryForPrompt,
  inferMemoryPatchFromTurn,
  mergeThreadMemory,
  emptyThreadMemory,
} from '@/lib/ai/admin-ai-thread-memory'

describe('admin-ai-thread-memory', () => {
  it('keeps goal and release sticky across merges', () => {
    const base = mergeThreadMemory(emptyThreadMemory(), {
      goal: 'Ship DistroKid upload',
      releaseId: 'r1',
      releaseTitle: 'Night Drive',
    })
    const next = mergeThreadMemory(base, { deskUrl: 'https://distrokid.com/new/', deskLabel: 'DistroKid' })
    expect(next.goal).toBe('Ship DistroKid upload')
    expect(next.deskLabel).toBe('DistroKid')
    expect(formatThreadMemoryForPrompt(next)).toContain('THREAD MEMORY')
    expect(inferMemoryPatchFromTurn({ message: 'Goal: finish metadata', releaseId: 'r1' }).goal).toMatch(
      /finish metadata/i,
    )
  })
})
