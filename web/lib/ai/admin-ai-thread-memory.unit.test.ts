import { describe, expect, it } from 'vitest'
import {
  formatThreadMemoryForPrompt,
  factsFromTurn,
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
    const withSummary = mergeThreadMemory(next, { summary: 'UPC still empty on DistroKid.' })
    expect(formatThreadMemoryForPrompt(withSummary)).toContain('UPC still empty')
    const facts = factsFromTurn({
      userText: 'Read the planner',
      assistantText: 'buildExecutionPlan lives in planner.ts. Should I open the callers?',
      toolBodies: ['{"path":"web/lib/ai/planner.ts","upc":"012345678905","isrc":"QTA532512345"}'],
      previous: withSummary,
    })
    expect(facts.codes).toEqual(expect.arrayContaining(['QTA532512345', '012345678905']))
    expect(facts.citedFiles?.some((file) => file.endsWith('planner.ts'))).toBe(true)
    expect(facts.openQuestion).toMatch(/callers/)
  })
})
