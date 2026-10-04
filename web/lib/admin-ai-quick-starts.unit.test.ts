import { describe, expect, it } from 'vitest'
import {
  buildCreativeSuggestionPool,
  buildPrioritySuggestionPool,
  CREATIVE_QUICK_START_VISIBLE_COUNT,
  PRIORITY_QUICK_START_VISIBLE_COUNT,
  collectSessionUnfinishedBusiness,
  collectUnfinishedBusinessFromSessions,
  groupQuickStartHistoryByField,
  quickStartHistoryFieldLabel,
  UNFINISHED_SKIPPED_MIN_SCORE,
  createInitialCreativeQuickStartState,
  createInitialPlaybookQuickStartState,
  createInitialPriorityQuickStartState,
  createInitialUnfinishedBusinessViewState,
  pickVisibleUnfinishedBusiness,
  refreshPlaybookQuickStartState,
  refreshUnfinishedBusinessViewState,
  filterHighPriorityPool,
  HIGH_PRIORITY_MIN_SCORE,
  isFreshAdminChat,
  isLegacyAdminAiIntro,
  markCreativeQuickStartAttended,
  markPriorityQuickStartAttended,
  refreshCreativeQuickStartState,
  refreshPriorityQuickStartState,
  sanitizeAdminChatMessagesForDisplay,
  selectFreshPrioritySuggestions,
} from '@/lib/admin-ai-quick-starts'

