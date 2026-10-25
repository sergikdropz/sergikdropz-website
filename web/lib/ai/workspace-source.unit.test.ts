import { describe, expect, it } from 'vitest'
import { readWorkspaceFile, resolveWorkspaceFile, searchWorkspace } from '@/lib/ai/workspace-source'

describe('workspace source', () => {
  it('reads a file under web/ and numbers the lines', () => {
    const result = readWorkspaceFile('lib/ai/planner.ts', 1, 5)
    expect(result.path).toMatch(/web\/lib\/ai\/planner\.ts$/)
    expect(result.text?.startsWith('1|')).toBe(true)
    expect(result.action).toBe('read')
  })

  it('rejects paths that leave the workspace', () => {
    expect(resolveWorkspaceFile('../.env')).toEqual({ error: 'Path cannot leave web/ or knowledge/.' })
    const escaped = resolveWorkspaceFile('lib/../../.env.local')
    expect('error' in escaped).toBe(true)
  })

  it('finds a known symbol in the repo', () => {
    const result = searchWorkspace('buildExecutionPlan')
    expect(result.matches?.some((match) => match.path.endsWith('planner.ts'))).toBe(true)
    expect(result.definition?.text).toMatch(/buildExecutionPlan/)
    expect(result.generatedAt).toBeTruthy()
  })
})
