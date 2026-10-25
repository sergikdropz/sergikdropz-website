import { describe, expect, it } from 'vitest'
import {
  clampLedgerColumnWidth,
  reorderLedgerColumns,
  visibleLedgerColumns,
} from '@/lib/studio/royalties/ledger-columns'
import { nextLedgerSort } from '@/lib/studio/royalties/ledger-groups'

describe('ledger columns', () => {
  it('reorders a dragged header in front of the drop target', () => {
    expect(reorderLedgerColumns(['title', 'lines', 'amount', 'youtube'], 'youtube', 'lines')).toEqual([
      'title',
      'youtube',
      'lines',
      'amount',
    ])
  })

  it('keeps Title visible when optional columns are hidden', () => {
    expect(visibleLedgerColumns(['amount', 'title', 'lines', 'youtube'], new Set(['lines']))).toEqual([
      'title',
      'lines',
    ])
  })

  it('clamps a resized column', () => {
    expect(clampLedgerColumnWidth(12)).toBe(56)
    expect(clampLedgerColumnWidth(900)).toBe(480)
    expect(clampLedgerColumnWidth(120.4)).toBe(120)
  })

  it('toggles the active column and starts money columns high to low', () => {
    expect(nextLedgerSort({ field: 'amount', dir: 'desc' }, 'amount')).toEqual({
      field: 'amount',
      dir: 'asc',
    })
    expect(nextLedgerSort({ field: 'amount', dir: 'desc' }, 'title')).toEqual({
      field: 'title',
      dir: 'asc',
    })
    expect(nextLedgerSort({ field: 'title', dir: 'asc' }, 'youtubeAmount')).toEqual({
      field: 'youtubeAmount',
      dir: 'desc',
    })
  })
})
