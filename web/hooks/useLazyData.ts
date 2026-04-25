import { useState, useCallback } from 'react'
import { useSonicDna, useWaveform } from '@/hooks/useMusicData'

interface LazyDataState<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  isLoaded: boolean
}

export function useLazySonicDna(trackId: string) {
  const [state, setState] = useState<LazyDataState<any>>({
    data: null,
    isLoading: false,
    error: null,
    isLoaded: false,
  })

  const { data, isLoading, error, refetch } = useSonicDna(trackId, false)

  const load = useCallback(async () => {
    if (state.isLoaded || state.isLoading) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const result = await refetch()
      setState({
        data: result.data,
        isLoading: false,
        error: null,
        isLoaded: true,
      })
    } catch (err) {
      setState({
        data: null,
        isLoading: false,
        error: err as Error,
        isLoaded: true,
      })
    }
  }, [trackId, refetch, state.isLoaded, state.isLoading])

  return {
    ...state,
    load,
    // Auto-load if data becomes available from cache
    data: data || state.data,
    isLoading: isLoading || state.isLoading,
    error: error || state.error,
  }
}

export function useLazyWaveform(trackId: string) {
  const [state, setState] = useState<LazyDataState<any>>({
    data: null,
    isLoading: false,
    error: null,
    isLoaded: false,
  })

  const { data, isLoading, error, refetch } = useWaveform(trackId, false)

  const load = useCallback(async () => {
    if (state.isLoaded || state.isLoading) return

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const result = await refetch()
      setState({
        data: result.data,
        isLoading: false,
        error: null,
        isLoaded: true,
      })
    } catch (err) {
      setState({
        data: null,
        isLoading: false,
        error: err as Error,
        isLoaded: true,
      })
    }
  }, [trackId, refetch, state.isLoaded, state.isLoading])

  return {
    ...state,
    load,
    // Auto-load if data becomes available from cache
    data: data || state.data,
    isLoading: isLoading || state.isLoading,
    error: error || state.error,
  }
}

// Combined hook for both sonic DNA and waveform
export function useLazyTrackAnalysis(trackId: string) {
  const sonicDna = useLazySonicDna(trackId)
  const waveform = useLazyWaveform(trackId)

  const loadAll = useCallback(async () => {
    await Promise.all([sonicDna.load(), waveform.load()])
  }, [sonicDna.load, waveform.load])

  return {
    sonicDna,
    waveform,
    loadAll,
    isLoading: sonicDna.isLoading || waveform.isLoading,
    hasError: !!(sonicDna.error || waveform.error),
    isFullyLoaded: sonicDna.isLoaded && waveform.isLoaded,
  }
}