describe('admin-ai-quick-starts', () => {
  it('detects legacy intro and fresh chat', () => {
    expect(isLegacyAdminAiIntro('How can I help? `/exec <tool> foo')).toBe(true)
    expect(
      isFreshAdminChat([
        { role: 'assistant', content: 'How can I help? `/exec <tool> foo' },
      ]),
    ).toBe(true)
    expect(sanitizeAdminChatMessagesForDisplay([{ role: 'user', content: 'hi' }])).toHaveLength(1)
  })

  it('returns high-priority pool with studio release context', () => {
    const pool = buildPrioritySuggestionPool({
      surface: 'studio',
      pathname: '/studio/releases/r1',
      studio: {
        releaseId: 'release-r1',
        title: 'Test EP',
        activeStep: 'copy',
        blockers: ['Missing ISRC'],
      },
    })
    const high = filterHighPriorityPool(pool)
    expect(high.every((r) => (r.priorityScore ?? 0) >= HIGH_PRIORITY_MIN_SCORE)).toBe(true)
    expect(high.some((r) => r.id.includes('copy-desk'))).toBe(true)
    expect(pool.some((r) => r.detail.startsWith('Because Test EP'))).toBe(true)
  })

  it('picks four fresh priorities and refresh marks ignored without repeating current', () => {
    const pool = filterHighPriorityPool(buildPrioritySuggestionPool(null))
    expect(pool.length).toBeGreaterThan(PRIORITY_QUICK_START_VISIBLE_COUNT)

    let state = createInitialPriorityQuickStartState(pool, 'session-1')
    expect(state.current).toHaveLength(PRIORITY_QUICK_START_VISIBLE_COUNT)
    const firstIds = state.current.map((r) => r.id)

    state = refreshPriorityQuickStartState(state, pool, 'session-1')
    expect(state.current).toHaveLength(PRIORITY_QUICK_START_VISIBLE_COUNT)
    expect(state.ignored.filter((e) => e.status === 'ignored').length).toBeGreaterThanOrEqual(
      PRIORITY_QUICK_START_VISIBLE_COUNT,
    )
    const newIds = state.current.filter((r) => !firstIds.includes(r.id))
    expect(newIds.length).toBeGreaterThan(0)
    if (pool.length >= PRIORITY_QUICK_START_VISIBLE_COUNT * 2) {
      expect(newIds).toHaveLength(PRIORITY_QUICK_START_VISIBLE_COUNT)
    }
  })

  it('never repeats attended ids on refresh', () => {
    const pool = filterHighPriorityPool(buildPrioritySuggestionPool(null))
    let state = createInitialPriorityQuickStartState(pool, 'session-2')
    const attended = state.current[0]!
    state = markPriorityQuickStartAttended(state, attended)

    state = refreshPriorityQuickStartState(state, pool, 'session-2')
    expect(state.current.every((r) => r.id !== attended.id)).toBe(true)
  })

  it('creative quick starts stay at four per session with impact scores', () => {
    const pool = buildCreativeSuggestionPool(null)
    const state = createInitialCreativeQuickStartState(pool, 'session-c')
    expect(state.current).toHaveLength(CREATIVE_QUICK_START_VISIBLE_COUNT)
    expect(state.current.every((r) => r.kind === 'creative' && (r.priorityScore ?? 0) >= 1)).toBe(true)
  })

  it('refresh creative marks ignored and picks fresh ids', () => {
    const pool = buildCreativeSuggestionPool(null)
    expect(pool.length).toBeGreaterThan(CREATIVE_QUICK_START_VISIBLE_COUNT)
    let state = createInitialCreativeQuickStartState(pool, 'session-cr')
    const firstIds = state.current.map((r) => r.id)
    state = refreshCreativeQuickStartState(state, pool, 'session-cr')
    expect(state.current).toHaveLength(CREATIVE_QUICK_START_VISIBLE_COUNT)
    for (const id of state.current.map((r) => r.id)) {
      expect(firstIds).not.toContain(id)
    }
  })

  it('creative attend removes id from rotation', () => {
    const pool = buildCreativeSuggestionPool(null)
    let state = createInitialCreativeQuickStartState(pool, 'session-ca')
    const attended = state.current[0]!
    state = markCreativeQuickStartAttended(state, attended)
    state = refreshCreativeQuickStartState(state, pool, 'session-ca')
    expect(state.current.every((r) => r.id !== attended.id)).toBe(true)
  })

  it('collects unfinished business from started and high-score skipped', () => {
    const priority = {
      current: [],
      attended: [
        {
          id: 'p1',
          label: 'P1',
          detail: '',
          message: '/exec foo',
          skillId: 'studio_release',
          priorityScore: 9,
          at: 10,
          status: 'attended' as const,
        },
      ],
      ignored: [
        {
          id: 'p2',
          label: 'P2',
          detail: '',
          message: '/exec bar',
          skillId: 'admin_intel',
          priorityScore: UNFINISHED_SKIPPED_MIN_SCORE,
          at: 5,
          status: 'ignored' as const,
        },
        {
          id: 'p3',
          label: 'P3',
          detail: '',
          message: '',
          priorityScore: 5,
          at: 4,
          status: 'ignored' as const,
        },
      ],
      refreshCount: 1,
    }
    const rows = collectSessionUnfinishedBusiness(priority, undefined, new Set())
    expect(rows).toHaveLength(2)
    expect(rows.some((r) => r.unfinishedReason === 'started')).toBe(true)
    expect(rows.some((r) => r.id === 'p2' && r.unfinishedReason === 'skipped')).toBe(true)
    expect(rows.some((r) => r.id === 'p3')).toBe(false)
  })

  it('merges unfinished across sessions', () => {
    const merged = collectUnfinishedBusinessFromSessions(
      [
        {
          priorityQuickStart: {
            current: [],
            attended: [
              {
                id: 'shared',
                label: 'Shared',
                detail: '',
                message: '',
                priorityScore: 8,
                at: 1,
                status: 'attended',
              },
            ],
            ignored: [],
            refreshCount: 0,
          },
        },
        {
          creativeQuickStart: {
            current: [],
            attended: [
              {
                id: 'shared',
                label: 'Shared newer',
                detail: '',
                message: '',
                priorityScore: 9,
                at: 99,
                status: 'attended',
              },
            ],
            ignored: [],
            refreshCount: 0,
          },
        },
      ],
      new Set(),
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.at).toBe(99)
  })

  it('groups history by skill field labels', () => {
    const groups = groupQuickStartHistoryByField([
      {
        id: 'a',
        label: 'A',
        detail: '',
        message: '',
        skillId: 'studio_release',
        priorityScore: 8,
        at: 1,
        status: 'attended',
      },
      {
        id: 'b',
        label: 'B',
        detail: '',
        message: '',
        skillId: 'growth_marketing',
        priorityScore: 7,
        at: 2,
        status: 'attended',
      },
      {
        id: 'c',
        label: 'C',
        detail: '',
        message: '',
        skillId: 'studio_release',
        priorityScore: 9,
        at: 3,
        status: 'ignored',
      },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]!.fieldLabel).toBe(quickStartHistoryFieldLabel('studio_release'))
    expect(groups[0]!.entries).toHaveLength(2)
  })

  it('studio context adds contextual explore rows', () => {
    const pool = buildCreativeSuggestionPool({
      surface: 'studio',
      pathname: '/studio/releases/r1',
      studio: { releaseId: 'r1', title: 'EP', activeStep: 'copy' },
    })
    expect(pool.some((r) => r.id.includes('creative-release-copy-variants'))).toBe(true)
  })

  it('selectFreshPrioritySuggestions respects exclude set when enough candidates remain', () => {
    const pool = filterHighPriorityPool(buildPrioritySuggestionPool(null))
    expect(pool.length).toBeGreaterThan(3)
    const exclude = new Set(pool.slice(0, 2).map((p) => p.id))
    const { picks, poolExhausted } = selectFreshPrioritySuggestions(pool, 2, {
      seed: 'x',
      excludeIds: exclude,
      attendedIds: new Set(),
    })
    expect(poolExhausted).toBe(false)
    expect(picks.every((p) => !exclude.has(p.id))).toBe(true)
  })

  it('rotates visible unfinished business on refresh', () => {
    const all = Array.from({ length: 8 }, (_, i) => ({
      id: `uf-${i}`,
      label: `Item ${i}`,
      detail: 'detail',
      message: 'msg',
      skillId: 'general',
      priorityScore: 8,
      at: i,
      kind: 'priority' as const,
      unfinishedReason: 'started' as const,
    }))
    const view = createInitialUnfinishedBusinessViewState()
    const first = pickVisibleUnfinishedBusiness(all, view, 'sess-a')
    const { view: nextView, visible: second } = refreshUnfinishedBusinessViewState(all, view, 'sess-a')
    expect(second.length).toBeGreaterThan(0)
    if (first.length === second.length && first.length > 0) {
      const sameOrder = first.every((row, idx) => row.id === second[idx]?.id)
      expect(sameOrder || nextView.refreshCount).toBeGreaterThan(0)
    }
  })

  it('playbook quick-start refresh rotates like priority pool', () => {
    const pool = Array.from({ length: 6 }, (_, i) => ({
      id: `playbook:pb-${i}`,
      kind: 'playbook' as const,
      label: `Playbook ${i}`,
      detail: 'd',
      message: 'm',
      skillId: 'general',
      priorityScore: 7,
    }))
    let state = createInitialPlaybookQuickStartState(pool, 'sess-pb')
    expect(state.current).toHaveLength(3)
    const before = state.current.map((r) => r.id)
    state = refreshPlaybookQuickStartState(state, pool, 'sess-pb')
    expect(state.current.some((r) => !before.includes(r.id))).toBe(true)
  })
})
