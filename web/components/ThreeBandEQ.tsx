'use client'

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

interface ThreeBandEQProps {
  audioContext: AudioContext | null
  sourceNode: MediaElementAudioSourceNode | null
  analyserNode: AnalyserNode | null
  /** Optional master gain (MixEngine fades); defaults to audioContext.destination */
  outputGain?: GainNode | null
  audioContextReady?: boolean
  onEQChange?: (eq: { low: number; mid: number; high: number }) => void
}

export type ThreeBandEQHandle = {
  setGains: (
    gains: { low?: number; mid?: number; high?: number },
    opts?: { instant?: boolean },
  ) => void
  getGains: () => { low: number; mid: number; high: number }
  reset: () => void
  /**
   * Reconnect audible path: source → EQ → sink (default mix output / destination).
   * Also taps source → analyser for visualization (analyser is not in the output path).
   */
  rewireAudibleChain: (sink?: AudioNode | null) => boolean
}

/** Below this, a gain change is inaudible and not worth scheduling. */
const EQ_GAIN_EPSILON_DB = 0.05
/** ~one animation frame, so per-frame mix targets interpolate smoothly. */
const EQ_GLIDE_TAU_SEC = 0.02

const ThreeBandEQ = forwardRef<ThreeBandEQHandle, ThreeBandEQProps>(function ThreeBandEQ(
  {
    audioContext,
    sourceNode,
    analyserNode,
    outputGain = null,
    audioContextReady,
    onEQChange,
  },
  ref
) {
  const [lowGain, setLowGain] = useState(0) // -40dB to +12dB (DJ mixer style - kills band at minimum)
  const [midGain, setMidGain] = useState(0)
  const [highGain, setHighGain] = useState(0)
  
  const lowFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const highFilterRef = useRef<BiquadFilterNode | null>(null)
  const isDraggingRef = useRef<'low' | 'mid' | 'high' | null>(null)
  const dragStartYRef = useRef<number>(0)
  const dragStartValueRef = useRef<number>(0)
  const lastLogTimeRef = useRef<{ [key: string]: number }>({})

  /**
   * Authoritative live gains. React state drives the knob visuals, but the mix
   * engine pushes gains once per animation frame — far faster than React can
   * commit — so the filters are written from here and state follows behind.
   */
  const gainsRef = useRef({ low: 0, mid: 0, high: 0 })
  const stateSyncRafRef = useRef<number | null>(null)
  const onEQChangeRef = useRef(onEQChange)

  useEffect(() => {
    onEQChangeRef.current = onEQChange
  }, [onEQChange])

  // Throttled logging function - only log once per second per band
  const logGainChange = useCallback((band: string, gain: number) => {
    const now = Date.now()
    const lastLog = lastLogTimeRef.current[band] || 0
    const timeSinceLastLog = now - lastLog
    
    // Only log if it's been more than 1 second since last log for this band
    if (timeSinceLastLog > 1000 && process.env.NODE_ENV === 'development') {
      console.log(`EQ: ${band} gain = ${gain.toFixed(1)}dB`)
      lastLogTimeRef.current[band] = now
    }
  }, [])

  /**
   * Write a band straight to its BiquadFilter. Glides rather than assigning
   * `.value` so per-frame targets are interpolated on the audio thread instead
   * of stepping the coefficients (audible as zipper noise during mix sweeps).
   */
  const applyBandToFilter = useCallback(
    (band: 'low' | 'mid' | 'high', value: number, instant = false) => {
      const clamped = Math.max(-40, Math.min(12, value))
      gainsRef.current[band] = clamped
      const filter =
        band === 'low'
          ? lowFilterRef.current
          : band === 'mid'
            ? midFilterRef.current
            : highFilterRef.current
      if (!filter) return clamped
      const param = filter.gain
      if (Math.abs(param.value - clamped) < EQ_GAIN_EPSILON_DB) return clamped
      if (instant || !audioContext) {
        param.cancelScheduledValues(audioContext?.currentTime ?? 0)
        param.value = clamped
      } else {
        param.setTargetAtTime(clamped, audioContext.currentTime, EQ_GLIDE_TAU_SEC)
      }
      return clamped
    },
    [audioContext],
  )

  /** Coalesce knob-visual updates to one commit per frame. */
  const scheduleStateSync = useCallback(() => {
    if (stateSyncRafRef.current !== null) return
    if (typeof requestAnimationFrame !== 'function') return
    stateSyncRafRef.current = requestAnimationFrame(() => {
      stateSyncRafRef.current = null
      const { low, mid, high } = gainsRef.current
      setLowGain((prev) => (Math.abs(prev - low) < EQ_GAIN_EPSILON_DB ? prev : low))
      setMidGain((prev) => (Math.abs(prev - mid) < EQ_GAIN_EPSILON_DB ? prev : mid))
      setHighGain((prev) => (Math.abs(prev - high) < EQ_GAIN_EPSILON_DB ? prev : high))
    })
  }, [])

  useEffect(
    () => () => {
      if (stateSyncRafRef.current !== null) cancelAnimationFrame(stateSyncRafRef.current)
    },
    [],
  )

  // Setup EQ filters - wait for audio context to be ready
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('EQ: Setup effect triggered', {
        hasContext: !!audioContext,
        hasSource: !!sourceNode,
        hasAnalyser: !!analyserNode,
        contextState: audioContext?.state
      })
    }
    
    if (!audioContext || !sourceNode || !analyserNode) {
      if (process.env.NODE_ENV === 'development') {
        console.log('EQ: Waiting for audio context to be ready...')
      }
      return
    }

    // Ensure audio context is running
    const setupFilters = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: Starting filter setup...')
        }
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
          if (process.env.NODE_ENV === 'development') {
            console.log('EQ: Audio context resumed')
          }
        }

        // Create filters (Pioneer-style frequencies)
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: Creating filters...')
        }
        const lowFilter = audioContext.createBiquadFilter()
        lowFilter.type = 'lowshelf'
        lowFilter.frequency.value = 100 // Pioneer DJM-900: 100Hz
        lowFilter.gain.value = gainsRef.current.low
        lowFilterRef.current = lowFilter
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: Low filter created, ref set:', !!lowFilterRef.current)
        }

        const midFilter = audioContext.createBiquadFilter()
        midFilter.type = 'peaking'
        midFilter.frequency.value = 1000 // Pioneer DJM-900: 1kHz
        midFilter.Q.value = 1
        midFilter.gain.value = gainsRef.current.mid
        midFilterRef.current = midFilter
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: Mid filter created, ref set:', !!midFilterRef.current)
        }

        const highFilter = audioContext.createBiquadFilter()
        highFilter.type = 'highshelf'
        highFilter.frequency.value = 10000 // Pioneer DJM-900: 10kHz
        highFilter.gain.value = gainsRef.current.high
        highFilterRef.current = highFilter
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: High filter created, ref set:', !!highFilterRef.current)
        }

        // Disconnect sourceNode from any existing connections
        try {
          sourceNode.disconnect()
        } catch (e) {
          // Already disconnected or not connected
        }
        
        // Disconnect analyser from destination if it's connected
        // Analyser should only be used for visualization data, not audio output
        try {
          analyserNode.disconnect()
        } catch (e) {
          // Not connected, that's fine
        }
        
        // Build the audio chain:
        // 1. source -> analyser (for visualization data only, NOT connected to destination)
        // 2. source -> EQ -> destination (for audio output - this is what you hear)
        // The analyser can read data without being in the output chain
        try {
          // Connect source to analyser for visualization (reads data, doesn't output audio)
          sourceNode.connect(analyserNode)
          
          // Connect source to EQ chain for audio output (this is the ONLY path to destination)
          sourceNode.connect(lowFilter)
          lowFilter.connect(midFilter)
          midFilter.connect(highFilter)
          const sink = outputGain || audioContext.destination
          highFilter.connect(sink)
          
          if (process.env.NODE_ENV === 'development') {
            console.log('EQ: Connected - source -> EQ -> sink (audio output), source -> analyser (visualization only)')
            console.log('EQ: Filter gains:', {
              low: lowFilter.gain.value,
              mid: midFilter.gain.value,
              high: highFilter.gain.value
            })
          }
        } catch (e) {
          console.error('EQ: Error connecting audio chain:', e)
          return
        }
      } catch (error) {
        console.error('EQ: Error setting up filters:', error)
      }
    }

    setupFilters()

    return () => {
      // Cleanup on unmount - disconnect all EQ nodes
      try {
        if (lowFilterRef.current) {
          lowFilterRef.current.disconnect()
          lowFilterRef.current = null
        }
        if (midFilterRef.current) {
          midFilterRef.current.disconnect()
          midFilterRef.current = null
        }
        if (highFilterRef.current) {
          highFilterRef.current.disconnect()
          highFilterRef.current = null
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Reconnect sourceNode through analyser → mix gain when EQ is removed
      try {
        if (sourceNode && analyserNode) {
          sourceNode.disconnect()
          sourceNode.connect(analyserNode)
          const sink = outputGain || audioContext.destination
          analyserNode.connect(sink)
        }
      } catch (e) {
        // Ignore reconnect errors
      }
    }
  }, [audioContext, sourceNode, analyserNode, outputGain, audioContextReady])

  // Update filter gains when values change
  // BiquadFilterNode gain is in decibels
  // At -40dB, the filter effectively kills that frequency band (DJ mixer style)
  useEffect(() => {
    applyBandToFilter('low', lowGain)
    logGainChange('Low', lowGain)
  }, [lowGain, applyBandToFilter, logGainChange])

  useEffect(() => {
    applyBandToFilter('mid', midGain)
    logGainChange('Mid', midGain)
  }, [midGain, applyBandToFilter, logGainChange])

  useEffect(() => {
    applyBandToFilter('high', highGain)
    logGainChange('High', highGain)
  }, [highGain, applyBandToFilter, logGainChange])

  // Notify parent of changes (ref avoids re-firing when parent passes a new callback)
  useEffect(() => {
    onEQChangeRef.current?.({ low: lowGain, mid: midGain, high: highGain })
  }, [lowGain, midGain, highGain])

  const updateGain = useCallback((band: 'low' | 'mid' | 'high', delta: number) => {
    // Pioneer-style: smooth continuous adjustment (no stepping)
    // Direct dB adjustment for natural feel
    const min = -40 // DJ mixer style: -40dB effectively kills the band
    const max = 12
    
    if (band === 'low') {
      setLowGain(prev => Math.max(min, Math.min(max, prev + delta)))
    } else if (band === 'mid') {
      setMidGain(prev => Math.max(min, Math.min(max, prev + delta)))
    } else {
      setHighGain(prev => Math.max(min, Math.min(max, prev + delta)))
    }
  }, [])

  const setBandGain = useCallback((band: 'low' | 'mid' | 'high', value: number) => {
    const clamped = Math.max(-40, Math.min(12, value))
    if (band === 'low') setLowGain(clamped)
    else if (band === 'mid') setMidGain(clamped)
    else setHighGain(clamped)
  }, [])

  const resetEQ = useCallback(() => {
    setLowGain(0)
    setMidGain(0)
    setHighGain(0)
  }, [])

  const rewireAudibleChain = useCallback(
    (sink?: AudioNode | null) => {
      if (!audioContext || !sourceNode) return false
      const low = lowFilterRef.current
      const mid = midFilterRef.current
      const high = highFilterRef.current
      if (!low || !mid || !high) return false

      const dest = sink ?? outputGain ?? audioContext.destination

      try {
        sourceNode.disconnect()
      } catch {
        /* ignore */
      }
      try {
        low.disconnect()
      } catch {
        /* ignore */
      }
      try {
        mid.disconnect()
      } catch {
        /* ignore */
      }
      try {
        high.disconnect()
      } catch {
        /* ignore */
      }
      if (analyserNode) {
        try {
          analyserNode.disconnect()
        } catch {
          /* ignore */
        }
      }

      try {
        // Visualization tap — not in the audible output path
        if (analyserNode) {
          sourceNode.connect(analyserNode)
        }
        sourceNode.connect(low)
        low.connect(mid)
        mid.connect(high)
        high.connect(dest)
        return true
      } catch (e) {
        console.error('EQ: rewireAudibleChain failed', e)
        return false
      }
    },
    [audioContext, sourceNode, analyserNode, outputGain],
  )

  useImperativeHandle(
    ref,
    () => ({
      // Filters first, knob visuals second. The mix engine calls this once per
      // frame, so routing it through setState would queue ~60 renders/sec and
      // apply each gain a frame or more late.
      setGains: (gains, opts) => {
        const instant = Boolean(opts?.instant)
        if (typeof gains.low === 'number') applyBandToFilter('low', gains.low, instant)
        if (typeof gains.mid === 'number') applyBandToFilter('mid', gains.mid, instant)
        if (typeof gains.high === 'number') applyBandToFilter('high', gains.high, instant)
        scheduleStateSync()
      },
      // Reads the live value, not last-committed state, so callers doing
      // read-modify-write on the EQ don't accumulate drift against stale renders.
      getGains: () => ({ ...gainsRef.current }),
      reset: resetEQ,
      rewireAudibleChain,
    }),
    [applyBandToFilter, scheduleStateSync, resetEQ, rewireAudibleChain]
  )

  const [draggingBand, setDraggingBand] = useState<'low' | 'mid' | 'high' | null>(null)

  const handlePointerDown = (e: React.PointerEvent, band: 'low' | 'mid' | 'high') => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    isDraggingRef.current = band
    setDraggingBand(band)
    dragStartYRef.current = e.clientY
    if (band === 'low') dragStartValueRef.current = lowGain
    else if (band === 'mid') dragStartValueRef.current = midGain
    else dragStartValueRef.current = highGain
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const band = isDraggingRef.current
    if (!band) return
    // Drag up = boost, drag down = cut (vertical fader feel on a rotary)
    const deltaY = dragStartYRef.current - e.clientY
    // ~0.25 dB per pixel across the -40…+12 range
    setBandGain(band, dragStartValueRef.current + deltaY * 0.25)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
    isDraggingRef.current = null
    setDraggingBand(null)
  }

  const handleWheel = (e: React.WheelEvent, band: 'low' | 'mid' | 'high') => {
    e.preventDefault()
    // Scroll up = boost, scroll down = cut
    const delta = e.deltaY > 0 ? -0.5 : 0.5
    updateGain(band, delta)
  }

  const formatGain = (gain: number) => {
    if (gain === 0) return '0'
    if (gain <= -39.5) return '-∞' // Show infinity symbol when fully cut
    return gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)
  }

  const getKnobRotation = (gain: number) => {
    // Pioneer DJ mixer style: 0dB at 12 o'clock (0°), smooth rotation
    // -40dB to +12dB mapped to -150° to +150°
    // 0dB = 0° (12 o'clock position)
    const maxRotation = 150
    
    if (gain >= 0) {
      // Positive gain: 0dB to +12dB maps to 0° to +150°
      return (gain / 12) * maxRotation
    } else {
      // Negative gain: 0dB to -40dB maps to 0° to -150°
      return (gain / 40) * maxRotation
    }
  }

  const getKnobColor = (band: 'low' | 'mid' | 'high') => {
    if (band === 'low') return 'from-orange-500 to-red-600'
    if (band === 'mid') return 'from-yellow-500 to-amber-600'
    return 'from-blue-500 to-cyan-600'
  }

  const getBandLabel = (band: 'low' | 'mid' | 'high') => {
    if (band === 'low') return 'LOW'
    if (band === 'mid') return 'MID'
    return 'HIGH'
  }

  const getGainColor = (band: 'low' | 'mid' | 'high', gain: number) => {
    if (gain <= -39.5) return 'text-red-500'
    if (gain === 0) return 'text-gray-500'
    if (band === 'low') return gain > 0 ? 'text-orange-400' : 'text-red-400'
    if (band === 'mid') return gain > 0 ? 'text-yellow-400' : 'text-amber-400'
    return gain > 0 ? 'text-blue-400' : 'text-cyan-400'
  }

  const bands: Array<{ id: 'low' | 'mid' | 'high'; gain: number }> = [
    { id: 'low', gain: lowGain },
    { id: 'mid', gain: midGain },
    { id: 'high', gain: highGain },
  ]

  return (
    <div className="flex items-center gap-2.5">
      <div className="mr-0.5 flex flex-col items-start gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">EQ</span>
        <button
          type="button"
          onClick={resetEQ}
          className="px-1 py-0.5 text-[10px] text-gray-500 transition-colors hover:text-gray-300"
          title="Reset EQ"
        >
          Reset
        </button>
      </div>

      <div className="flex items-center gap-3">
        {bands.map(({ id, gain }) => (
          <div key={id} className="flex flex-col items-center gap-0.5">
            <div
              className="relative h-11 w-11 flex-shrink-0 cursor-ns-resize select-none touch-none"
              onPointerDown={(e) => handlePointerDown(e, id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={(e) => handleWheel(e, id)}
              title={`${getBandLabel(id)} EQ: Drag up/down to adjust`}
              role="slider"
              aria-label={`${getBandLabel(id)} EQ`}
              aria-valuemin={-40}
              aria-valuemax={12}
              aria-valuenow={Math.round(gain * 10) / 10}
              aria-valuetext={`${formatGain(gain)}${gain > -39.5 ? ' dB' : ''}`}
            >
              <div className="absolute inset-0 rounded-full border-2 border-gray-700 bg-gray-800 shadow-inner">
                <div
                  className={`absolute inset-1 rounded-full bg-gradient-to-br ${getKnobColor(id)} shadow-lg`}
                  style={{
                    transform: `rotate(${getKnobRotation(gain)}deg)`,
                    transition: draggingBand === id ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <div className="absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-sm" />
                  <div className="absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-white/80" />
                </div>
                <div className="absolute inset-0">
                  <div className="absolute left-1/2 top-0 h-1.5 w-0.5 -translate-x-1/2 bg-gray-400" />
                </div>
              </div>
            </div>
            <div className="text-[9px] font-medium text-gray-400">{getBandLabel(id)}</div>
            <div className={`font-mono text-[9px] ${getGainColor(id, gain)}`}>
              {formatGain(gain)}
              {gain > -39.5 ? 'dB' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

export default ThreeBandEQ

