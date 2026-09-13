import { describe, expect, it } from 'vitest'
import { buildSessionTuningPrompt, parseAdminChatEnergyPreset, parseAdminChatHonestyMode } from '@/lib/ai/admin-chat-session-tuning'

describe('parseAdminChatHonestyMode', () => {
  it('accepts known values', () => {
    expect(parseAdminChatHonestyMode('strict')).toBe('strict')
    expect(parseAdminChatHonestyMode('relaxed')).toBe('relaxed')
    expect(parseAdminChatHonestyMode('nope')).toBe(null)
  })
})

describe('parseAdminChatEnergyPreset', () => {
  it('accepts known values', () => {
    expect(parseAdminChatEnergyPreset('tour_prep')).toBe('tour_prep')
    expect(parseAdminChatEnergyPreset('bad')).toBe(null)
  })
})

describe('buildSessionTuningPrompt', () => {
  it('returns null when nothing selected', () => {
    expect(buildSessionTuningPrompt(null, null)).toBe(null)
  })

  it('includes strict and energy lines when set', () => {
    const t = buildSessionTuningPrompt('strict', 'launch_day')
    expect(t).toContain('Session honesty: strict')
    expect(t).toContain('Session energy: launch day')
  })
})
