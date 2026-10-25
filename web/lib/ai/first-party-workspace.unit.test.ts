import { describe, expect, it } from 'vitest'
import { firstPartyWorkspaceFromUrl } from '@/lib/ai/first-party-workspace'

describe('first-party workspace', () => {
  it('keeps the public site in the side browser', () => {
    expect(firstPartyWorkspaceFromUrl('https://sergikdropz.com/music')).toBeNull()
    expect(firstPartyWorkspaceFromUrl('http://localhost:3001/music')).toBeNull()
  })

  it('sends admin login back to the signed-in page', () => {
    const hit = firstPartyWorkspaceFromUrl('https://sergikdropz.com/admin/login')
    expect(hit?.releaseId).toBeNull()
    expect(hit?.message).toMatch(/Admin Login/)
  })

  it('reads a studio release and step from the open page', () => {
    const hit = firstPartyWorkspaceFromUrl(
      'http://localhost:3001/studio/releases/release-collection-unreleased-eps-sergik---stayi-mu5pzoor?step=metadata',
    )
    expect(hit?.releaseId).toBe('release-collection-unreleased-eps-sergik---stayi-mu5pzoor')
    expect(hit?.step).toBe('metadata')
    expect(hit?.message).toMatch(/step metadata/)
  })
})
