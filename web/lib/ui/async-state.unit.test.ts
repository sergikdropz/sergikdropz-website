import { describe, expect, it } from 'vitest'
import {
  createAsyncState,
  toErrorState,
  toLoadingState,
  toRetryingState,
  toSuccessState,
} from '@/lib/ui/async-state'

describe('async-state helpers', () => {
  it('moves from idle to loading and success/empty', () => {
    const idle = createAsyncState<string[]>()
    expect(idle.status).toBe('idle')
    const loading = toLoadingState(idle)
    expect(loading.status).toBe('loading')
    expect(toSuccessState([]).status).toBe('empty')
    expect(toSuccessState(['a']).status).toBe('success')
  })

  it('preserves previous data as stale while reloading', () => {
    const success = toSuccessState(['track'])
    const stale = toLoadingState(success)
    expect(stale.status).toBe('stale')
    expect(stale.data).toEqual(['track'])
  })

  it('supports error and retrying transitions', () => {
    const base = toSuccessState(['x'])
    const errored = toErrorState(base, 'boom')
    expect(errored.status).toBe('error')
    expect(errored.error).toBe('boom')
    expect(toRetryingState(errored).status).toBe('retrying')
  })
})
