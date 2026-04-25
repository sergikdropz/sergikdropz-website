'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { resolveAudioUrl } from '@/utils/resolveAudioUrl'
import { generatePeakData } from '@/utils/audioWorkerClient'
import { analyzeFrequencyBands } from '@/utils/audioAnalysis'
import Image from 'next/image'
import { shouldUnoptimizeImage } from '@/utils/imageOptimization'

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  album?: string
  folder?: string
  folder_id?: string
  bpm?: number
  beat_grid_offset?: number
  key_signature?: string
  energy_level?: number
  danceability?: number
}

interface DJMixerModeProps {
  currentTrack: Track | null
  queue: Track[]
  onQueueChange?: (queue: Track[]) => void
  autoDJConfig?: {
    enabled: boolean
    mode: AutoDJMode
    transitionMode: AutoDJTransitionMode
    phraseBars: AutoDJPhraseBars
    addToQueue: boolean
  }
  onExit?: () => void
}

interface DeckState {
  track: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  channelFader: number // 0-1
  eqLow: number
  eqMid: number
  eqHigh: number
  smartEQEnabled: boolean
  waveformData: number[]
  detectedBPM: number | null
  hotCues: Array<{ time: number; label?: string }>
  loopIn: number | null
  loopOut: number | null
  beatGridOffset: number // Offset in seconds for beat alignment
}

type AutoDJMode = 'queue' | 'curate'
type AutoDJTransitionMode = 'crossfade' | 'filter-eq' | 'cutout-filter'
type AutoDJPhraseBars = 8 | 4 | 2

