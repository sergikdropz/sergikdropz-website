import { afterEach, describe, expect, it } from 'vitest'
import {
  mintAdminBrowserBridgeTicket,
  verifyAdminBrowserBridgeTicket,
} from '@/lib/ai/admin-browser-bridge'
import { isAdminBrowserBridgeOrigin } from '@/lib/ai/admin-browser-bridge-shared'

const previous = process.env.SUPABASE_SERVICE_ROLE_KEY

afterEach(() => {
  if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previous
})

describe('admin browser bridge', () => {
  it('accepts only the public site as a caller', () => {
    expect(isAdminBrowserBridgeOrigin('https://sergikdropz.com')).toBe(true)
    expect(isAdminBrowserBridgeOrigin('https://www.sergikdropz.com')).toBe(true)
    expect(isAdminBrowserBridgeOrigin('https://evil.example')).toBe(false)
    expect(isAdminBrowserBridgeOrigin(null)).toBe(false)
  })

  it('mints a pass this Mac can verify', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    const ticket = mintAdminBrowserBridgeTicket('admin-1')
    expect(ticket).toBeTruthy()
    expect(verifyAdminBrowserBridgeTicket(ticket || '')).toEqual({ ok: true, sub: 'admin-1' })
    expect(verifyAdminBrowserBridgeTicket(`${ticket}x`).ok).toBe(false)
  })

  it('rejects a pass when the Mac has no matching key', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'one'
    const ticket = mintAdminBrowserBridgeTicket('admin-1')
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'two'
    expect(verifyAdminBrowserBridgeTicket(ticket || '').ok).toBe(false)
  })
})
