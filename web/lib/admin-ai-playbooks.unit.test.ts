import { describe, expect, it } from 'vitest'
import { buildReleasePlaybooks, resolvePlaybooksForContext } from '@/lib/admin-ai-playbooks'

describe('admin ai playbooks', () => {
  it('builds release-scoped playbooks with exec steps', () => {
    const books = buildReleasePlaybooks('rel-1', 'Neon EP')
    expect(books.length).toBeGreaterThanOrEqual(3)
    expect(books[0]?.steps[0]?.tool).toBe('query_release_studio_snapshot')
    expect(books[0]?.steps[0]?.payload).toMatchObject({ releaseId: 'rel-1' })
  })

  it('includes pipeline playbook when studio context lacks release', () => {
    const books = resolvePlaybooksForContext({ surface: 'studio', pathname: '/studio' })
    expect(books.some((b) => b.id === 'playbook-pipeline-week')).toBe(true)
  })

  it('includes release playbooks when release is in context', () => {
    const books = resolvePlaybooksForContext({
      surface: 'studio',
      pathname: '/studio/releases/x',
      studio: {
        releaseId: 'rel-9',
        title: 'Test',
      },
    })
    expect(books.some((b) => b.id.startsWith('playbook-ship-'))).toBe(true)
  })
})
