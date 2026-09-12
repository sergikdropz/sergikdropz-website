import { describe, expect, it } from 'vitest'
import {
  VAULT_UNLOCK_SOURCE,
  VAULT_UNLOCK_TAG,
  adminFanFromLead,
  fanInsertFromVaultUnlock,
  fanPatchFromVaultUnlock,
  isSyntheticFanEmail,
  mergeFansWithVaultLeads,
  normalizeFanTags,
  vaultUnlockSource,
} from '@/lib/fan-crm'

describe('fan CRM vault unlock mapping', () => {
  const now = '2026-09-04T00:00:00.000Z'

  it('defaults source to vault_unlock and tags the fan', () => {
    const row = fanInsertFromVaultUnlock(
      { email: 'fan@example.com', displayName: 'DJ Fan', source: null, campaign: 'drop-1' },
      now,
    )
    expect(row.source).toBe(VAULT_UNLOCK_SOURCE)
    expect(row.tags).toEqual([VAULT_UNLOCK_TAG])
    expect(row.name).toBe('DJ Fan')
    expect(row.last_engaged_at).toBe(now)
    expect(row.metadata).toEqual({ vault_unlocked: true, campaign: 'drop-1' })
  })

  it('keeps utm source on first unlock', () => {
    expect(vaultUnlockSource('instagram')).toBe('instagram')
    expect(fanInsertFromVaultUnlock(
      { email: 'a@b.com', displayName: null, source: 'instagram', campaign: null },
      now,
    ).source).toBe('instagram')
  })

  it('merges vault tag onto an existing contact-form fan without overwriting source', () => {
    const patch = fanPatchFromVaultUnlock(
      { name: 'Ada', source: 'contact_form', tags: ['booking'], metadata: { city: 'LA' } },
      { email: 'ada@example.com', displayName: 'Ada Lovelace', source: 'instagram', campaign: 'vault' },
      now,
    )
    expect(patch.source).toBe('contact_form')
    expect(patch.tags).toEqual(['booking', VAULT_UNLOCK_TAG])
    expect(patch.name).toBe('Ada')
    expect(patch.metadata).toEqual({ city: 'LA', vault_unlocked: true, campaign: 'vault' })
  })

  it('fills a blank name from the unlock form', () => {
    const patch = fanPatchFromVaultUnlock(
      { name: '  ', source: null, tags: [] },
      { email: 'x@y.com', displayName: 'New Name', source: null, campaign: null },
      now,
    )
    expect(patch.name).toBe('New Name')
    expect(patch.source).toBe(VAULT_UNLOCK_SOURCE)
  })

  it('normalizes JSONB / string tags', () => {
    expect(normalizeFanTags(['vault', 'vault', ''])).toEqual(['vault'])
    expect(normalizeFanTags('["vip"]')).toEqual(['vip'])
    expect(normalizeFanTags(null)).toEqual([])
  })

  it('does not treat Auto DJ / Playwright example unlocks as fans', () => {
    expect(isSyntheticFanEmail('e2e-autodj-1778000000000@example.com')).toBe(true)
    expect(isSyntheticFanEmail('e2e-vault-1@example.com')).toBe(true)
    expect(isSyntheticFanEmail('vault-probe-test@example.com')).toBe(true)
    expect(isSyntheticFanEmail('verify-sidebar-mosaic-1788640821070@example.com')).toBe(true)
    expect(isSyntheticFanEmail('carrascojanis1@gmail.com')).toBe(false)
  })

  it('maps a lead into the admin fan shape and merges missing unlocks', () => {
    const fromLead = adminFanFromLead({
      email: 'lead@example.com',
      display_name: 'Lead',
      source: null,
      first_unlock_at: '2026-01-01T00:00:00.000Z',
      last_unlock_at: '2026-02-01T00:00:00.000Z',
    })
    expect(fromLead.source).toBe(VAULT_UNLOCK_SOURCE)
    expect(fromLead.tags).toEqual([VAULT_UNLOCK_TAG])
    expect(fromLead.subscribed_at).toBe('2026-01-01T00:00:00.000Z')

    const merged = mergeFansWithVaultLeads(
      [{ email: 'already@example.com', created_at: '2026-03-01T00:00:00.000Z' }],
      [
        { email: 'already@example.com' },
        { email: 'lead@example.com', first_unlock_at: '2026-04-01T00:00:00.000Z' },
      ],
    )
    expect(merged.map((row) => row.email)).toEqual(['lead@example.com', 'already@example.com'])
  })
})
