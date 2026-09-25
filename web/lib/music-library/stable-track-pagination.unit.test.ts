import { describe, expect, it } from 'vitest'
import { applyStableTrackPaginationOrder } from './stable-track-pagination'

describe('applyStableTrackPaginationOrder', () => {
  it('appends title and id tie-breakers', () => {
    const calls: string[] = []
    const query = {
      order(column: string, options?: { ascending?: boolean }) {
        calls.push(`${column}:${options?.ascending === false ? 'desc' : 'asc'}`)
        return query
      },
    }
    applyStableTrackPaginationOrder(query, { column: 'display_order', ascending: true })
    expect(calls).toEqual(['display_order:asc', 'title:asc', 'id:asc'])
  })

  it('does not duplicate title when primary is title', () => {
    const calls: string[] = []
    const query = {
      order(column: string) {
        calls.push(column)
        return query
      },
    }
    applyStableTrackPaginationOrder(query, { column: 'title', ascending: true })
    expect(calls).toEqual(['title', 'id'])
  })
})