export default function DJMixerMode({
  currentTrack,
  queue,
  onQueueChange,
  autoDJConfig,
  onExit
}: DJMixerModeProps) {
  // Audio elements and context
  const audioARef = useRef<HTMLAudioElement>(null)
  const audioBRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceANodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const sourceBNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const analyserARef = useRef<AnalyserNode | null>(null)
  const analyserBRef = useRef<AnalyserNode | null>(null)
  
  // EQ filter nodes
  const eqALowRef = useRef<BiquadFilterNode | null>(null)
  const eqAMidRef = useRef<BiquadFilterNode | null>(null)
  const eqAHighRef = useRef<BiquadFilterNode | null>(null)
  const filterARef = useRef<BiquadFilterNode | null>(null)
  const fxDelayARef = useRef<DelayNode | null>(null)
  const fxFeedbackARef = useRef<GainNode | null>(null)
  const fxWetGainARef = useRef<GainNode | null>(null)
  const fxDryGainARef = useRef<GainNode | null>(null)
  const eqBLowRef = useRef<BiquadFilterNode | null>(null)
  const eqBMidRef = useRef<BiquadFilterNode | null>(null)
  const eqBHighRef = useRef<BiquadFilterNode | null>(null)
  const filterBRef = useRef<BiquadFilterNode | null>(null)
  const fxDelayBRef = useRef<DelayNode | null>(null)
  const fxFeedbackBRef = useRef<GainNode | null>(null)
  const fxWetGainBRef = useRef<GainNode | null>(null)
  const fxDryGainBRef = useRef<GainNode | null>(null)
  
  // Gain nodes
  const gainARef = useRef<GainNode | null>(null)
  const gainBRef = useRef<GainNode | null>(null)
  const crossfaderGainARef = useRef<GainNode | null>(null)
  const crossfaderGainBRef = useRef<GainNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)

  // Deck states
  const [deckA, setDeckA] = useState<DeckState>({
    track: currentTrack,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0,
    channelFader: 1.0,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    smartEQEnabled: false,
    waveformData: [],
    detectedBPM: null,
    hotCues: [],
    loopIn: null,
    loopOut: null,
    beatGridOffset: 0,
  })

  const [deckB, setDeckB] = useState<DeckState>({
    track: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0,
    channelFader: 1.0,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    smartEQEnabled: false,
    waveformData: [],
    detectedBPM: null,
    hotCues: [],
    loopIn: null,
    loopOut: null,
    beatGridOffset: 0,
  })
  const [filterA, setFilterA] = useState(0)
  const [filterB, setFilterB] = useState(0)
  const deckAStateRef = useRef(deckA)
  const deckBStateRef = useRef(deckB)
  const [fxA, setFxA] = useState({ enabled: false, timeBeats: 0.5, feedback: 0.35, wet: 0.35 })
  const [fxB, setFxB] = useState({ enabled: false, timeBeats: 0.5, feedback: 0.35, wet: 0.35 })
  const beatGridSaveTimeoutARef = useRef<NodeJS.Timeout | null>(null)
  const beatGridSaveTimeoutBRef = useRef<NodeJS.Timeout | null>(null)

  const [crossfaderPosition, setCrossfaderPosition] = useState(0.5) // 0 = A, 1 = B
  const crossfaderPositionRef = useRef(0.5)
  const [dragOver, setDragOver] = useState<'A' | 'B' | null>(null)
  const [resolvedUrlA, setResolvedUrlA] = useState<string | null>(null)
  const [resolvedUrlB, setResolvedUrlB] = useState<string | null>(null)

  // Performance controls
  const [deckALoop, setDeckALoop] = useState(false)
  const [deckAHotCues, setDeckAHotCues] = useState<number[]>([])
  const [deckASampler, setDeckASampler] = useState(false)
  const [deckAShift, setDeckAShift] = useState(false)
  const [deckARec, setDeckARec] = useState(false)
  const [deckASlip, setDeckASlip] = useState(false)

  const [deckBLoop, setDeckBLoop] = useState(false)
  const [deckBHotCues, setDeckBHotCues] = useState<number[]>([])
  const [deckBSampler, setDeckBSampler] = useState(false)
  const [deckBShift, setDeckBShift] = useState(false)
  const [deckBRec, setDeckBRec] = useState(false)
  const [deckBSlip, setDeckBSlip] = useState(false)
  const [tempoRangeWide, setTempoRangeWide] = useState(false)
  const tapTempoARef = useRef<number[]>([])
  const tapTempoBRef = useRef<number[]>([])

  // Jog wheel interaction
  const [jogWheelAPosition, setJogWheelAPosition] = useState(0) // 0-360 degrees
  const [jogWheelBPosition, setJogWheelBPosition] = useState(0)
  const [isDraggingJogA, setIsDraggingJogA] = useState(false)
  const [isDraggingJogB, setIsDraggingJogB] = useState(false)
  const [showPitchControl, setShowPitchControl] = useState<'A' | 'B' | null>(null)

  // Real-time waveform data
  const [realtimeWaveformA, setRealtimeWaveformA] = useState<Float32Array | null>(null)
  const [realtimeWaveformB, setRealtimeWaveformB] = useState<Float32Array | null>(null)
  const [meterA, setMeterA] = useState(0)
  const [meterB, setMeterB] = useState(0)
  const [eqStackHeight, setEqStackHeight] = useState(0)
  const [eqContainerHeight, setEqContainerHeight] = useState(0)
  const waveformAnimationFrameRef = useRef<number | null>(null)
  const timeDataArrayARef = useRef<Float32Array | null>(null)
  const timeDataArrayBRef = useRef<Float32Array | null>(null)
  const eqStackRef = useRef<HTMLDivElement | null>(null)
  const eqContainerRef = useRef<HTMLDivElement | null>(null)
  
  // Waveform drag-to-scrub state
  const [isDraggingWaveformA, setIsDraggingWaveformA] = useState(false)
  const [isDraggingWaveformB, setIsDraggingWaveformB] = useState(false)
  const [waveformZoomBeats, setWaveformZoomBeats] = useState<number>(16)
  
  // Track list expansion state
  const [isTrackListExpanded, setIsTrackListExpanded] = useState(false)

  const getPhase = useCallback((deckState: DeckState) => {
    if (!deckState.detectedBPM || deckState.duration <= 0) return null
    const bpm = deckState.detectedBPM * deckState.playbackRate
    if (!Number.isFinite(bpm) || bpm <= 0) return null
    const beatDuration = 60 / bpm
    const offset = deckState.beatGridOffset || 0
    const raw = ((deckState.currentTime - offset) % beatDuration + beatDuration) % beatDuration
    return raw / beatDuration
  }, [])

  const getBeatDuration = useCallback((deckState: DeckState) => {
    if (!deckState.detectedBPM) return null
    const bpm = deckState.detectedBPM * deckState.playbackRate
    if (!Number.isFinite(bpm) || bpm <= 0) return null
    return 60 / bpm
  }, [])

  const resetAutoMixEQ = useCallback((fromDeck: 'A' | 'B') => {
    setFilterA(0)
    setFilterB(0)
    if (fromDeck === 'A') {
      setDeckA((prev) => ({ ...prev, channelFader: 1 }))
    } else {
      setDeckB((prev) => ({ ...prev, channelFader: 1 }))
    }
  }, [])

  const applyAutoMixStep = useCallback((t: number, fromDeck: 'A' | 'B', mode: AutoDJTransitionMode) => {
    const crossfadeValue = fromDeck === 'A' ? t : 1 - t
    setCrossfaderPosition(Math.max(0, Math.min(1, crossfadeValue)))

    if (mode === 'crossfade') return

    if (fromDeck === 'A') {
      setFilterA(0.75 * t)
      setFilterB(-0.65 * (1 - t))
    } else {
      setFilterB(0.75 * t)
      setFilterA(-0.65 * (1 - t))
    }

    if (mode === 'cutout-filter') {
      const isCut = t > 0.35 && t < 0.55
      if (fromDeck === 'A') {
        setDeckA((prev) => ({ ...prev, channelFader: isCut ? 0.25 : Math.max(0.2, 1 - t) }))
      } else {
        setDeckB((prev) => ({ ...prev, channelFader: isCut ? 0.25 : Math.max(0.2, 1 - t) }))
      }
    }
  }, [])

  // Auto DJ state
  const [autoDJEnabled, setAutoDJEnabled] = useState(false)
  const [autoDJMode, setAutoDJMode] = useState<AutoDJMode>('queue')
  const [autoDJTransitionMode, setAutoDJTransitionMode] = useState<AutoDJTransitionMode>('crossfade')
  const [autoDJPhraseBars, setAutoDJPhraseBars] = useState<AutoDJPhraseBars>(8)
  const [autoDJAddToQueue, setAutoDJAddToQueue] = useState(true)
  const [autoDJStatus, setAutoDJStatus] = useState('Idle')
  const [autoDJNextTrack, setAutoDJNextTrack] = useState<Track | null>(null)
  const [autoDJLibraryTracks, setAutoDJLibraryTracks] = useState<Track[]>([])
  const autoDJMixTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoDJIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoDJInProgressRef = useRef(false)
  const autoDJPreparingRef = useRef(false)
  const recentTrackIdsRef = useRef<string[]>([])
  const autoDJLastPreparedTrackIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!autoDJConfig) return
    if (autoDJEnabled !== autoDJConfig.enabled) setAutoDJEnabled(autoDJConfig.enabled)
    if (autoDJMode !== autoDJConfig.mode) setAutoDJMode(autoDJConfig.mode)
    if (autoDJTransitionMode !== autoDJConfig.transitionMode) {
      setAutoDJTransitionMode(autoDJConfig.transitionMode)
    }
    if (autoDJPhraseBars !== autoDJConfig.phraseBars) setAutoDJPhraseBars(autoDJConfig.phraseBars)
    if (autoDJAddToQueue !== autoDJConfig.addToQueue) setAutoDJAddToQueue(autoDJConfig.addToQueue)
  }, [
    autoDJConfig,
    autoDJEnabled,
    autoDJMode,
    autoDJTransitionMode,
    autoDJPhraseBars,
    autoDJAddToQueue
  ])
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    track: Track | null
    x: number
    y: number
    visible: boolean
  } | null>(null)
  const touchHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Track loading confirmation state
  const [pendingTrackLoad, setPendingTrackLoad] = useState<{
    track: Track
    deck: 'A' | 'B'
  } | null>(null)
  
  // Hot cues modal state
  const [showHotCuesModal, setShowHotCuesModal] = useState<'A' | 'B' | null>(null)
  
  // Menu state
  const [showMenu, setShowMenu] = useState(false)
  
  // Root library directory state
  const [rootFolders, setRootFolders] = useState<any[]>([])
  const [allFolders, setAllFolders] = useState<any[]>([]) // All folders for child lookup
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null) // Track which folder is expanded
  const [folderTracks, setFolderTracks] = useState<Track[]>([]) // Tracks from selected folder
  const queueRef = useRef<Track[]>([])
  const folderTracksRef = useRef<Track[]>([])
  const selectedFolderIdRef = useRef<string | null>(null)

  useEffect(() => {
    deckAStateRef.current = deckA
  }, [deckA])

  useEffect(() => {
    deckBStateRef.current = deckB
  }, [deckB])

  useEffect(() => {
    crossfaderPositionRef.current = crossfaderPosition
  }, [crossfaderPosition])

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    folderTracksRef.current = folderTracks
  }, [folderTracks])

  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId
  }, [selectedFolderId])

  // Initialize audio context and mixer graph
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    const ctx = audioContextRef.current

    // Create analysers for waveforms
    if (!analyserARef.current) {
      analyserARef.current = ctx.createAnalyser()
      analyserARef.current.fftSize = 2048
      analyserARef.current.smoothingTimeConstant = 0.8
      timeDataArrayARef.current = new Float32Array(analyserARef.current.fftSize)
    }
    if (!analyserBRef.current) {
      analyserBRef.current = ctx.createAnalyser()
      analyserBRef.current.fftSize = 2048
      analyserBRef.current.smoothingTimeConstant = 0.8
      timeDataArrayBRef.current = new Float32Array(analyserBRef.current.fftSize)
    }

    // Create EQ filters for Deck A
    if (!eqALowRef.current) {
      eqALowRef.current = ctx.createBiquadFilter()
      eqALowRef.current.type = 'lowshelf'
      eqALowRef.current.frequency.value = 100
      eqALowRef.current.gain.value = 0
    }
    if (!eqAMidRef.current) {
      eqAMidRef.current = ctx.createBiquadFilter()
      eqAMidRef.current.type = 'peaking'
      eqAMidRef.current.frequency.value = 1000
      eqAMidRef.current.Q.value = 1
      eqAMidRef.current.gain.value = 0
    }
    if (!eqAHighRef.current) {
      eqAHighRef.current = ctx.createBiquadFilter()
      eqAHighRef.current.type = 'highshelf'
      eqAHighRef.current.frequency.value = 10000
      eqAHighRef.current.gain.value = 0
    }
    if (!filterARef.current) {
      filterARef.current = ctx.createBiquadFilter()
      filterARef.current.type = 'lowpass'
      filterARef.current.frequency.value = 20000
      filterARef.current.Q.value = 0.7
    }
    if (!fxDelayARef.current) {
      fxDelayARef.current = ctx.createDelay(2.0)
      fxDelayARef.current.delayTime.value = 0.25
    }
    if (!fxFeedbackARef.current) {
      fxFeedbackARef.current = ctx.createGain()
      fxFeedbackARef.current.gain.value = 0.35
    }
    if (!fxWetGainARef.current) {
      fxWetGainARef.current = ctx.createGain()
      fxWetGainARef.current.gain.value = 0
    }
    if (!fxDryGainARef.current) {
      fxDryGainARef.current = ctx.createGain()
      fxDryGainARef.current.gain.value = 1
    }

    // Create EQ filters for Deck B
    if (!eqBLowRef.current) {
      eqBLowRef.current = ctx.createBiquadFilter()
      eqBLowRef.current.type = 'lowshelf'
      eqBLowRef.current.frequency.value = 100
      eqBLowRef.current.gain.value = 0
    }
    if (!eqBMidRef.current) {
      eqBMidRef.current = ctx.createBiquadFilter()
      eqBMidRef.current.type = 'peaking'
      eqBMidRef.current.frequency.value = 1000
      eqBMidRef.current.Q.value = 1
      eqBMidRef.current.gain.value = 0
    }
    if (!eqBHighRef.current) {
      eqBHighRef.current = ctx.createBiquadFilter()
      eqBHighRef.current.type = 'highshelf'
      eqBHighRef.current.frequency.value = 10000
      eqBHighRef.current.gain.value = 0
    }
    if (!filterBRef.current) {
      filterBRef.current = ctx.createBiquadFilter()
      filterBRef.current.type = 'lowpass'
      filterBRef.current.frequency.value = 20000
      filterBRef.current.Q.value = 0.7
    }
    if (!fxDelayBRef.current) {
      fxDelayBRef.current = ctx.createDelay(2.0)
      fxDelayBRef.current.delayTime.value = 0.25
    }
    if (!fxFeedbackBRef.current) {
      fxFeedbackBRef.current = ctx.createGain()
      fxFeedbackBRef.current.gain.value = 0.35
    }
    if (!fxWetGainBRef.current) {
      fxWetGainBRef.current = ctx.createGain()
      fxWetGainBRef.current.gain.value = 0
    }
    if (!fxDryGainBRef.current) {
      fxDryGainBRef.current = ctx.createGain()
      fxDryGainBRef.current.gain.value = 1
    }

    // Create gain nodes
    if (!gainARef.current) gainARef.current = ctx.createGain()
    if (!gainBRef.current) gainBRef.current = ctx.createGain()
    if (!crossfaderGainARef.current) crossfaderGainARef.current = ctx.createGain()
    if (!crossfaderGainBRef.current) crossfaderGainBRef.current = ctx.createGain()
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain()
      masterGainRef.current.gain.value = 0.8 // Slight master reduction to prevent clipping
      masterGainRef.current.connect(ctx.destination)
    }

    // Build mixer graph when sources are ready
    const connectMixerGraph = () => {
      if (!sourceANodeRef.current || !sourceBNodeRef.current) return

      try {
        // Disconnect existing connections
        sourceANodeRef.current.disconnect()
        sourceBNodeRef.current.disconnect()

        // Deck A chain: source → analyser → EQ → filter → (dry/wet fx) → channel gain → crossfader → master
        sourceANodeRef.current.connect(analyserARef.current!)
        sourceANodeRef.current.connect(eqALowRef.current!)
        eqALowRef.current!.connect(eqAMidRef.current!)
        eqAMidRef.current!.connect(eqAHighRef.current!)
        eqAHighRef.current!.connect(filterARef.current!)
        filterARef.current!.connect(fxDryGainARef.current!)
        filterARef.current!.connect(fxDelayARef.current!)
        fxDelayARef.current!.connect(fxFeedbackARef.current!)
        fxFeedbackARef.current!.connect(fxDelayARef.current!)
        fxDelayARef.current!.connect(fxWetGainARef.current!)
        fxDryGainARef.current!.connect(gainARef.current!)
        fxWetGainARef.current!.connect(gainARef.current!)
        gainARef.current!.connect(crossfaderGainARef.current!)
        crossfaderGainARef.current!.connect(masterGainRef.current!)

        // Deck B chain: source → analyser → EQ → filter → (dry/wet fx) → channel gain → crossfader → master
        sourceBNodeRef.current.connect(analyserBRef.current!)
        sourceBNodeRef.current.connect(eqBLowRef.current!)
        eqBLowRef.current!.connect(eqBMidRef.current!)
        eqBMidRef.current!.connect(eqBHighRef.current!)
        eqBHighRef.current!.connect(filterBRef.current!)
        filterBRef.current!.connect(fxDryGainBRef.current!)
        filterBRef.current!.connect(fxDelayBRef.current!)
        fxDelayBRef.current!.connect(fxFeedbackBRef.current!)
        fxFeedbackBRef.current!.connect(fxDelayBRef.current!)
        fxDelayBRef.current!.connect(fxWetGainBRef.current!)
        fxDryGainBRef.current!.connect(gainBRef.current!)
        fxWetGainBRef.current!.connect(gainBRef.current!)
        gainBRef.current!.connect(crossfaderGainBRef.current!)
        crossfaderGainBRef.current!.connect(masterGainRef.current!)
      } catch (e) {
        console.error('Error connecting mixer graph:', e)
      }
    }

    // Connect when sources are available
    if (sourceANodeRef.current || sourceBNodeRef.current) {
      connectMixerGraph()
    }

    return () => {
      const refs = [
        sourceANodeRef, sourceBNodeRef,
        analyserARef, analyserBRef,
        eqALowRef, eqAMidRef, eqAHighRef,
        eqBLowRef, eqBMidRef, eqBHighRef,
        filterARef, filterBRef,
        fxDelayARef, fxFeedbackARef, fxWetGainARef, fxDryGainARef,
        fxDelayBRef, fxFeedbackBRef, fxWetGainBRef, fxDryGainBRef,
        gainARef, gainBRef,
        crossfaderGainARef, crossfaderGainBRef,
        masterGainRef,
      ]
      for (const ref of refs) {
        try { (ref.current as AudioNode)?.disconnect() } catch {}
        ref.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
    }
  }, [])

  // Update crossfader (equal-power curve)
  useEffect(() => {
    if (!crossfaderGainARef.current || !crossfaderGainBRef.current) return
    const x = Math.max(0, Math.min(1, crossfaderPosition))
    const a = Math.cos(x * 0.5 * Math.PI) // Equal-power curve
    const b = Math.sin(x * 0.5 * Math.PI)
    crossfaderGainARef.current.gain.value = a
    crossfaderGainBRef.current.gain.value = b
  }, [crossfaderPosition])

  // Update channel faders
  useEffect(() => {
    if (gainARef.current) gainARef.current.gain.value = deckA.channelFader
  }, [deckA.channelFader])

  useEffect(() => {
    if (gainBRef.current) gainBRef.current.gain.value = deckB.channelFader
  }, [deckB.channelFader])

  // Update EQ gains
  useEffect(() => {
    if (eqALowRef.current) eqALowRef.current.gain.value = deckA.eqLow
    if (eqAMidRef.current) eqAMidRef.current.gain.value = deckA.eqMid
    if (eqAHighRef.current) eqAHighRef.current.gain.value = deckA.eqHigh
  }, [deckA.eqLow, deckA.eqMid, deckA.eqHigh])

  useEffect(() => {
    if (eqBLowRef.current) eqBLowRef.current.gain.value = deckB.eqLow
    if (eqBMidRef.current) eqBMidRef.current.gain.value = deckB.eqMid
    if (eqBHighRef.current) eqBHighRef.current.gain.value = deckB.eqHigh
  }, [deckB.eqLow, deckB.eqMid, deckB.eqHigh])

  useEffect(() => {
    if (!filterARef.current) return
    if (filterA === 0) {
      filterARef.current.type = 'lowpass'
      filterARef.current.frequency.value = 20000
      return
    }
    const maxFreq = 20000
    const minFreq = 60
    if (filterA > 0) {
      filterARef.current.type = 'lowpass'
      const t = Math.min(1, Math.max(0, filterA))
      filterARef.current.frequency.value = maxFreq - t * (maxFreq - 1000)
    } else {
      filterARef.current.type = 'highpass'
      const t = Math.min(1, Math.max(0, Math.abs(filterA)))
      filterARef.current.frequency.value = minFreq + t * (2000 - minFreq)
    }
  }, [filterA])

  useEffect(() => {
    if (!filterBRef.current) return
    if (filterB === 0) {
      filterBRef.current.type = 'lowpass'
      filterBRef.current.frequency.value = 20000
      return
    }
    const maxFreq = 20000
    const minFreq = 60
    if (filterB > 0) {
      filterBRef.current.type = 'lowpass'
      const t = Math.min(1, Math.max(0, filterB))
      filterBRef.current.frequency.value = maxFreq - t * (maxFreq - 1000)
    } else {
      filterBRef.current.type = 'highpass'
      const t = Math.min(1, Math.max(0, Math.abs(filterB)))
      filterBRef.current.frequency.value = minFreq + t * (2000 - minFreq)
    }
  }, [filterB])

  useEffect(() => {
    if (!fxDelayARef.current || !fxFeedbackARef.current || !fxWetGainARef.current || !fxDryGainARef.current) return
    const beatDuration = getBeatDuration(deckA)
    const delayTime = beatDuration ? beatDuration * fxA.timeBeats : 0.25
    fxDelayARef.current.delayTime.value = Math.min(2.0, Math.max(0.03, delayTime))
    fxFeedbackARef.current.gain.value = Math.min(0.85, Math.max(0, fxA.feedback))
    fxWetGainARef.current.gain.value = fxA.enabled ? Math.min(1, Math.max(0, fxA.wet)) : 0
    fxDryGainARef.current.gain.value = fxA.enabled ? 1 - Math.min(1, Math.max(0, fxA.wet)) : 1
  }, [fxA, deckA.detectedBPM, deckA.playbackRate])

  useEffect(() => {
    if (!fxDelayBRef.current || !fxFeedbackBRef.current || !fxWetGainBRef.current || !fxDryGainBRef.current) return
    const beatDuration = getBeatDuration(deckB)
    const delayTime = beatDuration ? beatDuration * fxB.timeBeats : 0.25
    fxDelayBRef.current.delayTime.value = Math.min(2.0, Math.max(0.03, delayTime))
    fxFeedbackBRef.current.gain.value = Math.min(0.85, Math.max(0, fxB.feedback))
    fxWetGainBRef.current.gain.value = fxB.enabled ? Math.min(1, Math.max(0, fxB.wet)) : 0
    fxDryGainBRef.current.gain.value = fxB.enabled ? 1 - Math.min(1, Math.max(0, fxB.wet)) : 1
  }, [fxB, deckB.detectedBPM, deckB.playbackRate])

  // Load track into Deck A
  const loadTrackA = useCallback(async (track: Track) => {
    if (!audioARef.current || !audioContextRef.current) return

    try {
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      const url = await resolveAudioUrl(track.file)
      setResolvedUrlA(url)
      audioARef.current.src = url
      audioARef.current.load()

      // Wait for audio to be ready
      await new Promise((resolve) => {
        if (audioARef.current) {
          audioARef.current.addEventListener('loadedmetadata', resolve, { once: true })
        }
      })

      // Create source node
      if (sourceANodeRef.current) {
        sourceANodeRef.current.disconnect()
      }
      sourceANodeRef.current = audioContextRef.current.createMediaElementSource(audioARef.current)
      
      // Reconnect mixer graph
      if (
        analyserARef.current &&
        eqALowRef.current &&
        eqAMidRef.current &&
        eqAHighRef.current &&
        filterARef.current &&
        fxDryGainARef.current &&
        fxDelayARef.current &&
        fxFeedbackARef.current &&
        fxWetGainARef.current &&
        gainARef.current &&
        crossfaderGainARef.current &&
        masterGainRef.current
      ) {
        sourceANodeRef.current.connect(analyserARef.current)
        sourceANodeRef.current.connect(eqALowRef.current)
        eqALowRef.current.connect(eqAMidRef.current)
        eqAMidRef.current.connect(eqAHighRef.current)
        eqAHighRef.current.connect(filterARef.current)
        filterARef.current.connect(fxDryGainARef.current)
        filterARef.current.connect(fxDelayARef.current)
        fxDelayARef.current.connect(fxFeedbackARef.current)
        fxFeedbackARef.current.connect(fxDelayARef.current)
        fxDelayARef.current.connect(fxWetGainARef.current)
        fxDryGainARef.current.connect(gainARef.current)
        fxWetGainARef.current.connect(gainARef.current)
        gainARef.current.connect(crossfaderGainARef.current)
        crossfaderGainARef.current.connect(masterGainRef.current)
      }

      setDeckA(prev => ({
        ...prev,
        track,
        detectedBPM: track.bpm || null,
        playbackRate: 1.0,
        beatGridOffset: track.beat_grid_offset || 0,
      }))

      // Generate waveform
      try {
        const peakData = await generatePeakData(url)
        setDeckA(prev => ({ ...prev, waveformData: peakData.data }))
      } catch (e) {
        console.warn('Failed to generate waveform for Deck A:', e)
      }
    } catch (e) {
      console.error('Error loading track into Deck A:', e)
    }
  }, [])

  // Load track into Deck B
  const loadTrackB = useCallback(async (track: Track) => {
    if (!audioBRef.current || !audioContextRef.current) return

    try {
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      const url = await resolveAudioUrl(track.file)
      setResolvedUrlB(url)
      audioBRef.current.src = url
      audioBRef.current.load()

      // Wait for audio to be ready
      await new Promise((resolve) => {
        if (audioBRef.current) {
          audioBRef.current.addEventListener('loadedmetadata', resolve, { once: true })
        }
      })

      // Create source node
      if (sourceBNodeRef.current) {
        sourceBNodeRef.current.disconnect()
      }
      sourceBNodeRef.current = audioContextRef.current.createMediaElementSource(audioBRef.current)
      
      // Reconnect mixer graph
      if (
        analyserBRef.current &&
        eqBLowRef.current &&
        eqBMidRef.current &&
        eqBHighRef.current &&
        filterBRef.current &&
        fxDryGainBRef.current &&
        fxDelayBRef.current &&
        fxFeedbackBRef.current &&
        fxWetGainBRef.current &&
        gainBRef.current &&
        crossfaderGainBRef.current &&
        masterGainRef.current
      ) {
        sourceBNodeRef.current.connect(analyserBRef.current)
        sourceBNodeRef.current.connect(eqBLowRef.current)
        eqBLowRef.current.connect(eqBMidRef.current)
        eqBMidRef.current.connect(eqBHighRef.current)
        eqBHighRef.current.connect(filterBRef.current)
        filterBRef.current.connect(fxDryGainBRef.current)
        filterBRef.current.connect(fxDelayBRef.current)
        fxDelayBRef.current.connect(fxFeedbackBRef.current)
        fxFeedbackBRef.current.connect(fxDelayBRef.current)
        fxDelayBRef.current.connect(fxWetGainBRef.current)
        fxDryGainBRef.current.connect(gainBRef.current)
        fxWetGainBRef.current.connect(gainBRef.current)
        gainBRef.current.connect(crossfaderGainBRef.current)
        crossfaderGainBRef.current.connect(masterGainRef.current)
      }

      setDeckB(prev => ({
        ...prev,
        track,
        detectedBPM: track.bpm || null,
        playbackRate: 1.0,
        beatGridOffset: track.beat_grid_offset || 0,
      }))

      // Generate waveform
      try {
        const peakData = await generatePeakData(url)
        setDeckB(prev => ({ ...prev, waveformData: peakData.data }))
      } catch (e) {
        console.warn('Failed to generate waveform for Deck B:', e)
      }
    } catch (e) {
      console.error('Error loading track into Deck B:', e)
    }
  }, [])

  // Initialize Deck A with current track
  useEffect(() => {
    if (currentTrack && !deckA.track) {
      loadTrackA(currentTrack)
    }
  }, [currentTrack, deckA.track, loadTrackA])

  // Audio event handlers for Deck A
  useEffect(() => {
    const audio = audioARef.current
    if (!audio) return

    const updateTime = () => setDeckA(prev => ({ ...prev, currentTime: audio.currentTime }))
    const updateDuration = () => setDeckA(prev => ({ ...prev, duration: audio.duration }))
    const handlePlay = () => setDeckA(prev => ({ ...prev, isPlaying: true }))
    const handlePause = () => setDeckA(prev => ({ ...prev, isPlaying: false }))

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  // Audio event handlers for Deck B
  useEffect(() => {
    const audio = audioBRef.current
    if (!audio) return

    const updateTime = () => setDeckB(prev => ({ ...prev, currentTime: audio.currentTime }))
    const updateDuration = () => setDeckB(prev => ({ ...prev, duration: audio.duration }))
    const handlePlay = () => setDeckB(prev => ({ ...prev, isPlaying: true }))
    const handlePause = () => setDeckB(prev => ({ ...prev, isPlaying: false }))

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  // Update playback rates
  useEffect(() => {
    if (audioARef.current) audioARef.current.playbackRate = deckA.playbackRate
  }, [deckA.playbackRate])

  useEffect(() => {
    if (audioBRef.current) audioBRef.current.playbackRate = deckB.playbackRate
  }, [deckB.playbackRate])

  useEffect(() => {
    setDeckA(prev => ({ ...prev, playbackRate: snapTempoCenter(clampTempo(prev.playbackRate, tempoRangeWide)) }))
    setDeckB(prev => ({ ...prev, playbackRate: snapTempoCenter(clampTempo(prev.playbackRate, tempoRangeWide)) }))
  }, [tempoRangeWide])

  // Real-time waveform updates
  useEffect(() => {
    const updateWaveforms = () => {
      if (analyserARef.current && timeDataArrayARef.current) {
        analyserARef.current.getFloatTimeDomainData(timeDataArrayARef.current as any)
        setRealtimeWaveformA(timeDataArrayARef.current.slice())
        let sum = 0
        const bufA = timeDataArrayARef.current
        for (let i = 0; i < bufA.length; i++) {
          sum += bufA[i] * bufA[i]
        }
        setMeterA(Math.min(1, Math.sqrt(sum / bufA.length) * 2))
      }
      if (analyserBRef.current && timeDataArrayBRef.current) {
        analyserBRef.current.getFloatTimeDomainData(timeDataArrayBRef.current as any)
        setRealtimeWaveformB(timeDataArrayBRef.current.slice())
        let sum = 0
        const bufB = timeDataArrayBRef.current
        for (let i = 0; i < bufB.length; i++) {
          sum += bufB[i] * bufB[i]
        }
        setMeterB(Math.min(1, Math.sqrt(sum / bufB.length) * 2))
      }
      waveformAnimationFrameRef.current = requestAnimationFrame(updateWaveforms)
    }

    waveformAnimationFrameRef.current = requestAnimationFrame(updateWaveforms)

    return () => {
      if (waveformAnimationFrameRef.current) {
        cancelAnimationFrame(waveformAnimationFrameRef.current)
      }
    }
  }, [])

  // Keyboard shortcuts for DJ mode
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        (e.target instanceof HTMLInputElement) ||
        (e.target instanceof HTMLTextAreaElement) ||
        (e.target instanceof HTMLButtonElement && (e.target as HTMLButtonElement).type === 'button')
      ) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'q':
          // Play/Pause Deck A
          e.preventDefault()
          if (audioARef.current) {
            if (deckA.isPlaying) {
              audioARef.current.pause()
            } else {
              audioARef.current.play()
            }
          }
          break
        case 'p':
          // Play/Pause Deck B
          e.preventDefault()
          if (audioBRef.current) {
            if (deckB.isPlaying) {
              audioBRef.current.pause()
            } else {
              audioBRef.current.play()
            }
          }
          break
        case 'a':
          // Sync Deck B to Deck A
          e.preventDefault()
          if (deckA.detectedBPM && deckB.detectedBPM && deckB.track) {
            const targetBPM = deckA.detectedBPM * deckA.playbackRate
            const newRateB = targetBPM / deckB.detectedBPM
            setDeckB(prev => ({ ...prev, playbackRate: newRateB }))
          }
          break
        case 'arrowleft':
          // Move crossfader left (toward Deck A)
          e.preventDefault()
          setCrossfaderPosition(prev => Math.max(0, prev - 0.05))
          break
        case 'arrowright':
          // Move crossfader right (toward Deck B)
          e.preventDefault()
          setCrossfaderPosition(prev => Math.min(1, prev + 0.05))
          break
        case '1':
          // Increase Deck A volume
          e.preventDefault()
          setDeckA(prev => ({ ...prev, channelFader: Math.min(1, prev.channelFader + 0.05) }))
          break
        case '2':
          // Decrease Deck A volume
          e.preventDefault()
          setDeckA(prev => ({ ...prev, channelFader: Math.max(0, prev.channelFader - 0.05) }))
          break
        case '3':
          // Increase Deck B volume
          e.preventDefault()
          setDeckB(prev => ({ ...prev, channelFader: Math.min(1, prev.channelFader + 0.05) }))
          break
        case '4':
          // Decrease Deck B volume
          e.preventDefault()
          setDeckB(prev => ({ ...prev, channelFader: Math.max(0, prev.channelFader - 0.05) }))
          break
        case 'c':
          // Center crossfader
          e.preventDefault()
          setCrossfaderPosition(0.5)
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [deckA.isPlaying, deckB.isPlaying, deckA.detectedBPM, deckB.detectedBPM, deckB.track])

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, track: Track) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/x-sergik-track-id', track.id)
  }

  const handleDropOnDeck = (e: React.DragEvent, deck: 'A' | 'B') => {
    e.preventDefault()
    setDragOver(null)

    const id = e.dataTransfer.getData('application/x-sergik-track-id')
    if (!id) return

    const track = queue.find(t => t.id === id)
    if (!track) return

    if (deck === 'A') {
      requestLoadTrackA(track)
    } else {
      requestLoadTrackB(track)
    }
  }

  // Confirmation wrapper for loading tracks
  const requestLoadTrackA = (track: Track) => {
    setPendingTrackLoad({ track, deck: 'A' })
  }

  const requestLoadTrackB = (track: Track) => {
    setPendingTrackLoad({ track, deck: 'B' })
  }

  // Confirm and load track
  const confirmLoadTrack = () => {
    if (pendingTrackLoad) {
      if (pendingTrackLoad.deck === 'A') {
        loadTrackA(pendingTrackLoad.track)
      } else {
        loadTrackB(pendingTrackLoad.track)
      }
      setPendingTrackLoad(null)
    }
  }

  // Cancel track load
  const cancelLoadTrack = () => {
    setPendingTrackLoad(null)
  }

  // Click-to-load track handler
  const handleTrackClick = (track: Track, e: React.MouseEvent) => {
    // Double-click or Shift+click loads to Deck A
    if (e.detail === 2 || e.shiftKey) {
      requestLoadTrackA(track)
    }
    // Ctrl/Cmd+click loads to Deck B
    else if (e.ctrlKey || e.metaKey) {
      requestLoadTrackB(track)
    }
  }

  // Right-click context menu handler
  const handleTrackContextMenu = (track: Track, e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      track,
      x: e.clientX,
      y: e.clientY,
      visible: true,
    })
  }

  // Touch and hold handler
  const handleTouchStart = (track: Track, e: React.TouchEvent) => {
    touchHoldTimerRef.current = setTimeout(() => {
      const touch = e.touches[0]
      setContextMenu({
        track,
        x: touch.clientX,
        y: touch.clientY,
        visible: true,
      })
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
    }, 500) // 500ms hold time
  }

  const handleTouchEnd = () => {
    if (touchHoldTimerRef.current) {
      clearTimeout(touchHoldTimerRef.current)
      touchHoldTimerRef.current = null
    }
  }

  const handleTouchCancel = () => {
    if (touchHoldTimerRef.current) {
      clearTimeout(touchHoldTimerRef.current)
      touchHoldTimerRef.current = null
    }
  }

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null)
  }

  // Handle context menu actions
  const handleLoadToDeckA = () => {
    if (contextMenu?.track) {
      requestLoadTrackA(contextMenu.track)
      closeContextMenu()
    }
  }

  const handleLoadToDeckB = () => {
    if (contextMenu?.track) {
      requestLoadTrackB(contextMenu.track)
      closeContextMenu()
    }
  }

  // Beat sync function
  const syncBPM = useCallback(() => {
    if (!deckA.detectedBPM || !deckB.detectedBPM || !deckB.track) return
    
    // Sync Deck B to Deck A's BPM
    const targetBPM = deckA.detectedBPM * deckA.playbackRate
    const newRateB = targetBPM / deckB.detectedBPM
    setDeckB(prev => ({ ...prev, playbackRate: newRateB }))
  }, [deckA.detectedBPM, deckA.playbackRate, deckB.detectedBPM, deckB.track])

  const getQuantizedTime = (time: number, deckState: DeckState, duration?: number) => {
    if (!deckState.detectedBPM) return time
    const bpm = deckState.detectedBPM * deckState.playbackRate
    if (!Number.isFinite(bpm) || bpm <= 0) return time
    const beatDuration = 60 / bpm
    const offset = deckState.beatGridOffset || 0
    const beatIndex = Math.round((time - offset) / beatDuration)
    const quantized = offset + beatIndex * beatDuration
    const clamped = Math.max(0, quantized)
    if (typeof duration === 'number' && Number.isFinite(duration)) {
      return Math.min(duration, clamped)
    }
    return clamped
  }

  // Loop functionality - create loop at current position
  const handleLoopToggle = (deck: 'A' | 'B') => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    const setLoopState = deck === 'A' ? setDeckALoop : setDeckBLoop
    
    if (!audioRef.current || !deckState.track || deckState.duration === 0) return
    
    const currentTime = getQuantizedTime(
      audioRef.current.currentTime,
      deckState,
      deckState.duration
    )
    
    if (deckState.loopIn === null) {
      // Set loop in point
      setDeck(prev => ({ ...prev, loopIn: currentTime }))
      setLoopState(true)
    } else if (deckState.loopOut === null) {
      // Set loop out point
      if (currentTime > deckState.loopIn) {
        setDeck(prev => ({ ...prev, loopOut: currentTime }))
      }
    } else {
      // Clear loop
      setDeck(prev => ({ ...prev, loopIn: null, loopOut: null }))
      setLoopState(false)
    }
  }

  // Hot cues - add/remove cue points
  const handleHotCueClick = (deck: 'A' | 'B') => {
    setShowHotCuesModal(deck)
  }

  const addHotCue = (deck: 'A' | 'B', label?: string) => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    const setHotCues = deck === 'A' ? setDeckAHotCues : setDeckBHotCues
    
    if (!audioRef.current || !deckState.track) return
    
    const currentTime = getQuantizedTime(
      audioRef.current.currentTime,
      deckState,
      deckState.duration
    )
    const newCue = { time: currentTime, label }
    
    setDeck(prev => ({
      ...prev,
      hotCues: [...prev.hotCues, newCue].sort((a, b) => a.time - b.time)
    }))
    
    // Also update the separate hot cues state for button highlighting
    setHotCues(prev => [...prev, currentTime].sort((a, b) => a - b))
  }

  const removeHotCue = (deck: 'A' | 'B', index: number) => {
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    const setHotCues = deck === 'A' ? setDeckAHotCues : setDeckBHotCues
    const deckState = deck === 'A' ? deckA : deckB
    
    const cueToRemove = deckState.hotCues[index]
    
    setDeck(prev => ({
      ...prev,
      hotCues: prev.hotCues.filter((_, i) => i !== index)
    }))
    
    // Also update the separate hot cues state
    if (cueToRemove) {
      setHotCues(prev => prev.filter(t => t !== cueToRemove.time))
    }
  }

  const jumpToHotCue = (deck: 'A' | 'B', time: number) => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    
    if (audioRef.current) {
      audioRef.current.currentTime = time
      if (deck === 'A') {
        setDeckA(prev => ({ ...prev, currentTime: time }))
      } else {
        setDeckB(prev => ({ ...prev, currentTime: time }))
      }
    }
  }

  // Cue button - jump to beginning or last cue
  const handleCueButton = (deck: 'A' | 'B') => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    
    if (!audioRef.current || !deckState.track) return
    
    // If there are hot cues, jump to the last one before current position
    const cuesBeforeNow = deckState.hotCues.filter(cue => cue.time < deckState.currentTime)
    if (cuesBeforeNow.length > 0) {
      const lastCue = cuesBeforeNow[cuesBeforeNow.length - 1]
      audioRef.current.currentTime = lastCue.time
      setDeck(prev => ({ ...prev, currentTime: lastCue.time }))
    } else {
      // Jump to beginning
      audioRef.current.currentTime = 0
      setDeck(prev => ({ ...prev, currentTime: 0 }))
    }
  }

  // SET button - set cue point or loop point
  const handleSetButton = (deck: 'A' | 'B') => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const deckState = deck === 'A' ? deckA : deckB
    
    if (!audioRef.current || !deckState.track) return
    
    const currentTime = getQuantizedTime(
      audioRef.current.currentTime,
      deckState,
      deckState.duration
    )
    
    // If loop is active, set loop out point
    if (deckState.loopIn !== null && deckState.loopOut === null) {
      if (deck === 'A') {
        setDeckA(prev => ({ ...prev, loopOut: currentTime }))
        setDeckALoop(true)
      } else {
        setDeckB(prev => ({ ...prev, loopOut: currentTime }))
        setDeckBLoop(true)
      }
    } else {
      // Otherwise, add a hot cue
      addHotCue(deck, `Cue ${(deckState.hotCues.length + 1)}`)
    }
  }

  // Arrow buttons - jump forward/backward
  const handleJumpForward = (deck: 'A' | 'B', seconds: number = 10) => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    
    if (!audioRef.current || !deckState.track) return
    
    const newTime = Math.min(deckState.duration, deckState.currentTime + seconds)
    audioRef.current.currentTime = newTime
    setDeck(prev => ({ ...prev, currentTime: newTime }))
  }

  const handleJumpBackward = (deck: 'A' | 'B', seconds: number = 10) => {
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    
    if (!audioRef.current || !deckState.track) return
    
    const newTime = Math.max(0, deckState.currentTime - seconds)
    audioRef.current.currentTime = newTime
    setDeck(prev => ({ ...prev, currentTime: newTime }))
  }

  // Sampler functionality
  const handleSamplerToggle = (deck: 'A' | 'B') => {
    const setSampler = deck === 'A' ? setDeckASampler : setDeckBSampler
    const samplerState = deck === 'A' ? deckASampler : deckBSampler
    
    setSampler(!samplerState)
    // TODO: Implement sampler playback (play short audio clips)
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu?.visible) {
        const target = e.target as HTMLElement
        if (!target.closest('.context-menu') && !target.closest('[data-track-item]')) {
          closeContextMenu()
        }
      }
    }

    if (contextMenu?.visible) {
      document.addEventListener('click', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
      }
    }
  }, [contextMenu])

  // Fetch all folders
  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const response = await fetch('/api/music-library/folders')
        const data = await response.json()
        const folders = data.folders || []
        setAllFolders(folders)
        // Get root folders (no parent_id or parent_id is null)
        const roots = folders.filter((f: any) => !f.parent_id || f.parent_id === null)
        setRootFolders(roots.sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0) || a.name.localeCompare(b.name)))
      } catch (error) {
        console.error('Failed to fetch folders:', error)
      }
    }
    
    fetchFolders()
  }, [])

  // Get child folders for a given parent ID
  const getChildFolders = useCallback((parentId: string | null) => {
    if (parentId === null) {
      return rootFolders
    }
    return allFolders
      .filter((f: any) => f.parent_id === parentId)
      .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0) || a.name.localeCompare(b.name))
  }, [allFolders, rootFolders])

  // Handle folder selection
  const handleFolderSelect = async (folderId: string | null) => {
    setSelectedFolderId(folderId)
    
    if (folderId === null) {
      setExpandedFolderId(null)
      setFolderTracks([])
    } else {
      // Find the folder in allFolders
      const folder = allFolders.find((f: any) => f.id === folderId)
      if (folder) {
        // Check if folder has children
        const children = getChildFolders(folderId)
        if (children.length > 0) {
          // Expand to show children in the same row
          setExpandedFolderId(folderId)
        } else {
          // No children, just select it
          setExpandedFolderId(null)
        }
        
        // Fetch tracks from this folder
        try {
          const response = await fetch(`/api/music-library/tracks?folderId=${folderId}`)
          const data = await response.json()
          const tracks = (data.tracks || []).map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist || 'SERGIK',
            duration: t.duration || 0,
            file: t.file || t.file_url,
            artwork: t.artwork || t.artwork_url,
            folder_id: t.folderId || t.folder_id,
            bpm: t.bpm,
            beat_grid_offset: t.beat_grid_offset ?? 0,
          }))
          setFolderTracks(tracks)
        } catch (error) {
          console.error('Failed to fetch folder tracks:', error)
          setFolderTracks([])
        }
      }
    }
  }

  const fetchAutoDJLibrary = useCallback(async () => {
    try {
      const response = await fetch('/api/music-library/tracks')
      const data = await response.json()
      const tracks = (data.tracks || []).map((t: any) => ({
        ...t,
        beat_grid_offset: t.beat_grid_offset ?? 0,
      }))
      setAutoDJLibraryTracks(tracks)
    } catch (error) {
      console.error('Failed to fetch Auto DJ library tracks:', error)
      setAutoDJLibraryTracks([])
    }
  }, [])

  useEffect(() => {
    if (!autoDJEnabled || autoDJMode !== 'curate' || autoDJLibraryTracks.length > 0) return
    fetchAutoDJLibrary()
  }, [autoDJEnabled, autoDJMode, autoDJLibraryTracks.length, fetchAutoDJLibrary])

  const startAutoMix = useCallback((
    fromDeck: 'A' | 'B',
    toDeck: 'A' | 'B',
    mixDuration: number
  ) => {
    if (autoDJInProgressRef.current) return
    autoDJInProgressRef.current = true
    setAutoDJStatus('Mixing...')

    const targetAudio = toDeck === 'A' ? audioARef.current : audioBRef.current
    const targetDeck = toDeck === 'A' ? deckAStateRef.current : deckBStateRef.current
    const sourceDeck = fromDeck === 'A' ? deckAStateRef.current : deckBStateRef.current
    const sourceAudio = fromDeck === 'A' ? audioARef.current : audioBRef.current

    if (targetAudio) {
      // Align beat phase with source deck
      const sourcePhase = getPhase(sourceDeck) ?? 0
      const beatDuration = getBeatDuration(targetDeck)
      if (beatDuration) {
        const startTime = (targetDeck.beatGridOffset || 0) + sourcePhase * beatDuration
        const duration = targetAudio.duration || targetDeck.duration || 0
        targetAudio.currentTime = Math.max(0, Math.min(duration, startTime))
      }
      targetAudio.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('Auto DJ: failed to start target deck:', err)
        }
      })
    }

    const steps = 40
    const stepMs = (mixDuration * 1000) / steps
    let step = 0

    const mixInterval = setInterval(() => {
      step += 1
      const t = Math.min(1, step / steps)
      applyAutoMixStep(t, fromDeck, autoDJTransitionMode)

      if (t >= 1) {
        clearInterval(mixInterval)
        resetAutoMixEQ(fromDeck)

        // Stop source deck to avoid dual playback
        if (sourceAudio) {
          sourceAudio.pause()
        }

        // Finalize crossfader position
        setCrossfaderPosition(fromDeck === 'A' ? 1 : 0)
        autoDJInProgressRef.current = false
        setAutoDJStatus('Locked')
      }
    }, stepMs)
  }, [applyAutoMixStep, autoDJTransitionMode, getBeatDuration, getPhase, resetAutoMixEQ])

  useEffect(() => {
    if (!autoDJEnabled) {
      setAutoDJStatus('Idle')
      setAutoDJNextTrack(null)
      autoDJInProgressRef.current = false
      autoDJPreparingRef.current = false
      if (autoDJIntervalRef.current) clearInterval(autoDJIntervalRef.current)
      if (autoDJMixTimeoutRef.current) clearTimeout(autoDJMixTimeoutRef.current)
      return
    }

    const tick = async () => {
      if (!autoDJEnabled || autoDJInProgressRef.current) return

      const primaryDeck = getDeckForMix()
      const secondaryDeck = primaryDeck === 'A' ? 'B' : 'A'
      const activeDeck = primaryDeck === 'A' ? deckAStateRef.current : deckBStateRef.current
      const idleDeck = primaryDeck === 'A' ? deckBStateRef.current : deckAStateRef.current
      const idleAudio = primaryDeck === 'A' ? audioBRef.current : audioARef.current

      if (!activeDeck.track || !activeDeck.isPlaying) {
        setAutoDJStatus('Waiting for playback')
        return
      }

      rememberRecentTrack(activeDeck.track.id)

      if (!idleDeck.track || idleDeck.track.id === activeDeck.track.id) {
        if (autoDJPreparingRef.current) return
        autoDJPreparingRef.current = true

        let nextTrack: Track | null = null
        if (autoDJMode === 'queue') {
          nextTrack = pickNextTrackFromQueue(activeDeck.track.id)
        } else {
          const pool = selectedFolderIdRef.current ? folderTracksRef.current : queueRef.current
          const curatedPool = pool.length > 0 ? pool : autoDJLibraryTracks
          nextTrack = pickCuratedTrack(activeDeck.track, curatedPool)
        }

        if (nextTrack) {
          if (nextTrack.id !== autoDJLastPreparedTrackIdRef.current) {
            setAutoDJNextTrack(nextTrack)
            autoDJLastPreparedTrackIdRef.current = nextTrack.id
          }

          if (autoDJMode === 'curate' && autoDJAddToQueue) {
            const currentQueue = queueRef.current
            if (!currentQueue.find((t) => t.id === nextTrack!.id)) {
              onQueueChange?.([...currentQueue, nextTrack])
            }
          }

          if (secondaryDeck === 'A') {
            await loadTrackA(nextTrack)
          } else {
            await loadTrackB(nextTrack)
          }

          if (idleAudio) {
            idleAudio.preload = 'auto'
            idleAudio.load()
          }
          setAutoDJStatus(`Prebuffered: ${nextTrack.title}`)
        } else {
          setAutoDJStatus('No suitable track found')
        }
        autoDJPreparingRef.current = false
      }

      if (!idleDeck.track) return

      const beatDuration = getBeatDuration(activeDeck)
      if (!beatDuration || !activeDeck.duration) return

      const phraseBeats = autoDJPhraseBars * 4
      const phraseDuration = phraseBeats * beatDuration
      const remaining = activeDeck.duration - activeDeck.currentTime

      if (remaining <= phraseDuration * 1.1 && !autoDJInProgressRef.current) {
        const delay = getTimeToNextPhrase(activeDeck, phraseBeats)
        if (autoDJMixTimeoutRef.current) clearTimeout(autoDJMixTimeoutRef.current)
        autoDJMixTimeoutRef.current = setTimeout(() => {
          startAutoMix(primaryDeck, secondaryDeck, phraseDuration)
        }, Math.max(0, delay * 1000))
        setAutoDJStatus('Queued mix')
      }
    }

    autoDJIntervalRef.current = setInterval(() => {
      tick().catch((err) => console.warn('Auto DJ tick failed:', err))
    }, 500)

    return () => {
      if (autoDJIntervalRef.current) clearInterval(autoDJIntervalRef.current)
      if (autoDJMixTimeoutRef.current) clearTimeout(autoDJMixTimeoutRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoDJEnabled,
    autoDJMode,
    autoDJPhraseBars,
    autoDJAddToQueue,
    autoDJLibraryTracks,
    onQueueChange,
    getBeatDuration,
    loadTrackA,
    loadTrackB,
  ])

  // Handle navigating to a child folder
  const handleChildFolderSelect = (folderId: string) => {
    handleFolderSelect(folderId)
  }

  // Get tracks to display - either from selected folder or full queue
  const filteredQueue = useMemo(() => {
    // If a folder is selected, show tracks from that folder
    if (selectedFolderId !== null && folderTracks.length > 0) {
      // Find current track index in the folder tracks
      const currentIndex = currentTrack ? folderTracks.findIndex(t => t.id === currentTrack.id) : -1
      
      // Sort: unplayed tracks (after current) first, then played tracks (before/at current)
      if (currentIndex >= 0) {
        return folderTracks.sort((a, b) => {
          const indexA = folderTracks.findIndex(t => t.id === a.id)
          const indexB = folderTracks.findIndex(t => t.id === b.id)
          
          const isUnplayedA = indexA > currentIndex
          const isUnplayedB = indexB > currentIndex
          
          // Unplayed tracks come first
          if (isUnplayedA && !isUnplayedB) return -1
          if (!isUnplayedA && isUnplayedB) return 1
          
          // If both are unplayed or both are played, maintain original order
          return indexA - indexB
        })
      }
      
      return folderTracks
    }
    
    // Otherwise, show all tracks from queue
    let filtered = queue
    
    // Find current track index in the full queue
    const currentIndex = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1
    
    // Sort: unplayed tracks (after current) first, then played tracks (before/at current)
    if (currentIndex >= 0) {
      return filtered.sort((a, b) => {
        const indexA = queue.findIndex(t => t.id === a.id)
        const indexB = queue.findIndex(t => t.id === b.id)
        
        // Both tracks are in the queue
        if (indexA >= 0 && indexB >= 0) {
          const isUnplayedA = indexA > currentIndex
          const isUnplayedB = indexB > currentIndex
          
          // Unplayed tracks come first
          if (isUnplayedA && !isUnplayedB) return -1
          if (!isUnplayedA && isUnplayedB) return 1
          
          // If both are unplayed or both are played, maintain original order
          return indexA - indexB
        }
        
        // If one track is not in queue, maintain original order
        return 0
      })
    }
    
    // If no current track, return filtered queue as-is
    return filtered
  }, [selectedFolderId, folderTracks, queue, currentTrack])

  // Maintain loop playback for Deck A
  useEffect(() => {
    if (!deckALoop || deckA.loopIn === null || deckA.loopOut === null || !audioARef.current) return
    
    const checkLoop = () => {
      if (audioARef.current && deckA.isPlaying) {
        if (deckA.loopOut !== null && audioARef.current.currentTime >= deckA.loopOut) {
          if (deckA.loopIn !== null) {
            audioARef.current.currentTime = deckA.loopIn
          }
        }
        if (deckA.isPlaying) {
          requestAnimationFrame(checkLoop)
        }
      }
    }
    
    const interval = setInterval(checkLoop, 50)
    return () => clearInterval(interval)
  }, [deckALoop, deckA.loopIn, deckA.loopOut, deckA.isPlaying])

  // Maintain loop playback for Deck B
  useEffect(() => {
    if (!deckBLoop || deckB.loopIn === null || deckB.loopOut === null || !audioBRef.current) return
    
    const checkLoop = () => {
      if (audioBRef.current && deckB.isPlaying) {
        if (deckB.loopOut !== null && audioBRef.current.currentTime >= deckB.loopOut) {
          if (deckB.loopIn !== null) {
            audioBRef.current.currentTime = deckB.loopIn
          }
        }
        if (deckB.isPlaying) {
          requestAnimationFrame(checkLoop)
        }
      }
    }
    
    const interval = setInterval(checkLoop, 50)
    return () => clearInterval(interval)
  }, [deckBLoop, deckB.loopIn, deckB.loopOut, deckB.isPlaying])

  // Pseudo-smart EQ: auto-adjust based on frequency analysis
  useEffect(() => {
    if (!deckA.smartEQEnabled || !analyserARef.current || !audioContextRef.current) return

    const updateSmartEQ = () => {
      if (!analyserARef.current) return
      const frequencyData = new Float32Array(analyserARef.current.frequencyBinCount)
      analyserARef.current.getFloatFrequencyData(frequencyData)
      
      const bands = analyzeFrequencyBands(frequencyData, audioContextRef.current!.sampleRate)
      
      // Auto-adjust EQ based on frequency content
      // Boost low if kicks are strong, reduce if weak
      const lowAdjust = Math.max(-12, Math.min(12, (bands.kicks - 0.5) * 24))
      const midAdjust = Math.max(-12, Math.min(12, (bands.snares - 0.5) * 24))
      const highAdjust = Math.max(-12, Math.min(12, ((bands.hihats + bands.cymbals) / 2 - 0.5) * 24))

      setDeckA(prev => ({
        ...prev,
        eqLow: prev.eqLow + (lowAdjust - prev.eqLow) * 0.1, // Smooth transition
        eqMid: prev.eqMid + (midAdjust - prev.eqMid) * 0.1,
        eqHigh: prev.eqHigh + (highAdjust - prev.eqHigh) * 0.1,
      }))
    }

    const interval = setInterval(updateSmartEQ, 200) // Update every 200ms
    return () => clearInterval(interval)
  }, [deckA.smartEQEnabled])

  useEffect(() => {
    if (!deckB.smartEQEnabled || !analyserBRef.current || !audioContextRef.current) return

    const updateSmartEQ = () => {
      if (!analyserBRef.current) return
      const frequencyData = new Float32Array(analyserBRef.current.frequencyBinCount)
      analyserBRef.current.getFloatFrequencyData(frequencyData)
      
      const bands = analyzeFrequencyBands(frequencyData, audioContextRef.current!.sampleRate)
      
      const lowAdjust = Math.max(-12, Math.min(12, (bands.kicks - 0.5) * 24))
      const midAdjust = Math.max(-12, Math.min(12, (bands.snares - 0.5) * 24))
      const highAdjust = Math.max(-12, Math.min(12, ((bands.hihats + bands.cymbals) / 2 - 0.5) * 24))

      setDeckB(prev => ({
        ...prev,
        eqLow: prev.eqLow + (lowAdjust - prev.eqLow) * 0.1,
        eqMid: prev.eqMid + (midAdjust - prev.eqMid) * 0.1,
        eqHigh: prev.eqHigh + (highAdjust - prev.eqHigh) * 0.1,
      }))
    }

    const interval = setInterval(updateSmartEQ, 200)
    return () => clearInterval(interval)
  }, [deckB.smartEQEnabled])

  useEffect(() => {
    const el = eqStackRef.current
    if (!el) return
    const update = () => setEqStackHeight(el.getBoundingClientRect().height)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = eqContainerRef.current
    if (!el) return
    const update = () => setEqContainerHeight(el.getBoundingClientRect().height)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const deckClass = (which: 'A' | 'B') =>
    `rounded-lg border p-3 transition-colors ${
      dragOver === which ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800 bg-gray-900/40'
    }`

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const setLoopByBeats = (deck: 'A' | 'B', beats: number) => {
    const deckState = deck === 'A' ? deckA : deckB
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    const setLoopState = deck === 'A' ? setDeckALoop : setDeckBLoop
    if (!audioRef.current || !deckState.track || deckState.duration === 0) return
    const beatDuration = getBeatDuration(deckState)
    const start = getQuantizedTime(audioRef.current.currentTime, deckState, deckState.duration)
    const length = beatDuration ? beatDuration * beats : beats
    const end = Math.min(deckState.duration, start + length)
    setDeck(prev => ({ ...prev, loopIn: start, loopOut: end }))
    setLoopState(true)
  }

  const clearLoop = (deck: 'A' | 'B') => {
    if (deck === 'A') {
      setDeckA(prev => ({ ...prev, loopIn: null, loopOut: null }))
      setDeckALoop(false)
    } else {
      setDeckB(prev => ({ ...prev, loopIn: null, loopOut: null }))
      setDeckBLoop(false)
    }
  }

  const handleBeatJump = (deck: 'A' | 'B', beats: number, direction: -1 | 1) => {
    const deckState = deck === 'A' ? deckA : deckB
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    if (!audioRef.current || !deckState.track || deckState.duration === 0) return
    const beatDuration = getBeatDuration(deckState)
    const jumpSec = beatDuration ? beatDuration * beats : beats
    const newTime = Math.max(0, Math.min(deckState.duration, audioRef.current.currentTime + direction * jumpSec))
    audioRef.current.currentTime = newTime
    setDeck(prev => ({ ...prev, currentTime: newTime }))
  }

  const isShiftActive = (deck: 'A' | 'B') => (deck === 'A' ? deckAShift : deckBShift)
  
  const getTempoBounds = (wide: boolean) => {
    const range = wide ? 0.16 : 0.08
    return { min: 1 - range, max: 1 + range }
  }

  const clampTempo = (rate: number, wide: boolean) => {
    const { min, max } = getTempoBounds(wide)
    return Math.min(max, Math.max(min, rate))
  }

  const snapTempoCenter = (rate: number) => {
    return Math.abs(rate - 1) <= 0.0005 ? 1 : rate
  }

  const handleTapTempo = (deck: 'A' | 'B') => {
    const now = performance.now()
    const tapsRef = deck === 'A' ? tapTempoARef : tapTempoBRef
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    const taps = tapsRef.current.filter((t) => now - t < 2000)
    taps.push(now)
    tapsRef.current = taps.slice(-6)
    if (tapsRef.current.length < 2) return
    const intervals: number[] = []
    for (let i = 1; i < tapsRef.current.length; i++) {
      intervals.push(tapsRef.current[i] - tapsRef.current[i - 1])
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
    if (!avgMs || !Number.isFinite(avgMs)) return
    const tapBpm = 60000 / avgMs
    const baseBpm = deckState.detectedBPM || deckState.track?.bpm
    if (!baseBpm) return
    const nextRate = clampTempo(tapBpm / baseBpm, tempoRangeWide)
    setDeck(prev => ({ ...prev, playbackRate: snapTempoCenter(nextRate) }))
  }

  const getDeckRingStyle = (value: number, color: string): CSSProperties => {
    const clamped = Math.max(-1, Math.min(1, value))
    const pct = (clamped + 1) / 2
    const deg = 270 * pct + 135
    return {
      background: `conic-gradient(${color} 0deg ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`,
    }
  }

  const Knob = ({
    label,
    value,
    min,
    max,
    step,
    onChange,
    color = 'rgba(249,115,22,0.95)',
  }: {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (next: number) => void
    color?: string
  }) => {
    const startRef = useRef<{ y: number; v: number } | null>(null)
    const pct = (value - min) / (max - min)
    const angle = 270 * pct - 135
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className="w-12 h-12 rounded-full p-[2px] bg-gray-900 border border-gray-800 shadow-[inset_0_0_8px_rgba(0,0,0,0.7)] relative"
          style={getDeckRingStyle(((value - min) / (max - min)) * 2 - 1, color)}
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            startRef.current = { y: e.clientY, v: value }
          }}
          onPointerMove={(e) => {
            if (!startRef.current) return
            const delta = (startRef.current.y - e.clientY) * (max - min) * 0.005
            const next = Math.min(max, Math.max(min, startRef.current.v + delta))
            const snapped = Math.round(next / step) * step
            onChange(snapped)
          }}
          onPointerUp={() => {
            startRef.current = null
          }}
        >
          {/* Tick ring */}
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_-135deg,rgba(255,255,255,0.15)_0deg,rgba(255,255,255,0.15)_2deg,rgba(0,0,0,0)_6deg,rgba(0,0,0,0)_12deg,rgba(255,255,255,0.15)_12deg,rgba(255,255,255,0.15)_14deg,rgba(0,0,0,0)_18deg,rgba(0,0,0,0)_24deg)] opacity-40" />
          <div className="w-full h-full rounded-full bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 relative shadow-[inset_0_1px_4px_rgba(255,255,255,0.08),inset_0_-6px_12px_rgba(0,0,0,0.6)]">
            <div className="absolute inset-1 rounded-full bg-gradient-to-b from-white/12 to-transparent" />
            <div className="absolute inset-0 rounded-full shadow-[inset_0_0_10px_rgba(0,0,0,0.7)]" />
            <div
              className="absolute top-1/2 left-1/2 w-1 h-4 bg-gray-200 rounded shadow-[0_0_6px_rgba(255,255,255,0.4)]"
              style={{
                transform: `translate(-50%, -80%) rotate(${angle}deg)`,
                transformOrigin: '50% 100%',
              }}
            />
            <div className="absolute inset-3 rounded-full bg-black/40 border border-gray-800" />
          </div>
        </div>
        <div className="text-[9px] text-gray-400 tracking-wide">{label}</div>
        <div className="text-[8px] text-gray-500 font-mono">{value.toFixed(2)}</div>
      </div>
    )
  }

  const phaseDiff = useMemo(() => {
    const phaseA = getPhase(deckA)
    const phaseB = getPhase(deckB)
    if (phaseA === null || phaseB === null) return null
    let diff = phaseB - phaseA
    if (diff > 0.5) diff -= 1
    if (diff < -0.5) diff += 1
    return diff
  }, [deckA, deckB, getPhase])

  const rememberRecentTrack = (trackId: string) => {
    const next = [trackId, ...recentTrackIdsRef.current.filter((id) => id !== trackId)]
    recentTrackIdsRef.current = next.slice(0, 10)
  }

  const getDeckForMix = () => {
    const a = deckAStateRef.current
    const b = deckBStateRef.current
    if (a.isPlaying && !b.isPlaying) return 'A'
    if (b.isPlaying && !a.isPlaying) return 'B'
    return crossfaderPositionRef.current <= 0.5 ? 'A' : 'B'
  }

  const getTimeToNextPhrase = (deckState: DeckState, phraseBeats: number) => {
    const beatDuration = getBeatDuration(deckState)
    if (!beatDuration) return 0
    const offset = deckState.beatGridOffset || 0
    const beatIndex = Math.floor((deckState.currentTime - offset) / beatDuration)
    const remainder = ((beatIndex % phraseBeats) + phraseBeats) % phraseBeats
    const beatsToNext = remainder === 0 ? phraseBeats : phraseBeats - remainder
    const nextTime = offset + (beatIndex + beatsToNext) * beatDuration
    return Math.max(0, nextTime - deckState.currentTime)
  }

  const scoreCandidateTrack = (current: Track, candidate: Track) => {
    let score = 0
    if (current.bpm && candidate.bpm) {
      const bpmDiff = Math.abs(current.bpm - candidate.bpm)
      score += Math.max(0, 1 - bpmDiff / 15) * 0.5
    }
    if (typeof current.energy_level === 'number' && typeof candidate.energy_level === 'number') {
      const energyDiff = Math.abs(current.energy_level - candidate.energy_level)
      score += Math.max(0, 1 - energyDiff / 0.4) * 0.25
    }
    if (current.key_signature && candidate.key_signature) {
      if (current.key_signature === candidate.key_signature) {
        score += 0.2
      } else if (current.key_signature.includes(candidate.key_signature) || candidate.key_signature.includes(current.key_signature)) {
        score += 0.1
      }
    }
    if (typeof current.danceability === 'number' && typeof candidate.danceability === 'number') {
      const danceDiff = Math.abs(current.danceability - candidate.danceability)
      score += Math.max(0, 1 - danceDiff / 0.35) * 0.05
    }
    return score
  }

  const pickNextTrackFromQueue = (currentId: string) => {
    const currentQueue = queueRef.current
    if (currentQueue.length === 0) return null
    const idx = currentQueue.findIndex((t) => t.id === currentId)
    if (idx >= 0 && idx < currentQueue.length - 1) return currentQueue[idx + 1]
    if (idx >= 0 && idx === currentQueue.length - 1) return currentQueue[0]
    return currentQueue.find((t) => t.id !== currentId) || null
  }

  const pickCuratedTrack = (current: Track, available: Track[]) => {
    const recentIds = new Set(recentTrackIdsRef.current)
    const candidates = available.filter((t) => t.id !== current.id && !recentIds.has(t.id))
    if (candidates.length === 0) return null
    let best = candidates[0]
    let bestScore = scoreCandidateTrack(current, best)
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i]
      const score = scoreCandidateTrack(current, candidate)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    return best
  }

  const getViewWindow = (deckState: DeckState) => {
    const duration = deckState.duration
    if (!Number.isFinite(duration) || duration <= 0) {
      return { start: 0, end: 0 }
    }
    const beatDuration = getBeatDuration(deckState)
    if (!beatDuration || waveformZoomBeats === 0) {
      return { start: 0, end: duration }
    }
    const windowSize = Math.min(duration, waveformZoomBeats * beatDuration)
    let start = deckState.currentTime - windowSize / 2
    let end = start + windowSize
    if (start < 0) {
      start = 0
      end = windowSize
    }
    if (end > duration) {
      end = duration
      start = Math.max(0, end - windowSize)
    }
    return { start, end }
  }

  const getTravelWindow = (deckState: DeckState, futureBias: number = 0.5) => {
    const duration = deckState.duration
    if (!Number.isFinite(duration) || duration <= 0) {
      return { start: 0, end: 0 }
    }
    const beatDuration = getBeatDuration(deckState)
    if (!beatDuration || waveformZoomBeats === 0) {
      return { start: deckState.currentTime - duration * (1 - futureBias), end: deckState.currentTime + duration * futureBias }
    }
    const windowSize = Math.min(duration, waveformZoomBeats * beatDuration)
    return {
      start: deckState.currentTime - windowSize * (1 - futureBias),
      end: deckState.currentTime + windowSize * futureBias,
    }
  }

  const mapTimeToX = (time: number, window: { start: number; end: number }) => {
    if (time < window.start || time > window.end) return null
    const span = window.end - window.start
    if (span <= 0) return null
    return ((time - window.start) / span) * 100
  }

  const getWaveformBarsCount = (zoomBeats: number, dataLen: number) => {
    if (dataLen <= 0) return 0
    let target = 240
    if (zoomBeats === 0) target = 220
    else if (zoomBeats >= 32) target = 140
    else if (zoomBeats >= 16) target = 200
    else if (zoomBeats >= 8) target = 260
    else if (zoomBeats >= 4) target = 320
    else if (zoomBeats >= 2) target = 380
    else target = 440
    return Math.min(dataLen, target)
  }

  const scheduleBeatGridSave = (deck: 'A' | 'B', offset: number) => {
    const deckState = deck === 'A' ? deckA : deckB
    const timeoutRef = deck === 'A' ? beatGridSaveTimeoutARef : beatGridSaveTimeoutBRef
    if (!deckState.track?.id) return
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/music-library/tracks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: deckState.track?.id,
            beat_grid_offset: offset,
          }),
        })
      } catch (e) {
        console.warn('Failed to persist beat grid offset:', e)
      }
    }, 800)
  }

  const nudgeBeatGrid = (deck: 'A' | 'B', direction: -1 | 1) => {
    const deckState = deck === 'A' ? deckA : deckB
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    const beatDuration = getBeatDuration(deckState)
    if (!beatDuration) return
    const step = beatDuration / 16
    setDeck(prev => {
      const nextOffset = (prev.beatGridOffset || 0) + direction * step
      scheduleBeatGridSave(deck, nextOffset)
      return { ...prev, beatGridOffset: nextOffset }
    })
  }

  const setDownbeatNow = (deck: 'A' | 'B') => {
    const deckState = deck === 'A' ? deckA : deckB
    const audioRef = deck === 'A' ? audioARef : audioBRef
    const setDeck = deck === 'A' ? setDeckA : setDeckB
    if (!audioRef.current || !deckState.track) return
    const currentTime = audioRef.current.currentTime
    setDeck(prev => {
      scheduleBeatGridSave(deck, currentTime)
      return { ...prev, beatGridOffset: currentTime }
    })
  }

  // Jog wheel handlers
  const handleJogWheelDrag = useCallback((deck: 'A' | 'B', e: React.MouseEvent) => {
    const isDeckA = deck === 'A'
    const setJogPosition = isDeckA ? setJogWheelAPosition : setJogWheelBPosition
    const setIsDragging = isDeckA ? setIsDraggingJogA : setIsDraggingJogB
    const audioRef = isDeckA ? audioARef : audioBRef
    const deckState = isDeckA ? deckA : deckB
    const currentJogPos = isDeckA ? jogWheelAPosition : jogWheelBPosition

    setIsDragging(true)
    const rect = e.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    let lastAngle = currentJogPos
    
    const handleMove = (moveEvent: MouseEvent) => {
      const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * (180 / Math.PI)
      setJogPosition(angle)
      // Adjust playback position based on drag
      if (audioRef.current && deckState.duration > 0) {
        const delta = (angle - lastAngle) / 360
        const newTime = Math.max(0, Math.min(deckState.duration, (audioRef.current.currentTime || 0) + delta * 2))
        audioRef.current.currentTime = newTime
        lastAngle = angle
      }
    }
    
    const handleUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [deckA, deckB, jogWheelAPosition, jogWheelBPosition])

  return (
    <div>
      {/* Library Directory - Single Row */}
      <div className="border-t border-gray-800 pt-1 mb-1">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold text-white">Library</div>
        </div>
        
        {/* Single row with folders and subfolders */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {expandedFolderId && (
            <button
              onClick={() => handleFolderSelect(null)}
              className="px-3 py-2 rounded text-xs border touch-manipulation min-h-[44px] whitespace-nowrap transition-all flex items-center gap-1 bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              title="Go back to root"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          {!expandedFolderId && (
            <button
              onClick={() => handleFolderSelect(null)}
              className={`px-3 py-2 rounded text-xs border touch-manipulation min-h-[44px] whitespace-nowrap transition-all flex items-center gap-1 ${
                selectedFolderId === null
                  ? 'bg-blue-600/30 border-blue-500 text-white ring-2 ring-blue-500/50'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
              title="Show all tracks"
            >
              All Tracks
            </button>
          )}
          {/* Show root folders if not expanded, or child folders if expanded */}
          {(expandedFolderId ? getChildFolders(expandedFolderId) : rootFolders).map((folder) => (
            <button
              key={folder.id}
              onClick={() => handleFolderSelect(folder.id)}
              className={`px-3 py-2 rounded text-xs border touch-manipulation min-h-[44px] whitespace-nowrap transition-all flex items-center gap-1 ${
                selectedFolderId === folder.id
                  ? 'bg-blue-600/30 border-blue-500 text-white ring-2 ring-blue-500/50'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
              title={folder.name}
            >
              {folder.artwork_url && (
                <span className="inline-block w-4 h-4 rounded overflow-hidden flex-shrink-0">
                  <Image
                    src={folder.artwork_url}
                    alt={folder.name}
                    width={16}
                    height={16}
                    className="object-cover w-full h-full"
                    unoptimized={shouldUnoptimizeImage(folder.artwork_url)}
                  />
                </span>
              )}
              <span className="truncate max-w-[120px]">{folder.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Track List (Draggable) - Moved above container */}
      <div className="border-t border-gray-800 pt-1 mb-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-white">Tracks</div>
            <button
              onClick={() => setIsTrackListExpanded(!isTrackListExpanded)}
              className="text-gray-400 hover:text-white transition-colors p-1 touch-manipulation"
              title={isTrackListExpanded ? 'Collapse track list' : 'Expand track list'}
              aria-label={isTrackListExpanded ? 'Collapse' : 'Expand'}
            >
              {isTrackListExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
            {filteredQueue.length > 0 && (
              <span className="text-[10px] text-gray-500">({filteredQueue.length})</span>
            )}
          </div>
          <div className="text-[8px] text-gray-500">
            Double-click or Shift+click → Deck A | Ctrl/Cmd+click → Deck B | Right-click or tap-hold for menu
          </div>
        </div>
        <div 
          className={`overflow-y-auto space-y-0.5 transition-all duration-300 ${
            isTrackListExpanded ? 'max-h-[60vh]' : 'max-h-24'
          }`}
        >
          {filteredQueue.map((track) => (
            <div
              key={track.id}
              data-track-item
              draggable
              onDragStart={(e) => handleDragStart(e, track)}
              onClick={(e) => handleTrackClick(track, e)}
              onContextMenu={(e) => handleTrackContextMenu(track, e)}
              onTouchStart={(e) => handleTouchStart(track, e)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              className="cursor-pointer select-none rounded border border-gray-800 bg-gray-900/40 px-2 py-2 hover:bg-gray-800/50 active:bg-gray-700/50 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs touch-manipulation min-h-[44px] transition-colors"
              title="Double-click or Shift+click for Deck A | Ctrl/Cmd+click for Deck B | Right-click for menu"
            >
              <div className="flex items-center gap-2 min-w-0">
                {track.artwork && (
                  <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0">
                    <Image
                      src={track.artwork}
                      alt={track.title}
                      fill
                      className="object-cover"
                      unoptimized={shouldUnoptimizeImage(track.artwork)}
                      sizes="32px"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-white truncate text-xs font-medium">{track.title}</div>
                  <div className="text-[10px] text-gray-400 truncate">{track.artist}</div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    requestLoadTrackA(track)
                  }}
                  className="px-2 py-1 text-[10px] bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 rounded text-blue-300 transition-colors touch-manipulation min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title="Load to Deck A"
                >
                  A
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    requestLoadTrackB(track)
                  }}
                  className="px-2 py-1 text-[10px] bg-green-600/30 hover:bg-green-600/50 border border-green-500/50 rounded text-green-300 transition-colors touch-manipulation min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title="Load to Deck B"
                >
                  B
                </button>
              </div>
              <div className="flex items-center justify-end">
                {track.bpm && (
                  <div className="text-xs text-gray-500 font-mono px-2">{track.bpm}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu?.visible && contextMenu.track && (
        <div
          className="context-menu fixed z-[100] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{
            left: `${Math.min(contextMenu.x, window.innerWidth - 200)}px`,
            top: `${Math.min(contextMenu.y, window.innerHeight - 150)}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-800">
            {contextMenu.track.title}
          </div>
          <button
            onClick={handleLoadToDeckA}
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-800 transition-colors flex items-center gap-2 touch-manipulation min-h-[44px]"
          >
            <span className="text-blue-400">▶</span>
            Load to Deck A
          </button>
          <button
            onClick={handleLoadToDeckB}
            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-800 transition-colors flex items-center gap-2 touch-manipulation min-h-[44px]"
          >
            <span className="text-green-400">▶</span>
            Load to Deck B
          </button>
        </div>
      )}

      {/* Track Load Confirmation Modal */}
      {pendingTrackLoad && (
        <div
          className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4"
          onClick={cancelLoadTrack}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-md w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">
                Confirm Track Load
              </h3>
              <p className="text-sm text-gray-300 mb-1">
                Load track to <span className={`font-semibold ${pendingTrackLoad.deck === 'A' ? 'text-blue-400' : 'text-green-400'}`}>Deck {pendingTrackLoad.deck}</span>?
              </p>
              <div className="mt-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                <div className="text-white text-sm font-medium">{pendingTrackLoad.track.title}</div>
                <div className="text-gray-400 text-xs mt-1">{pendingTrackLoad.track.artist}</div>
                {pendingTrackLoad.track.bpm && (
                  <div className="text-gray-500 text-xs mt-1">BPM: {pendingTrackLoad.track.bpm}</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelLoadTrack}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors touch-manipulation min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmLoadTrack}
                className={`px-4 py-2 text-sm text-white rounded transition-colors touch-manipulation min-h-[44px] ${
                  pendingTrackLoad.deck === 'A'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Load to Deck {pendingTrackLoad.deck}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-2 pb-20 pt-2 bg-black/90">
        {/* Split Waveform Display - Top and Bottom (edjing-style) - Moved to top */}
      <div className="border-t border-gray-800 pt-1 mb-1">
        {/* Menu Bar - Above Waveforms */}
        <div className="flex items-center justify-center mb-1">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="px-2 py-0.5 rounded-full bg-blue-900/50 text-white text-[10px] border border-blue-700 hover:bg-blue-800/70 transition-colors"
            title="Open menu"
          >
            MENU
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="ml-1 px-2 py-0.5 text-[10px] rounded bg-gray-800 text-gray-200 hover:bg-gray-700"
              title="Exit DJ Mode"
            >
              Exit
            </button>
          )}
        </div>
        
        <div className="space-y-1">
          {/* Deck Header Row (RX2-style load + title) */}
          <div className="grid grid-cols-3 gap-2 items-center">
            <div className="flex items-center gap-2">
              <button
                className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full border-2 flex items-center justify-center transition-all touch-manipulation ${
                  dragOver === 'A'
                    ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                    : deckA.track
                      ? 'border-orange-500 bg-orange-500/20 ring-2 ring-orange-500/30'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                }`}
                title="Load track into Deck A"
              >
                <span className="text-white text-lg">♪</span>
              </button>
              <div className="text-[9px] text-gray-500 truncate">
                {deckA.track?.title || 'Deck A'}
              </div>
            </div>
            <div className="text-[9px] text-gray-400 text-center uppercase tracking-[0.2em]">
              XDJ MIXER
            </div>
            <div className="flex items-center gap-2 justify-end">
              <div className="text-[9px] text-gray-500 truncate text-right">
                {deckB.track?.title || 'Deck B'}
              </div>
              <button
                className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full border-2 flex items-center justify-center transition-all touch-manipulation ${
                  dragOver === 'B'
                    ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                    : deckB.track
                      ? 'border-gray-500 bg-gray-500/20 ring-2 ring-gray-500/30'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                }`}
                title="Load track into Deck B"
              >
                <span className="text-white text-lg">♪</span>
              </button>
            </div>
          </div>
          {/* Waveform Zoom Ladder */}
          <div className="flex items-center justify-center gap-1">
            {[32, 16, 8, 4, 2, 1, 0].map((beats) => (
              <button
                key={beats}
                onClick={() => setWaveformZoomBeats(beats)}
                className={`px-2 py-0.5 text-[9px] rounded border transition-colors ${
                  waveformZoomBeats === beats
                    ? 'bg-blue-700/50 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                }`}
                title={beats === 0 ? 'Full Track' : `${beats} Beats`}
              >
                {beats === 0 ? 'FULL' : `${beats}b`}
              </button>
            ))}
          </div>

          {/* Beat Grid Controls */}
          <div className="grid grid-cols-2 gap-1 mb-1">
            {(['A', 'B'] as const).map((deck) => {
              const deckState = deck === 'A' ? deckA : deckB
              return (
                <div key={deck} className="bg-gray-900/60 rounded p-1 border border-gray-800">
                  <div className="flex items-center justify-between text-[9px] text-gray-400 mb-0.5">
                    <span>GRID {deck}</span>
                    <span className="font-mono">
                      {deckState.beatGridOffset ? deckState.beatGridOffset.toFixed(3) : '0.000'}s
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      onClick={() => nudgeBeatGrid(deck, -1)}
                      className="flex-1 px-2 py-2 rounded text-[10px] border touch-manipulation min-h-[36px] transition-all bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                      title={`Nudge grid back (${deck})`}
                    >
                      -NUDGE
                    </button>
                    <button
                      onClick={() => setDownbeatNow(deck)}
                      className="flex-1 px-2 py-2 rounded text-[10px] border touch-manipulation min-h-[36px] transition-all bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                      title={`Set downbeat now (${deck})`}
                    >
                      GRID
                    </button>
                    <button
                      onClick={() => nudgeBeatGrid(deck, 1)}
                      className="flex-1 px-2 py-2 rounded text-[10px] border touch-manipulation min-h-[36px] transition-all bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                      title={`Nudge grid forward (${deck})`}
                    >
                      +NUDGE
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Deck A Waveform - Top */}
          <div className="bg-gradient-to-b from-gray-900/70 to-black/80 rounded-lg p-2 border border-gray-800 shadow-inner">
            <div className="text-[8px] text-gray-500 mb-0.5">Deck A</div>
            <div 
              className="h-20 bg-black/90 rounded-md overflow-hidden relative cursor-pointer border border-gray-800 shadow-[inset_0_0_10px_rgba(0,0,0,0.6)]"
              onClick={(e) => {
                if (!audioARef.current || !deckA.duration) return
                const viewWindow = getTravelWindow(deckA)
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                const newTime = viewWindow.start + percentage * (viewWindow.end - viewWindow.start)
                const clamped = Math.min(deckA.duration, Math.max(0, newTime))
                audioARef.current.currentTime = clamped
                setDeckA(prev => ({ ...prev, currentTime: clamped }))
              }}
            >
              <div
                className="absolute top-0 bottom-0 w-2 bg-red-500/20 blur-[2px]"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
              />
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500/90"
                style={{ left: '50%' }}
              />
              {deckA.track && deckA.duration > 0 ? (
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Waveform bars - showing amplitude/energy */}
                  {(() => {
                    const waveformData = realtimeWaveformA && realtimeWaveformA.length > 0 
                      ? Array.from(realtimeWaveformA).map(v => Math.abs(v))
                      : deckA.waveformData.length > 0 
                        ? deckA.waveformData 
                        : []
                    
                    if (waveformData.length === 0) return null
                    
                    const viewWindow = getTravelWindow(deckA)
                    const windowSpan = Math.max(0.0001, viewWindow.end - viewWindow.start)
                    const visibleStart = Math.max(0, viewWindow.start)
                    const visibleEnd = Math.min(deckA.duration, viewWindow.end)
                    const visibleSpan = Math.max(0.0001, visibleEnd - visibleStart)
                    const startIdx = Math.floor((visibleStart / deckA.duration) * waveformData.length)
                    const endIdx = Math.floor((visibleEnd / deckA.duration) * waveformData.length)
                    const slice = waveformData.slice(Math.max(0, startIdx), Math.max(startIdx + 1, endIdx))
                    const bars = getWaveformBarsCount(waveformZoomBeats, slice.length)
                    if (bars === 0) return null
                    const samplesPerBar = slice.length / bars
                    const waveformBars: JSX.Element[] = []
                    const leftPadPct = ((visibleStart - viewWindow.start) / windowSpan) * 100
                    const spanPct = (visibleSpan / windowSpan) * 100
                    
                    for (let i = 0; i < bars; i++) {
                      const startIdx = Math.floor(i * samplesPerBar)
                      const endIdx = Math.floor((i + 1) * samplesPerBar)
                      let max = 0
                      let avg = 0
                      
                      for (let j = startIdx; j < endIdx && j < slice.length; j++) {
                        const val = slice[j]
                        max = Math.max(max, val)
                        avg += val
                      }
                      avg = avg / (endIdx - startIdx)
                      
                      // Energy-based height (taller = louder/more energetic)
                      const height = Math.max(2, Math.max(max, avg) * 90)
                      const x = leftPadPct + (i / bars) * spanPct
                      const barWidth = spanPct / bars
                      
                      // Color based on energy (bright for high energy)
                      const energy = Math.max(max, avg)
                      const color = energy > 0.7 ? 'rgba(59, 130, 246, 0.9)' : 
                                   energy > 0.4 ? 'rgba(59, 130, 246, 0.7)' : 
                                   'rgba(59, 130, 246, 0.5)'
                      
                      waveformBars.push(
                        <rect
                          key={i}
                          x={x}
                          y={50 - height / 2}
                          width={barWidth}
                          height={height}
                          fill={color}
                        />
                      )
                    }
                    return waveformBars
                  })()}

                  {/* Beat Grid Overlay */}
                  {deckA.detectedBPM && deckA.duration > 0 && (() => {
                    const beatDuration = getBeatDuration(deckA)
                    if (!beatDuration) return null
                    const beatsPerBar = 4
                    const showBeats = waveformZoomBeats !== 0 && waveformZoomBeats <= 8
                    const gridLines: JSX.Element[] = []
                    const viewWindow = getTravelWindow(deckA)
                    const endTime = viewWindow.end
                    const offset = deckA.beatGridOffset || 0
                    const normalizedOffset = ((offset % beatDuration) + beatDuration) % beatDuration
                    let t = normalizedOffset
                    while (t - beatDuration >= 0) t -= beatDuration
                    
                    for (; t <= endTime; t += beatDuration) {
                      if (t < viewWindow.start) continue
                      const x = mapTimeToX(t, viewWindow)
                      if (x === null) continue
                      const beatIndex = Math.round((t - offset) / beatDuration)
                      const isBar = (beatIndex % beatsPerBar) === 0
                      const is8Bar = (beatIndex % (beatsPerBar * 8)) === 0
                      const is16Bar = (beatIndex % (beatsPerBar * 16)) === 0
                      
                      if (is16Bar) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 180, 0, 0.5)"
                            strokeWidth="0.4"
                          />
                        )
                      } else if (is8Bar) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 200, 0, 0.35)"
                            strokeWidth="0.3"
                          />
                        )
                      } else if (isBar) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 255, 255, 0.2)"
                            strokeWidth="0.2"
                          />
                        )
                      } else if (showBeats) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 255, 255, 0.1)"
                            strokeWidth="0.1"
                          />
                        )
                      }
                    }
                    return gridLines
                  })()}

                  {/* Loop Region */}
                  {deckA.loopIn !== null && deckA.loopOut !== null && (() => {
                    const viewWindow = getTravelWindow(deckA)
                    const startX = mapTimeToX(deckA.loopIn, viewWindow)
                    const endX = mapTimeToX(deckA.loopOut, viewWindow)
                    if (startX === null || endX === null) return null
                    return (
                    <rect
                      x={Math.min(startX, endX)}
                      y={0}
                      width={Math.abs(endX - startX)}
                      height={100}
                      fill="rgba(255, 200, 0, 0.15)"
                      stroke="rgba(255, 200, 0, 0.5)"
                      strokeWidth="0.3"
                    />
                    )
                  })()}

                  {/* Hot Cue Markers */}
                  {deckA.hotCues.map((cue, idx) => {
                    const viewWindow = getTravelWindow(deckA)
                    const x = mapTimeToX(cue.time, viewWindow)
                    if (x === null) return null
                    return (
                    <g key={`cue-${idx}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={0}
                        y2={100}
                        stroke="rgba(255, 100, 100, 0.8)"
                        strokeWidth="0.4"
                      />
                      <circle
                        cx={x}
                        cy={5}
                        r="2"
                        fill="rgba(255, 100, 100, 0.9)"
                      />
                      {cue.label && (
                        <text
                          x={x}
                          y={8}
                          fontSize="3"
                          fill="rgba(255, 100, 100, 0.9)"
                          textAnchor="middle"
                        >
                          {cue.label}
                        </text>
                      )}
                    </g>
                    )
                  })}

                </svg>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-[8px]">
                  No track loaded
                </div>
              )}
            </div>
            {/* Needle Strip - Deck A */}
            <div
              className="mt-1 h-6 bg-black/70 rounded overflow-hidden relative cursor-pointer"
              onClick={(e) => {
                if (!audioARef.current || !deckA.duration) return
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                const newTime = percentage * deckA.duration
                audioARef.current.currentTime = newTime
                setDeckA(prev => ({ ...prev, currentTime: newTime }))
              }}
            >
              <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                {(() => {
                  const waveformData = deckA.waveformData.length > 0 ? deckA.waveformData : []
                  if (waveformData.length === 0) return null
                  const bars = Math.min(200, waveformData.length)
                  const samplesPerBar = waveformData.length / bars
                  const barsEl: JSX.Element[] = []
                  for (let i = 0; i < bars; i++) {
                    const startIdx = Math.floor(i * samplesPerBar)
                    const endIdx = Math.floor((i + 1) * samplesPerBar)
                    let max = 0
                    for (let j = startIdx; j < endIdx && j < waveformData.length; j++) {
                      max = Math.max(max, waveformData[j])
                    }
                    const height = Math.max(1, max * 18)
                    const x = (i / bars) * 100
                    const barWidth = 100 / bars
                    barsEl.push(
                      <rect
                        key={`ns-a-${i}`}
                        x={x}
                        y={(20 - height) / 2}
                        width={barWidth}
                        height={height}
                        fill="rgba(59, 130, 246, 0.55)"
                      />
                    )
                  }
                  return barsEl
                })()}
                {deckA.duration > 0 && (
                  <rect
                    x={(deckA.currentTime / deckA.duration) * 100}
                    y={0}
                    width={0.6}
                    height={20}
                    fill="rgba(255, 0, 0, 0.9)"
                  />
                )}
                {deckA.duration > 0 && (() => {
                  const viewWindow = getViewWindow(deckA)
                  const startX = (viewWindow.start / deckA.duration) * 100
                  const endX = (viewWindow.end / deckA.duration) * 100
                  return (
                    <rect
                      x={startX}
                      y={0}
                      width={Math.max(0, endX - startX)}
                      height={20}
                      fill="rgba(255, 255, 255, 0.08)"
                      stroke="rgba(255, 255, 255, 0.12)"
                      strokeWidth={0.2}
                    />
                  )
                })()}
              </svg>
            </div>
          </div>

          {/* Phase Meter (between waveforms) */}
          <div className="mb-1 bg-gray-900/60 rounded p-1 border border-gray-800">
            <div className="flex items-center justify-between text-[9px] text-gray-400 mb-0.5">
              <span>PHASE</span>
              <span>{phaseDiff !== null ? `${(phaseDiff * 100).toFixed(0)}%` : '---'}</span>
            </div>
            <div className="relative h-2 bg-gray-800 rounded">
              <div className="absolute left-1/2 top-0 h-2 w-px bg-gray-500" />
              {phaseDiff !== null && (
                <div
                  className="absolute top-0 h-2 w-1.5 bg-orange-500 rounded"
                  style={{ left: `calc(50% + ${phaseDiff * 100}%)`, transform: 'translateX(-50%)' }}
                />
              )}
            </div>
          </div>

          {/* Deck B Waveform - Bottom */}
          <div className="bg-gradient-to-b from-gray-900/70 to-black/80 rounded-lg p-2 border border-gray-800 shadow-inner">
            <div className="text-[8px] text-gray-500 mb-0.5">Deck B</div>
            <div 
              className="h-20 bg-black/90 rounded-md overflow-hidden relative cursor-grab active:cursor-grabbing touch-manipulation border border-gray-800 shadow-[inset_0_0_10px_rgba(0,0,0,0.6)]"
              onMouseDown={(e) => {
                if (!audioBRef.current || !deckB.duration) return
                setIsDraggingWaveformB(true)
                const viewWindow = getTravelWindow(deckB)
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                const newTime = viewWindow.start + percentage * (viewWindow.end - viewWindow.start)
                const clamped = Math.min(deckB.duration, Math.max(0, newTime))
                audioBRef.current.currentTime = clamped
                setDeckB(prev => ({ ...prev, currentTime: clamped }))
              }}
              onMouseMove={(e) => {
                if (!isDraggingWaveformB || !audioBRef.current || !deckB.duration) return
                const viewWindow = getTravelWindow(deckB)
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = Math.max(0, Math.min(1, x / rect.width))
                const newTime = viewWindow.start + percentage * (viewWindow.end - viewWindow.start)
                const clamped = Math.min(deckB.duration, Math.max(0, newTime))
                audioBRef.current.currentTime = clamped
                setDeckB(prev => ({ ...prev, currentTime: clamped }))
              }}
              onMouseUp={() => setIsDraggingWaveformB(false)}
              onMouseLeave={() => setIsDraggingWaveformB(false)}
              onClick={(e) => {
                if (!isDraggingWaveformB && audioBRef.current && deckB.duration) {
                  const viewWindow = getTravelWindow(deckB)
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const percentage = x / rect.width
                  const newTime = viewWindow.start + percentage * (viewWindow.end - viewWindow.start)
                  const clamped = Math.min(deckB.duration, Math.max(0, newTime))
                  audioBRef.current.currentTime = clamped
                  setDeckB(prev => ({ ...prev, currentTime: clamped }))
                }
              }}
            >
              <div
                className="absolute top-0 bottom-0 w-2 bg-red-500/20 blur-[2px]"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
              />
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500/90"
                style={{ left: '50%' }}
              />
              {deckB.track && deckB.duration > 0 ? (
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Waveform bars - showing amplitude/energy */}
                  {(() => {
                    const waveformData = realtimeWaveformB && realtimeWaveformB.length > 0 
                      ? Array.from(realtimeWaveformB).map(v => Math.abs(v))
                      : deckB.waveformData.length > 0 
                        ? deckB.waveformData 
                        : []
                    
                    if (waveformData.length === 0) return null
                    
                    const viewWindow = getTravelWindow(deckB)
                    const windowSpan = Math.max(0.0001, viewWindow.end - viewWindow.start)
                    const visibleStart = Math.max(0, viewWindow.start)
                    const visibleEnd = Math.min(deckB.duration, viewWindow.end)
                    const visibleSpan = Math.max(0.0001, visibleEnd - visibleStart)
                    const startIdx = Math.floor((visibleStart / deckB.duration) * waveformData.length)
                    const endIdx = Math.floor((visibleEnd / deckB.duration) * waveformData.length)
                    const slice = waveformData.slice(Math.max(0, startIdx), Math.max(startIdx + 1, endIdx))
                    const bars = getWaveformBarsCount(waveformZoomBeats, slice.length)
                    if (bars === 0) return null
                    const samplesPerBar = slice.length / bars
                    const waveformBars: JSX.Element[] = []
                    const leftPadPct = ((visibleStart - viewWindow.start) / windowSpan) * 100
                    const spanPct = (visibleSpan / windowSpan) * 100
                    
                    for (let i = 0; i < bars; i++) {
                      const startIdx = Math.floor(i * samplesPerBar)
                      const endIdx = Math.floor((i + 1) * samplesPerBar)
                      let max = 0
                      let avg = 0
                      
                      for (let j = startIdx; j < endIdx && j < slice.length; j++) {
                        const val = slice[j]
                        max = Math.max(max, val)
                        avg += val
                      }
                      avg = avg / (endIdx - startIdx)
                      
                      const height = Math.max(2, Math.max(max, avg) * 90)
                      const x = leftPadPct + (i / bars) * spanPct
                      const barWidth = spanPct / bars
                      
                      const energy = Math.max(max, avg)
                      const color = energy > 0.7 ? 'rgba(139, 92, 246, 0.9)' : 
                                   energy > 0.4 ? 'rgba(139, 92, 246, 0.7)' : 
                                   'rgba(139, 92, 246, 0.5)'
                      
                      waveformBars.push(
                        <rect
                          key={i}
                          x={x}
                          y={50 - height / 2}
                          width={barWidth}
                          height={height}
                          fill={color}
                        />
                      )
                    }
                    return waveformBars
                  })()}

                  {/* Beat Grid Overlay */}
                  {deckB.detectedBPM && deckB.duration > 0 && (() => {
                    const beatDuration = getBeatDuration(deckB)
                    if (!beatDuration) return null
                    const beatsPerBar = 4
                    const showBeats = waveformZoomBeats !== 0 && waveformZoomBeats <= 8
                    const gridLines: JSX.Element[] = []
                    const viewWindow = getTravelWindow(deckB)
                    const endTime = viewWindow.end
                    const offset = deckB.beatGridOffset || 0
                    const normalizedOffset = ((offset % beatDuration) + beatDuration) % beatDuration
                    let t = normalizedOffset
                    while (t - beatDuration >= 0) t -= beatDuration
                    
                    for (; t <= endTime; t += beatDuration) {
                      if (t < viewWindow.start) continue
                      const x = mapTimeToX(t, viewWindow)
                      if (x === null) continue
                      const beatIndex = Math.round((t - offset) / beatDuration)
                      const isBar = (beatIndex % beatsPerBar) === 0
                      const is8Bar = (beatIndex % (beatsPerBar * 8)) === 0
                      const is16Bar = (beatIndex % (beatsPerBar * 16)) === 0
                      
                      if (is16Bar) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 180, 0, 0.5)"
                            strokeWidth="0.4"
                          />
                        )
                      } else if (is8Bar) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 200, 0, 0.35)"
                            strokeWidth="0.3"
                          />
                        )
                      } else if (isBar) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 255, 255, 0.2)"
                            strokeWidth="0.2"
                          />
                        )
                      } else if (showBeats) {
                        gridLines.push(
                          <line
                            key={`beat-${t}`}
                            x1={x}
                            x2={x}
                            y1={0}
                            y2={100}
                            stroke="rgba(255, 255, 255, 0.1)"
                            strokeWidth="0.1"
                          />
                        )
                      }
                    }
                    return gridLines
                  })()}

                  {/* Loop Region */}
                  {deckB.loopIn !== null && deckB.loopOut !== null && (() => {
                    const viewWindow = getTravelWindow(deckB)
                    const startX = mapTimeToX(deckB.loopIn, viewWindow)
                    const endX = mapTimeToX(deckB.loopOut, viewWindow)
                    if (startX === null || endX === null) return null
                    return (
                    <rect
                      x={Math.min(startX, endX)}
                      y={0}
                      width={Math.abs(endX - startX)}
                      height={100}
                      fill="rgba(255, 200, 0, 0.15)"
                      stroke="rgba(255, 200, 0, 0.5)"
                      strokeWidth="0.3"
                    />
                    )
                  })()}

                  {/* Hot Cue Markers */}
                  {deckB.hotCues.map((cue, idx) => {
                    const viewWindow = getTravelWindow(deckB)
                    const x = mapTimeToX(cue.time, viewWindow)
                    if (x === null) return null
                    return (
                    <g key={`cue-${idx}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={0}
                        y2={100}
                        stroke="rgba(255, 100, 100, 0.8)"
                        strokeWidth="0.4"
                      />
                      <circle
                        cx={x}
                        cy={5}
                        r="2"
                        fill="rgba(255, 100, 100, 0.9)"
                      />
                      {cue.label && (
                        <text
                          x={x}
                          y={8}
                          fontSize="3"
                          fill="rgba(255, 100, 100, 0.9)"
                          textAnchor="middle"
                        >
                          {cue.label}
                        </text>
                      )}
                    </g>
                    )
                  })}

                </svg>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-[8px]">
                  No track loaded
                </div>
              )}
            </div>
            {/* Needle Strip - Deck B */}
            <div
              className="mt-1 h-6 bg-black/70 rounded overflow-hidden relative cursor-pointer"
              onClick={(e) => {
                if (!audioBRef.current || !deckB.duration) return
                const rect = e.currentTarget.getBoundingClientRect()
                const x = e.clientX - rect.left
                const percentage = x / rect.width
                const newTime = percentage * deckB.duration
                audioBRef.current.currentTime = newTime
                setDeckB(prev => ({ ...prev, currentTime: newTime }))
              }}
            >
              <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                {(() => {
                  const waveformData = deckB.waveformData.length > 0 ? deckB.waveformData : []
                  if (waveformData.length === 0) return null
                  const bars = Math.min(200, waveformData.length)
                  const samplesPerBar = waveformData.length / bars
                  const barsEl: JSX.Element[] = []
                  for (let i = 0; i < bars; i++) {
                    const startIdx = Math.floor(i * samplesPerBar)
                    const endIdx = Math.floor((i + 1) * samplesPerBar)
                    let max = 0
                    for (let j = startIdx; j < endIdx && j < waveformData.length; j++) {
                      max = Math.max(max, waveformData[j])
                    }
                    const height = Math.max(1, max * 18)
                    const x = (i / bars) * 100
                    const barWidth = 100 / bars
                    barsEl.push(
                      <rect
                        key={`ns-b-${i}`}
                        x={x}
                        y={(20 - height) / 2}
                        width={barWidth}
                        height={height}
                        fill="rgba(139, 92, 246, 0.55)"
                      />
                    )
                  }
                  return barsEl
                })()}
                {deckB.duration > 0 && (
                  <rect
                    x={(deckB.currentTime / deckB.duration) * 100}
                    y={0}
                    width={0.6}
                    height={20}
                    fill="rgba(255, 0, 0, 0.9)"
                  />
                )}
                {deckB.duration > 0 && (() => {
                  const viewWindow = getViewWindow(deckB)
                  const startX = (viewWindow.start / deckB.duration) * 100
                  const endX = (viewWindow.end / deckB.duration) * 100
                  return (
                    <rect
                      x={startX}
                      y={0}
                      width={Math.max(0, endX - startX)}
                      height={20}
                      fill="rgba(255, 255, 255, 0.08)"
                      stroke="rgba(255, 255, 255, 0.12)"
                      strokeWidth={0.2}
                    />
                  )
                })()}
              </svg>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Status Bar moved above jump row */}
      <div className="bg-black/95 border border-gray-800 px-2 py-1 rounded mb-1">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 gap-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTapTempo('A')}
                  className="px-3 py-1.5 text-[10px] rounded border border-gray-700 bg-gray-900/60 text-gray-200 hover:bg-gray-800 transition-colors min-h-[32px] min-w-[44px]"
                  title="Tap Tempo (Deck A)"
                >
                  TAP
                </button>
                <button
                  onClick={() => setTempoRangeWide(prev => !prev)}
                  className="px-2 py-1 text-[9px] rounded border border-gray-700 bg-gray-900/60 text-gray-300 hover:bg-gray-800 transition-colors"
                  title={`Tempo range ${tempoRangeWide ? '±16%' : '±8%'}`}
                >
                  {tempoRangeWide ? '±16' : '±8'}
                </button>
              </div>
              <button
                onClick={() => setDeckARec(prev => !prev)}
                className={`px-2 py-1 text-[9px] rounded border ${
                  deckARec ? 'bg-red-600/40 border-red-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                REC
              </button>
              <button
                onClick={() => setDeckASlip(prev => !prev)}
                className={`px-2 py-1 text-[9px] rounded border ${
                  deckASlip ? 'bg-blue-600/40 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                SLIP
              </button>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDeckBRec(prev => !prev)}
                className={`px-2 py-1 text-[9px] rounded border ${
                  deckBRec ? 'bg-red-600/40 border-red-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                REC
              </button>
              <button
                onClick={() => setDeckBSlip(prev => !prev)}
                className={`px-2 py-1 text-[9px] rounded border ${
                  deckBSlip ? 'bg-blue-600/40 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                SLIP
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTempoRangeWide(prev => !prev)}
                  className="px-2 py-1 text-[9px] rounded border border-gray-700 bg-gray-900/60 text-gray-300 hover:bg-gray-800 transition-colors"
                  title={`Tempo range ${tempoRangeWide ? '±16%' : '±8%'}`}
                >
                  {tempoRangeWide ? '±16' : '±8'}
                </button>
                <button
                  onClick={() => handleTapTempo('B')}
                  className="px-3 py-1.5 text-[10px] rounded border border-gray-700 bg-gray-900/60 text-gray-200 hover:bg-gray-800 transition-colors min-h-[32px] min-w-[44px]"
                  title="Tap Tempo (Deck B)"
                >
                  TAP
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { deck: 'A' as const, state: deckA, color: 'text-green-300' },
              { deck: 'B' as const, state: deckB, color: 'text-green-300' },
            ]).map(({ deck, state, color }) => (
              <div
                key={deck}
                className="bg-[#0d1a12] border border-[#1f3a2b] rounded px-2 py-1 text-[10px] font-mono flex items-center justify-between"
              >
                <span className="text-[#6ee7b7]">DECK {deck}</span>
                <span className={color}>
                  {state.currentTime ? formatTime(state.currentTime) : '0:00'}
                </span>
                <span className="text-[#34d399]">
                  BPM {state.detectedBPM ? (state.detectedBPM * state.playbackRate).toFixed(1) : '--'}
                </span>
                <span className="text-[#6ee7b7]">
                  PITCH {(((state.playbackRate - 1) * 100) || 0).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Jog Wheels Section */}
      <div className="mb-1">
        {/* Jump Row + Smartfader (centered above EQ/Vol) */}
        <div
          className="grid grid-cols-[minmax(0,1fr)_32px_auto_32px_minmax(0,1fr)] gap-1 items-center mb-1"
          style={{
            ['--eq-stack-h' as any]: eqStackHeight ? `${eqStackHeight}px` : '14rem',
            ['--eq-container-h' as any]: eqContainerHeight ? `${eqContainerHeight}px` : (eqStackHeight ? `${eqStackHeight}px` : '14rem'),
          }}
        >
          <div className="grid grid-cols-4 gap-1 col-start-1">
            <button 
              onClick={() => handleJumpBackward('A', 10)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs touch-manipulation min-h-[48px] hover:bg-gray-700 transition-colors"
              title="Jump backward 10 seconds (Deck A)"
            >
              ⏮
            </button>
            <button
              onClick={syncBPM}
              disabled={!deckA.detectedBPM || !deckB.detectedBPM || !deckB.track}
              className="px-3 py-2 bg-purple-600 border border-purple-500 rounded text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px] transition-all"
              title="Sync Deck B to Deck A (A key)"
            >
              SYNC
            </button>
            <button 
              onClick={() => handleSetButton('A')}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs touch-manipulation min-h-[48px] hover:bg-gray-700 transition-colors"
              title="Set cue point or loop out (Deck A)"
            >
              SET
            </button>
            <button 
              onClick={() => handleJumpForward('A', 10)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs touch-manipulation min-h-[48px] hover:bg-gray-700 transition-colors"
              title="Jump forward 10 seconds (Deck A)"
            >
              ⏭
            </button>
          </div>
          <div className="bg-gradient-to-b from-gray-950/70 to-black/80 p-1 rounded-xl border border-gray-800 w-full col-start-2 col-span-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] text-gray-400">SMARTFADER</span>
              <span className="text-[9px] text-gray-400">←/→ arrows | C to center</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={crossfaderPosition}
              onChange={(e) => setCrossfaderPosition(parseFloat(e.target.value))}
              className="w-full h-3 bg-gray-800 rounded-lg appearance-none cursor-pointer touch-manipulation"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${crossfaderPosition * 100}%, #8b5cf6 ${crossfaderPosition * 100}%, #8b5cf6 100%)`
              }}
              title={`Crossfader: ${crossfaderPosition < 0.5 ? 'Deck A' : crossfaderPosition > 0.5 ? 'Deck B' : 'Center'}`}
            />
          </div>
          <div className="grid grid-cols-4 gap-1 col-start-5">
            <button 
              onClick={() => handleJumpBackward('B', 10)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs touch-manipulation min-h-[48px] hover:bg-gray-700 transition-colors"
              title="Jump backward 10 seconds (Deck B)"
            >
              ⏮
            </button>
            <button
              onClick={syncBPM}
              disabled={!deckA.detectedBPM || !deckB.detectedBPM || !deckB.track}
              className="px-3 py-2 bg-purple-600 border border-purple-500 rounded text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px] transition-all"
              title="Sync Deck B to Deck A (A key)"
            >
              SYNC
            </button>
            <button 
              onClick={() => handleSetButton('B')}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs touch-manipulation min-h-[48px] hover:bg-gray-700 transition-colors"
              title="Set cue point or loop out (Deck B)"
            >
              SET
            </button>
            <button 
              onClick={() => handleJumpForward('B', 10)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs touch-manipulation min-h-[48px] hover:bg-gray-700 transition-colors"
              title="Jump forward 10 seconds (Deck B)"
            >
              ⏭
            </button>
          </div>
        </div>

        <div
          className="grid grid-cols-[minmax(0,1fr)_32px_auto_32px_minmax(0,1fr)] gap-4 items-start"
          style={{
            ['--eq-stack-h' as any]: eqStackHeight ? `${eqStackHeight}px` : '14rem',
            ['--eq-container-h' as any]: '430px',
          }}
        >
        {/* Deck A Jog Wheel */}
        <div className="relative">
          {/* Deck A CUE/PLAY (above jog wheel) */}
          <div className="flex items-center justify-center gap-3 mb-1">
            <button 
              onClick={() => handleCueButton('A')}
              className="w-16 h-16 min-w-[64px] min-h-[64px] border-2 rounded-full flex items-center justify-center touch-manipulation bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
              title="CUE (Deck A)"
            >
              CUE
            </button>
            <button
              onClick={() => {
                if (audioARef.current) {
                  if (deckA.isPlaying) {
                    audioARef.current.pause()
                  } else {
                    audioARef.current.play()
                  }
                }
              }}
              className={`w-16 h-16 min-w-[64px] min-h-[64px] border-2 rounded-full flex items-center justify-center touch-manipulation transition-all ${
                deckA.isPlaying 
                  ? 'bg-green-600/30 border-green-500 text-white ring-2 ring-green-500/50' 
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
              }`}
              title={`${deckA.isPlaying ? 'Pause' : 'Play'} Deck A (Q key)`}
            >
              <span className="text-base">{deckA.isPlaying ? '⏸' : '▶'}</span>
            </button>
          </div>
          <div className="flex items-start gap-2">
            {/* Tempo Slider - Deck A (outer left) */}
            <div className="flex flex-col items-center gap-1 self-stretch h-[430px]">
              <div className="text-[9px] text-gray-400">BPM</div>
              <div className="text-xs font-mono text-white">
                {deckA.detectedBPM ? `${(deckA.detectedBPM * deckA.playbackRate).toFixed(1)}` : '---'}
              </div>
              <div
                className="relative w-10 rounded border border-gray-700 bg-gradient-to-b from-gray-900/90 to-gray-950 overflow-hidden flex flex-col shadow-[inset_0_0_18px_rgba(0,0,0,0.85)]"
                style={{ height: 'var(--eq-container-h)' }}
              >
                <div className="absolute top-1 left-2 right-2 h-[2px] bg-orange-500" />
                <div className="absolute top-1/2 left-2 right-2 h-px bg-white/25" />
                <div className="absolute left-2 right-2 top-2.5 bottom-2.5 bg-black/80 rounded-[4px] shadow-[inset_0_0_6px_rgba(0,0,0,0.8)]" />
                <div className="absolute left-2 right-2 top-2.5 bottom-2.5">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <div
                      key={`tempo-a-${i}`}
                      className="absolute left-0 right-0 h-[2px] bg-white/70"
                      style={{ top: `${i * 10}%` }}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min={getTempoBounds(tempoRangeWide).min}
                  max={getTempoBounds(tempoRangeWide).max}
                  step={isShiftActive('A') ? 0.0001 : 0.001}
                  value={deckA.playbackRate}
                  onChange={(e) => {
                    const next = snapTempoCenter(clampTempo(parseFloat(e.target.value), tempoRangeWide))
                    setDeckA(prev => ({ ...prev, playbackRate: next }))
                  }}
                  onDoubleClick={() => setDeckA(prev => ({ ...prev, playbackRate: 1 }))}
                  className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2 opacity-0 cursor-pointer"
                  style={{ writingMode: 'vertical-lr', transform: 'translateX(-50%) rotate(180deg)' }}
                  title="Tempo (Deck A)"
                />
                <div
                  className="absolute left-1/2 w-7 h-4 bg-gradient-to-b from-gray-100 to-gray-300 border border-gray-500 rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  style={{
                    top: `${(1 - (deckA.playbackRate - getTempoBounds(tempoRangeWide).min) / (getTempoBounds(tempoRangeWide).max - getTempoBounds(tempoRangeWide).min)) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="absolute inset-x-0 top-[1px] h-[1px] bg-white/80 rounded-sm" />
                  <div className="absolute inset-x-0 bottom-[1px] h-[1px] bg-black/20 rounded-sm" />
                </div>
              </div>
              <div className="text-[8px] text-gray-500">{((deckA.playbackRate - 1) * 100).toFixed(1)}%</div>
            </div>

            {/* Jog Wheel */}
            <div className="relative flex-1">
              <div
                className="relative w-72 h-72 mx-auto rounded-full bg-gray-900 border-2 border-gray-800 shadow-inner cursor-pointer select-none"
                style={{
                  transform: `rotate(${jogWheelAPosition}deg)`,
                  transition: isDraggingJogA ? 'none' : 'transform 0.1s ease-out'
                }}
                onMouseDown={(e) => handleJogWheelDrag('A', e)}
              >
                <div className="absolute inset-0 rounded-full border border-gray-700 shadow-[inset_0_0_8px_rgba(0,0,0,0.7)]" />
                <div className="absolute inset-1 rounded-full border border-gray-800" />
                <div className="absolute inset-2 rounded-full border border-gray-800" />
                <div className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(0,0,0,0.95))]" />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      'conic-gradient(rgba(34,197,94,0.8) 0 30deg, rgba(0,0,0,0) 30deg 60deg, rgba(34,197,94,0.4) 60deg 90deg, rgba(0,0,0,0) 90deg 360deg)',
                  }}
                />
                <div className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.035),rgba(255,255,255,0.035)_1px,rgba(0,0,0,0)_3px,rgba(0,0,0,0)_6px)]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-gray-600 text-[9px] font-light tracking-wider">CDJ</span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border border-gray-600 bg-gray-100/10 overflow-hidden shadow-[inset_0_0_6px_rgba(0,0,0,0.6)]">
                    {deckA.track?.artwork ? (
                      <Image
                        src={deckA.track.artwork}
                        alt={deckA.track.title}
                        fill
                        className="object-cover"
                        unoptimized={shouldUnoptimizeImage(deckA.track.artwork)}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100/90 flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-500 shadow-[inset_0_0_4px_rgba(0,0,0,0.3)]" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full"></div>
                
                {/* Tonearm */}
                <div
                  className="absolute top-1/2 right-0 w-12 h-0.5 bg-gray-700 origin-right"
                  style={{
                    transform: `rotate(${-jogWheelAPosition * 0.3}deg) translateY(-50%)`,
                    transformOrigin: 'right center'
                  }}
                >
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                </div>
              </div>
            </div>

          </div>

          {/* Playback Controls moved to shared row */}
        </div>

        {/* Deck A Volume (next to EQ) */}
        <div className="flex flex-col items-center gap-1 self-center h-[430px]">
          <div className="text-[9px] text-gray-400">VOL</div>
          <div className="w-6 h-px bg-gray-700/80 mb-1" />
          <div
            className="relative w-10 rounded border border-gray-700 bg-gradient-to-b from-gray-900/90 to-gray-950 overflow-hidden flex flex-col shadow-[inset_0_0_18px_rgba(0,0,0,0.85)]"
            style={{ height: 'var(--eq-container-h)' }}
          >
            <div className="absolute left-2 right-2 top-2.5 bottom-2.5 bg-black/80 rounded-[4px] shadow-[inset_0_0_6px_rgba(0,0,0,0.8)]" />
            <div className="absolute left-2 right-2 top-2.5 bottom-2.5">
              {Array.from({ length: 11 }).map((_, i) => (
                <div
                  key={`vol-a-eq-${i}`}
                  className="absolute left-0 right-0 h-[2px] bg-white/70"
                  style={{ top: `${i * 10}%` }}
                />
              ))}
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckA.channelFader}
              onChange={(e) => setDeckA(prev => ({ ...prev, channelFader: parseFloat(e.target.value) }))}
              className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2 opacity-0 cursor-pointer"
              style={{ writingMode: 'vertical-lr', transform: 'translateX(-50%) rotate(180deg)' }}
              title="Deck A Volume"
            />
            <div
              className="absolute left-1/2 w-7 h-4 bg-gradient-to-b from-gray-100 to-gray-300 border border-gray-500 rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              style={{
                top: `${(1 - deckA.channelFader) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="absolute inset-x-0 top-[1px] h-[1px] bg-white/80 rounded-sm" />
              <div className="absolute inset-x-0 bottom-[1px] h-[1px] bg-black/20 rounded-sm" />
            </div>
          </div>
        </div>

        {/* Center EQ Stack */}
        <div
          ref={eqContainerRef}
          className="bg-gradient-to-b from-gray-950/60 to-black/80 rounded-xl border border-gray-800 p-2 max-w-xs mx-auto h-[430px]"
        >
          <div className="text-[9px] text-gray-500 mb-2 text-center tracking-widest">EQ</div>
          <div className="grid grid-cols-[18px_1fr_auto_1fr_18px] gap-2 items-center">
            <div className="flex flex-col items-center gap-1 h-full">
              <span className="text-[8px] text-blue-400">A</span>
              <div className="relative w-3 rounded border border-gray-800 bg-gray-900 overflow-hidden mt-2 flex-1">
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: `${Math.min(100, meterA * 100)}%`,
                    background:
                      'repeating-linear-gradient(0deg, rgba(34,197,94,0.9) 0 6px, rgba(0,0,0,0) 6px 8px)',
                    boxShadow: '0 0 6px rgba(34,197,94,0.6)',
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="text-[9px] text-blue-400">DECK A</div>
            <div className="flex flex-col items-center justify-center gap-2 self-start" ref={eqStackRef}>
              <Knob label="HIGH" value={deckA.eqHigh} min={-12} max={12} step={0.5} onChange={(value) => setDeckA(prev => ({ ...prev, eqHigh: value }))} />
                <Knob label="MID" value={deckA.eqMid} min={-12} max={12} step={0.5} onChange={(value) => setDeckA(prev => ({ ...prev, eqMid: value }))} />
                <Knob label="LOW" value={deckA.eqLow} min={-12} max={12} step={0.5} onChange={(value) => setDeckA(prev => ({ ...prev, eqLow: value }))} />
                <div className="flex flex-col items-center gap-1">
                  <Knob label="FILTER" value={filterA} min={-1} max={1} step={0.01} onChange={setFilterA} />
                  <div className="text-[8px] text-gray-500">HP · OFF · LP</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={syncBPM}
                disabled={!deckA.detectedBPM || !deckB.detectedBPM || !deckB.track}
                className="w-12 h-12 rounded-full bg-purple-600 shadow-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation min-h-[48px] min-w-[48px] flex items-center justify-center transition-all active:scale-95"
                title="Sync BPM (A key)"
              >
                <span className="text-white text-lg">🔄</span>
              </button>
              <button
                onClick={() => setCrossfaderPosition(0.5)}
                className="w-12 h-12 rounded-full bg-blue-600 shadow-lg hover:bg-blue-700 touch-manipulation min-h-[48px] min-w-[48px] flex items-center justify-center transition-all active:scale-95"
                title="Center Crossfader (C key)"
              >
                <span className="text-white text-lg">⚖️</span>
              </button>
              <button
                onClick={() => {
                  setDeckA(prev => ({ ...prev, eqLow: 0, eqMid: 0, eqHigh: 0 }))
                  setDeckB(prev => ({ ...prev, eqLow: 0, eqMid: 0, eqHigh: 0 }))
                }}
                className="w-12 h-12 rounded-full bg-gray-700 shadow-lg hover:bg-gray-600 touch-manipulation min-h-[48px] min-w-[48px] flex items-center justify-center transition-all active:scale-95"
                title="Reset All EQ"
              >
                <span className="text-white text-lg">♻️</span>
              </button>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="text-[9px] text-purple-400">DECK B</div>
              <div className="flex flex-col items-center justify-center gap-2 self-start">
                <Knob label="HIGH" value={deckB.eqHigh} min={-12} max={12} step={0.5} onChange={(value) => setDeckB(prev => ({ ...prev, eqHigh: value }))} color="rgba(129,140,248,0.95)" />
                <Knob label="MID" value={deckB.eqMid} min={-12} max={12} step={0.5} onChange={(value) => setDeckB(prev => ({ ...prev, eqMid: value }))} color="rgba(129,140,248,0.95)" />
                <Knob label="LOW" value={deckB.eqLow} min={-12} max={12} step={0.5} onChange={(value) => setDeckB(prev => ({ ...prev, eqLow: value }))} color="rgba(129,140,248,0.95)" />
                <div className="flex flex-col items-center gap-1">
                  <Knob label="FILTER" value={filterB} min={-1} max={1} step={0.01} onChange={setFilterB} color="rgba(129,140,248,0.95)" />
                  <div className="text-[8px] text-gray-500">HP · OFF · LP</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 h-full">
              <span className="text-[8px] text-purple-400">B</span>
              <div className="relative w-3 rounded border border-gray-800 bg-gray-900 overflow-hidden mt-2 flex-1">
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: `${Math.min(100, meterB * 100)}%`,
                    background:
                      'repeating-linear-gradient(0deg, rgba(250,204,21,0.9) 0 6px, rgba(0,0,0,0) 6px 8px)',
                    boxShadow: '0 0 6px rgba(250,204,21,0.6)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Deck B Volume (next to EQ) */}
        <div className="flex flex-col items-center gap-1 self-center h-[430px]">
          <div className="text-[9px] text-gray-400">VOL</div>
          <div className="w-6 h-px bg-gray-700/80 mb-1" />
          <div
            className="relative w-10 rounded border border-gray-700 bg-gradient-to-b from-gray-900/90 to-gray-950 overflow-hidden flex flex-col shadow-[inset_0_0_18px_rgba(0,0,0,0.85)]"
            style={{ height: 'var(--eq-container-h)' }}
          >
            <div className="absolute left-2 right-2 top-2.5 bottom-2.5 bg-black/80 rounded-[4px] shadow-[inset_0_0_6px_rgba(0,0,0,0.8)]" />
            <div className="absolute left-2 right-2 top-2.5 bottom-2.5">
              {Array.from({ length: 11 }).map((_, i) => (
                <div
                  key={`vol-b-eq-${i}`}
                  className="absolute left-0 right-0 h-[2px] bg-white/70"
                  style={{ top: `${i * 10}%` }}
                />
              ))}
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={deckB.channelFader}
              onChange={(e) => setDeckB(prev => ({ ...prev, channelFader: parseFloat(e.target.value) }))}
              className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2 opacity-0 cursor-pointer"
              style={{ writingMode: 'vertical-lr', transform: 'translateX(-50%) rotate(180deg)' }}
              title="Deck B Volume"
            />
            <div
              className="absolute left-1/2 w-7 h-4 bg-gradient-to-b from-gray-100 to-gray-300 border border-gray-500 rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              style={{
                top: `${(1 - deckB.channelFader) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="absolute inset-x-0 top-[1px] h-[1px] bg-white/80 rounded-sm" />
              <div className="absolute inset-x-0 bottom-[1px] h-[1px] bg-black/20 rounded-sm" />
            </div>
          </div>
        </div>

        {/* Deck B Jog Wheel */}
        <div className="relative">
          {/* Deck B CUE/PLAY (above jog wheel) */}
          <div className="flex items-center justify-center gap-3 mb-1">
            <button 
              onClick={() => handleCueButton('B')}
              className="w-16 h-16 min-w-[64px] min-h-[64px] border-2 rounded-full flex items-center justify-center touch-manipulation bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
              title="CUE (Deck B)"
            >
              CUE
            </button>
            <button
              onClick={() => {
                if (audioBRef.current) {
                  if (deckB.isPlaying) {
                    audioBRef.current.pause()
                  } else {
                    audioBRef.current.play()
                  }
                }
              }}
              className={`w-16 h-16 min-w-[64px] min-h-[64px] border-2 rounded-full flex items-center justify-center touch-manipulation transition-all ${
                deckB.isPlaying 
                  ? 'bg-green-600/30 border-green-500 text-white ring-2 ring-green-500/50' 
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
              }`}
              title={`${deckB.isPlaying ? 'Pause' : 'Play'} Deck B (P key)`}
            >
              <span className="text-base">{deckB.isPlaying ? '⏸' : '▶'}</span>
            </button>
          </div>
          <div className="flex items-start gap-1 justify-end">
            {/* Jog Wheel */}
            <div className="relative flex-1">
              <div
                className="relative w-72 h-72 mx-auto rounded-full bg-gray-900 border-2 border-gray-800 shadow-inner cursor-pointer select-none"
                style={{
                  transform: `rotate(${jogWheelBPosition}deg)`,
                  transition: isDraggingJogB ? 'none' : 'transform 0.1s ease-out'
                }}
                onMouseDown={(e) => handleJogWheelDrag('B', e)}
              >
                <div className="absolute inset-0 rounded-full border border-gray-700 shadow-[inset_0_0_8px_rgba(0,0,0,0.7)]" />
                <div className="absolute inset-1 rounded-full border border-gray-800" />
                <div className="absolute inset-2 rounded-full border border-gray-800" />
                <div className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(0,0,0,0.95))]" />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      'conic-gradient(rgba(250,204,21,0.8) 0 30deg, rgba(0,0,0,0) 30deg 60deg, rgba(250,204,21,0.4) 60deg 90deg, rgba(0,0,0,0) 90deg 360deg)',
                  }}
                />
                <div className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.035),rgba(255,255,255,0.035)_1px,rgba(0,0,0,0)_3px,rgba(0,0,0,0)_6px)]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-gray-600 text-[9px] font-light tracking-wider">CDJ</span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border border-gray-600 bg-gray-100/10 overflow-hidden shadow-[inset_0_0_6px_rgba(0,0,0,0.6)]">
                    {deckB.track?.artwork ? (
                      <Image
                        src={deckB.track.artwork}
                        alt={deckB.track.title}
                        fill
                        className="object-cover"
                        unoptimized={shouldUnoptimizeImage(deckB.track.artwork)}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100/90 flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-500 shadow-[inset_0_0_4px_rgba(0,0,0,0.3)]" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full"></div>
                <div
                  className="absolute top-1/2 left-0 w-12 h-0.5 bg-gray-700 origin-left"
                  style={{
                    transform: `rotate(${jogWheelBPosition * 0.3}deg) translateY(-50%)`,
                    transformOrigin: 'left center'
                  }}
                >
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                </div>
              </div>
            </div>

            {/* Tempo Slider - Deck B (outer right) */}
            <div className="flex flex-col items-center gap-1 self-stretch h-[430px]">
              <div className="text-[9px] text-gray-400">BPM</div>
              <div className="text-xs font-mono text-white">
                {deckB.detectedBPM ? `${(deckB.detectedBPM * deckB.playbackRate).toFixed(1)}` : '---'}
              </div>
              <div
                className="relative w-10 rounded border border-gray-700 bg-gradient-to-b from-gray-900/90 to-gray-950 overflow-hidden flex flex-col shadow-[inset_0_0_18px_rgba(0,0,0,0.85)]"
                style={{ height: 'var(--eq-container-h)' }}
              >
                <div className="absolute top-1 left-2 right-2 h-[2px] bg-orange-500" />
                <div className="absolute top-1/2 left-2 right-2 h-px bg-white/25" />
                <div className="absolute left-2 right-2 top-2.5 bottom-2.5 bg-black/80 rounded-[4px] shadow-[inset_0_0_6px_rgba(0,0,0,0.8)]" />
                <div className="absolute left-2 right-2 top-2.5 bottom-2.5">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <div
                      key={`tempo-b-${i}`}
                      className="absolute left-0 right-0 h-[2px] bg-white/70"
                      style={{ top: `${i * 10}%` }}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min={getTempoBounds(tempoRangeWide).min}
                  max={getTempoBounds(tempoRangeWide).max}
                  step={isShiftActive('B') ? 0.0001 : 0.001}
                  value={deckB.playbackRate}
                  onChange={(e) => {
                    const next = snapTempoCenter(clampTempo(parseFloat(e.target.value), tempoRangeWide))
                    setDeckB(prev => ({ ...prev, playbackRate: next }))
                  }}
                  onDoubleClick={() => setDeckB(prev => ({ ...prev, playbackRate: 1 }))}
                  className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2 opacity-0 cursor-pointer"
                  style={{ writingMode: 'vertical-lr', transform: 'translateX(-50%) rotate(180deg)' }}
                  title="Tempo (Deck B)"
                />
                <div
                  className="absolute left-1/2 w-7 h-4 bg-gradient-to-b from-gray-100 to-gray-300 border border-gray-500 rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  style={{
                    top: `${(1 - (deckB.playbackRate - getTempoBounds(tempoRangeWide).min) / (getTempoBounds(tempoRangeWide).max - getTempoBounds(tempoRangeWide).min)) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="absolute inset-x-0 top-[1px] h-[1px] bg-white/80 rounded-sm" />
                  <div className="absolute inset-x-0 bottom-[1px] h-[1px] bg-black/20 rounded-sm" />
                </div>
              </div>
              <div className="text-[8px] text-gray-500">{((deckB.playbackRate - 1) * 100).toFixed(1)}%</div>
            </div>
          </div>

          {/* Playback Controls moved to shared row */}
        </div>
      </div>
      </div>

      {/* Hot Cues Modal */}
      {showHotCuesModal && (
        <div
          className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4"
          onClick={() => setShowHotCuesModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-md w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Hot Cues - Deck {showHotCuesModal}
              </h3>
              <button
                onClick={() => setShowHotCuesModal(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {(showHotCuesModal === 'A' ? deckA.hotCues : deckB.hotCues).map((cue, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-gray-800 rounded"
                >
                  <div className="flex-1">
                    <div className="text-white text-sm">
                      {cue.label || `Cue ${idx + 1}`}
                    </div>
                    <div className="text-gray-400 text-xs">
                      {formatTime(cue.time)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        jumpToHotCue(showHotCuesModal, cue.time)
                        setShowHotCuesModal(null)
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded touch-manipulation min-h-[44px]"
                    >
                      Jump
                    </button>
                    <button
                      onClick={() => removeHotCue(showHotCuesModal, idx)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded touch-manipulation min-h-[44px]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {((showHotCuesModal === 'A' ? deckA.hotCues : deckB.hotCues).length === 0) && (
                <div className="text-gray-400 text-sm text-center py-4">
                  No hot cues set
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  addHotCue(showHotCuesModal, `Cue ${(showHotCuesModal === 'A' ? deckA.hotCues : deckB.hotCues).length + 1}`)
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded touch-manipulation min-h-[44px]"
              >
                Add Cue at Current Position
              </button>
              <button
                onClick={() => setShowHotCuesModal(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded touch-manipulation min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Panel */}
      {showMenu && (
        <div className="fixed bottom-24 left-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4 z-[150] min-w-[200px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">DJ Menu</h3>
            <button
              onClick={() => setShowMenu(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => {
                setDeckA(prev => ({ ...prev, loopIn: null, loopOut: null }))
                setDeckB(prev => ({ ...prev, loopIn: null, loopOut: null }))
                setDeckALoop(false)
                setDeckBLoop(false)
                setShowMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800 rounded"
            >
              Clear All Loops
            </button>
            <button
              onClick={() => {
                setDeckA(prev => ({ ...prev, hotCues: [] }))
                setDeckB(prev => ({ ...prev, hotCues: [] }))
                setDeckAHotCues([])
                setDeckBHotCues([])
                setShowMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800 rounded"
            >
              Clear All Hot Cues
            </button>
            <button
              onClick={() => {
                setCrossfaderPosition(0.5)
                setShowMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-800 rounded"
            >
              Center Crossfader
            </button>
          </div>
        </div>
      )}

      {/* Hidden audio elements */}
      <audio ref={audioARef} preload="auto" crossOrigin="anonymous" playsInline />
      <audio ref={audioBRef} preload="auto" crossOrigin="anonymous" playsInline />
    </div>
  )
}
