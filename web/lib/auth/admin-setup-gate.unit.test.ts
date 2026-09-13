import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { gateAdminPublicSetup, resolveSetupSupabaseCredentials } from '@/lib/auth/admin-setup-gate'

describe('admin-setup-gate', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('blocks when ADMIN_PUBLIC_SETUP_DISABLED=1', () => {
    vi.stubEnv('ADMIN_PUBLIC_SETUP_DISABLED', '1')
    vi.stubEnv('NODE_ENV', 'development')
    const req = new NextRequest('http://localhost/api/admin/setup/create-admin', { method: 'POST' })
    const gate = gateAdminPublicSetup(req)
    expect(gate.ok).toBe(false)
  })

  it('blocks production without setup token', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_PUBLIC_SETUP_DISABLED', '0')
    const req = new NextRequest('http://localhost/api/admin/setup/create-admin', { method: 'POST' })
    const gate = gateAdminPublicSetup(req)
    expect(gate.ok).toBe(false)
  })

  it('allows production with matching setup token', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_PUBLIC_SETUP_DISABLED', '0')
    vi.stubEnv('ADMIN_SETUP_TOKEN', 'secret-token')
    const req = new NextRequest('http://localhost/api/admin/setup/create-admin', {
      method: 'POST',
      headers: { 'x-admin-setup-token': 'secret-token' },
    })
    const gate = gateAdminPublicSetup(req)
    expect(gate.ok).toBe(true)
  })

  it('prefers server credentials in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    const creds = resolveSetupSupabaseCredentials({
      supabaseUrl: 'https://evil.example',
      supabaseAnonKey: 'evil-anon',
      supabaseServiceKey: 'evil-service',
    })
    expect(creds.ok).toBe(true)
    if (creds.ok) {
      expect(creds.url).toBe('https://example.supabase.co')
      expect(creds.serviceKey).toBe('service')
    }
  })
})
