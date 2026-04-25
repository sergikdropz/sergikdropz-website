'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface ThreeBandEQProps {
  audioContext: AudioContext | null
  sourceNode: MediaElementAudioSourceNode | null
  analyserNode: AnalyserNode | null
  audioContextReady?: boolean
  onEQChange?: (eq: { low: number; mid: number; high: number }) => void
}

export default function ThreeBandEQ({ 
  audioContext, 
  sourceNode, 
  analyserNode,
  audioContextReady,
  onEQChange 
}: ThreeBandEQProps) {
  const [lowGain, setLowGain] = useState(0) // -40dB to +12dB (DJ mixer style - kills band at minimum)
  const [midGain, setMidGain] = useState(0)
  const [highGain, setHighGain] = useState(0)
  
  const lowFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const highFilterRef = useRef<BiquadFilterNode | null>(null)
  const isDraggingRef = useRef<string | null>(null)
  const dragStartYRef = useRef<number>(0)
  const dragStartValueRef = useRef<number>(0)
  const lastLogTimeRef = useRef<{ [key: string]: number }>({})

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
        lowFilter.gain.value = lowGain
        lowFilterRef.current = lowFilter
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: Low filter created, ref set:', !!lowFilterRef.current)
        }

        const midFilter = audioContext.createBiquadFilter()
        midFilter.type = 'peaking'
        midFilter.frequency.value = 1000 // Pioneer DJM-900: 1kHz
        midFilter.Q.value = 1
        midFilter.gain.value = midGain
        midFilterRef.current = midFilter
        if (process.env.NODE_ENV === 'development') {
          console.log('EQ: Mid filter created, ref set:', !!midFilterRef.current)
        }

        const highFilter = audioContext.createBiquadFilter()
        highFilter.type = 'highshelf'
        highFilter.frequency.value = 10000 // Pioneer DJM-900: 10kHz
        highFilter.gain.value = highGain
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
          highFilter.connect(audioContext.destination)
          
          if (process.env.NODE_ENV === 'development') {
            console.log('EQ: Connected - source -> EQ -> destination (audio output), source -> analyser (visualization only)')
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
      
      // Reconnect sourceNode directly to analyser and destination when EQ is removed
      try {
        if (sourceNode && analyserNode) {
          sourceNode.disconnect()
          sourceNode.connect(analyserNode)
          analyserNode.connect(audioContext.destination)
        }
      } catch (e) {
        // Ignore reconnect errors
      }
    }
  }, [audioContext, sourceNode, analyserNode, audioContextReady])

  // Update filter gains when values change
  // BiquadFilterNode gain is in decibels
  // At -40dB, the filter effectively kills that frequency band (DJ mixer style)
  useEffect(() => {
    if (!lowFilterRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('EQ: Low filter not ready, gain:', lowGain)
      }
      return
    }
    
    const clampedGain = Math.max(-40, Math.min(12, lowGain))
    lowFilterRef.current.gain.value = clampedGain
    logGainChange('Low', clampedGain)
    // Verify the gain was set
    if (Math.abs(lowFilterRef.current.gain.value - clampedGain) > 0.1 && process.env.NODE_ENV === 'development') {
      console.warn('EQ: Low filter gain mismatch! Set:', clampedGain, 'Actual:', lowFilterRef.current.gain.value)
    }
  }, [lowGain, logGainChange])

  useEffect(() => {
    if (!midFilterRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('EQ: Mid filter not ready, gain:', midGain)
      }
      return
    }
    
    const clampedGain = Math.max(-40, Math.min(12, midGain))
    midFilterRef.current.gain.value = clampedGain
    logGainChange('Mid', clampedGain)
    // Verify the gain was set
    if (Math.abs(midFilterRef.current.gain.value - clampedGain) > 0.1 && process.env.NODE_ENV === 'development') {
      console.warn('EQ: Mid filter gain mismatch! Set:', clampedGain, 'Actual:', midFilterRef.current.gain.value)
    }
  }, [midGain, logGainChange])

  useEffect(() => {
    if (!highFilterRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('EQ: High filter not ready, gain:', highGain)
      }
      return
    }
    
    const clampedGain = Math.max(-40, Math.min(12, highGain))
    highFilterRef.current.gain.value = clampedGain
    logGainChange('High', clampedGain)
    // Verify the gain was set
    if (Math.abs(highFilterRef.current.gain.value - clampedGain) > 0.1 && process.env.NODE_ENV === 'development') {
      console.warn('EQ: High filter gain mismatch! Set:', clampedGain, 'Actual:', highFilterRef.current.gain.value)
    }
  }, [highGain, logGainChange])

  // Notify parent of changes
  useEffect(() => {
    onEQChange?.({ low: lowGain, mid: midGain, high: highGain })
  }, [lowGain, midGain, highGain, onEQChange])

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

  const handleMouseDown = (e: React.MouseEvent, band: 'low' | 'mid' | 'high') => {
    e.preventDefault()
    isDraggingRef.current = band
    dragStartYRef.current = e.clientY
    if (band === 'low') {
      dragStartValueRef.current = lowGain
    } else if (band === 'mid') {
      dragStartValueRef.current = midGain
    } else {
      dragStartValueRef.current = highGain
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return
    
    const band = isDraggingRef.current
    if (band !== 'low' && band !== 'mid' && band !== 'high') return
    
    const deltaY = dragStartYRef.current - e.clientY
    // Smoother sensitivity: 0.3dB per pixel (Pioneer-style smooth operation)
    // This gives fine control like a real DJ mixer
    const deltaValue = deltaY * 0.3
    updateGain(band, deltaValue)
    dragStartYRef.current = e.clientY
  }, [updateGain])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = null
  }, [])

  useEffect(() => {
    if (isDraggingRef.current) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDraggingRef.current, handleMouseMove, handleMouseUp])

  const handleWheel = (e: React.WheelEvent, band: 'low' | 'mid' | 'high') => {
    e.preventDefault()
    // Smoother wheel scrolling: 0.5dB per wheel step (Pioneer-style precision)
    const delta = e.deltaY > 0 ? -0.5 : 0.5
    updateGain(band, delta)
  }

  const resetEQ = () => {
    setLowGain(0)
    setMidGain(0)
    setHighGain(0)
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

  const getBandFrequency = (band: 'low' | 'mid' | 'high') => {
    if (band === 'low') return '100Hz'
    if (band === 'mid') return '1kHz'
    return '10kHz'
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">3-Band EQ</label>
        <button
          onClick={resetEQ}
          className="text-[9px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5"
          title="Reset EQ"
        >
          Reset
        </button>
      </div>
      
      <div className="flex flex-col gap-2">
        {/* High Band - Top */}
        <div className="flex items-center gap-2">
          <div
            className="relative w-10 h-10 cursor-pointer select-none flex-shrink-0"
            onMouseDown={(e) => handleMouseDown(e, 'high')}
            onWheel={(e) => handleWheel(e, 'high')}
            title="High EQ: Drag or scroll to adjust"
          >
            <div className="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-700 shadow-inner">
              <div 
                className={`absolute inset-1 rounded-full bg-gradient-to-br ${getKnobColor('high')} shadow-lg`}
                style={{
                  transform: `rotate(${getKnobRotation(highGain)}deg)`,
                  transition: isDraggingRef.current === 'high' ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full shadow-sm" />
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-2 bg-white/80 rounded-full" />
              </div>
              <div className="absolute inset-0">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-1.5 bg-gray-400" />
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-gray-500"
                  style={{ top: '2px', height: '8px', transform: 'translateX(-50%) rotate(-150deg)', transformOrigin: '50% 100%' }}
                />
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-gray-500"
                  style={{ top: '2px', height: '8px', transform: 'translateX(-50%) rotate(150deg)', transformOrigin: '50% 100%' }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="text-[9px] text-gray-500">{getBandLabel('high')}</div>
            <div className="text-[8px] text-gray-600">{getBandFrequency('high')}</div>
            <div className={`text-[9px] font-mono ${
              highGain <= -39.5 ? 'text-red-500' : 
              highGain === 0 ? 'text-gray-500' : 
              highGain > 0 ? 'text-blue-400' : 'text-cyan-400'
            }`}>
              {formatGain(highGain)}{highGain > -39.5 ? 'dB' : ''}
            </div>
          </div>
        </div>

        {/* Mid Band - Middle */}
        <div className="flex items-center gap-2">
          <div
            className="relative w-10 h-10 cursor-pointer select-none flex-shrink-0"
            onMouseDown={(e) => handleMouseDown(e, 'mid')}
            onWheel={(e) => handleWheel(e, 'mid')}
            title="Mid EQ: Drag or scroll to adjust"
          >
            <div className="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-700 shadow-inner">
              <div 
                className={`absolute inset-1 rounded-full bg-gradient-to-br ${getKnobColor('mid')} shadow-lg`}
                style={{
                  transform: `rotate(${getKnobRotation(midGain)}deg)`,
                  transition: isDraggingRef.current === 'mid' ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full shadow-sm" />
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-2 bg-white/80 rounded-full" />
              </div>
              <div className="absolute inset-0">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-1.5 bg-gray-400" />
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-gray-500"
                  style={{ top: '2px', height: '8px', transform: 'translateX(-50%) rotate(-150deg)', transformOrigin: '50% 100%' }}
                />
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-gray-500"
                  style={{ top: '2px', height: '8px', transform: 'translateX(-50%) rotate(150deg)', transformOrigin: '50% 100%' }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="text-[9px] text-gray-500">{getBandLabel('mid')}</div>
            <div className="text-[8px] text-gray-600">{getBandFrequency('mid')}</div>
            <div className={`text-[9px] font-mono ${
              midGain <= -39.5 ? 'text-red-500' : 
              midGain === 0 ? 'text-gray-500' : 
              midGain > 0 ? 'text-yellow-400' : 'text-amber-400'
            }`}>
              {formatGain(midGain)}{midGain > -39.5 ? 'dB' : ''}
            </div>
          </div>
        </div>

        {/* Low Band - Bottom */}
        <div className="flex items-center gap-2">
          <div
            className="relative w-10 h-10 cursor-pointer select-none flex-shrink-0"
            onMouseDown={(e) => handleMouseDown(e, 'low')}
            onWheel={(e) => handleWheel(e, 'low')}
            title="Low EQ: Drag or scroll to adjust"
          >
            <div className="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-700 shadow-inner">
              <div 
                className={`absolute inset-1 rounded-full bg-gradient-to-br ${getKnobColor('low')} shadow-lg`}
                style={{
                  transform: `rotate(${getKnobRotation(lowGain)}deg)`,
                  transition: isDraggingRef.current === 'low' ? 'none' : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full shadow-sm" />
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-2 bg-white/80 rounded-full" />
              </div>
              <div className="absolute inset-0">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0.5 h-1.5 bg-gray-400" />
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-gray-500"
                  style={{ top: '2px', height: '8px', transform: 'translateX(-50%) rotate(-150deg)', transformOrigin: '50% 100%' }}
                />
                <div 
                  className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-gray-500"
                  style={{ top: '2px', height: '8px', transform: 'translateX(-50%) rotate(150deg)', transformOrigin: '50% 100%' }}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="text-[9px] text-gray-500">{getBandLabel('low')}</div>
            <div className="text-[8px] text-gray-600">{getBandFrequency('low')}</div>
            <div className={`text-[9px] font-mono ${
              lowGain <= -39.5 ? 'text-red-500' : 
              lowGain === 0 ? 'text-gray-500' : 
              lowGain > 0 ? 'text-orange-400' : 'text-red-400'
            }`}>
              {formatGain(lowGain)}{lowGain > -39.5 ? 'dB' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

