/** Standardized async UI state model for data surfaces. */

export type AsyncStatus =
  | 'idle'
  | 'loading'
  | 'empty'
  | 'partial'
  | 'stale'
  | 'error'
  | 'retrying'
  | 'success'

export type AsyncState<T> = {
  status: AsyncStatus
  data: T | null
  error: string | null
  updatedAt: number | null
}

export function createAsyncState<T>(initial: T | null = null): AsyncState<T> {
  return {
    status: initial == null ? 'idle' : 'success',
    data: initial,
    error: null,
    updatedAt: initial == null ? null : Date.now(),
  }
}

export function toLoadingState<T>(prev: AsyncState<T>): AsyncState<T> {
  return {
    ...prev,
    status: prev.data != null ? 'stale' : 'loading',
    error: null,
  }
}

export function toSuccessState<T>(data: T): AsyncState<T> {
  let empty = data == null || (Array.isArray(data) && data.length === 0)
  if (!empty && typeof data === 'object' && data !== null && 'items' in data) {
    const items = (data as { items?: unknown }).items
    empty = Array.isArray(items) && items.length === 0
  }

  return {
    status: empty ? 'empty' : 'success',
    data,
    error: null,
    updatedAt: Date.now(),
  }
}

export function toErrorState<T>(prev: AsyncState<T>, error: string): AsyncState<T> {
  return {
    ...prev,
    status: 'error',
    error,
  }
}

export function toRetryingState<T>(prev: AsyncState<T>): AsyncState<T> {
  return {
    ...prev,
    status: 'retrying',
    error: null,
  }
}
