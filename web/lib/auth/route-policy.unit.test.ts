import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}))

import { getServerSession } from '@/lib/auth'
import {
  findRoutePolicy,
  getPrivilegedAudioPolicies,
  getPrivilegedMusicLibraryPolicies,
  isSecretBearingAttachmentName,
  requireAdminApi,
} from '@/lib/auth/route-policy'

describe('route-policy', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset()
  })

  it('lists privileged audio policies for anonymous-denial coverage', () => {
    const privileged = getPrivilegedAudioPolicies()
    expect(privileged.length).toBeGreaterThan(10)
    expect(privileged.every((p) => p.path.startsWith('/api/audio/'))).toBe(true)
    expect(findRoutePolicy('/api/audio/list', 'GET')?.access).toBe('admin_read')
    expect(findRoutePolicy('/api/audio/resolve', 'GET')?.access).toBe('public')
  })

  it('lists privileged music-library write policies', () => {
    const privileged = getPrivilegedMusicLibraryPolicies()
    expect(privileged.length).toBeGreaterThan(5)
    expect(findRoutePolicy('/api/music-library/folders/move', 'POST')?.access).toBe('admin_write')
    expect(findRoutePolicy('/api/music-library/play', 'POST')?.access).toBe('public')
    expect(findRoutePolicy('/api/supabase-check', 'GET')?.access).toBe('admin_read')
  })

  it('registers public share resolve and admin share create policies', () => {
    expect(findRoutePolicy('/api/shares', 'POST')?.access).toBe('admin_write')
    expect(findRoutePolicy('/api/shares/[token]', 'GET')?.access).toBe('public')
    expect(findRoutePolicy('/api/shares/[token]', 'DELETE')?.access).toBe('admin_write')
    expect(findRoutePolicy('/api/oembed', 'GET')?.access).toBe('public')
  })

  it('requireAdminApi denies missing or non-admin sessions with 401', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const denied = await requireAdminApi()
    expect(denied.ok).toBe(false)
    if (!denied.ok) {
      expect(denied.response.status).toBe(401)
      const body = await denied.response.json()
      expect(body.code).toBe('ADMIN_REQUIRED')
    }

    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'fan@example.com' },
      isAdmin: false,
    } as never)
    const nonAdmin = await requireAdminApi()
    expect(nonAdmin.ok).toBe(false)
  })

  it('requireAdminApi accepts admin sessions', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: 'admin-1', email: 'admin@example.com' },
      isAdmin: true,
    } as never)
    const allowed = await requireAdminApi()
    expect(allowed.ok).toBe(true)
    if (allowed.ok) {
      expect(allowed.session.user.id).toBe('admin-1')
    }
  })

  it('blocks secret-bearing attachment names', () => {
    expect(isSecretBearingAttachmentName('.env')).toBe(true)
    expect(isSecretBearingAttachmentName('.env.local')).toBe(true)
    expect(isSecretBearingAttachmentName('service_account.json')).toBe(true)
    expect(isSecretBearingAttachmentName('notes.md')).toBe(false)
  })
})
