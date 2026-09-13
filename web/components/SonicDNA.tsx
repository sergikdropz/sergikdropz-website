'use client'

import { useState, useEffect, useRef } from 'react'
import { FaBrain, FaSpinner, FaHeart, FaMusic, FaHistory, FaGlobe, FaTags, FaInfoCircle, FaChevronDown, FaChevronUp } from 'react-icons/fa'
import { getSonicDnaReportView } from '@/lib/audio/sonic-dna-report-sections'
import { measuredGrooveFacts } from '@/lib/audio/sonic-dna-prose'
import DnaReadableCopy from '@/components/music/DnaReadableCopy'
import { appendSonicDnaLookupParams, sonicDnaLookupPath } from '@/lib/audio/sonic-dna-query'
import { parseSonicDna } from '@/lib/audio/sonic-dna-quality'
import { isSonicDnaReadyForDisplay } from '@/lib/audio/sonic-dna-pipeline'
import { prepareSonicDnaFromIntelligence } from '@/lib/audio/sonic-dna-intelligence-load'

interface SonicDNAProps {
  trackId: string
  audioFileId?: string
  trackFile: string
  trackTitle: string
  artistName: string
  /** Preloaded DNA from the track record — prefer over regenerate/POST. */
  initialSonicDna?: SonicDNAData | Record<string, unknown> | null
  /** When false, defer DB fetch until the panel is opened. Default: true. */
  enabled?: boolean
  /** Called when unified/measured DNA loads from the API (for deck badges). */
  onSonicDnaLoaded?: (dna: SonicDNAData) => void
  compact?: boolean // For inline display in player
  hideHeader?: boolean // Hide the header when already inside a collapsible container
}

function prepareSonicDnaForDisplay(value: unknown): SonicDNAData | null {
  const prepared = prepareSonicDnaFromIntelligence(value)
  return prepared ? (prepared as SonicDNAData) : null
}

function trackLookupKey(
  trackId: string,
  audioFileId: string | undefined,
  trackFile: string,
): string {
  return `${trackId || ''}::${audioFileId || ''}::${sonicDnaLookupPath(trackFile)}`
}

interface SonicDNAData {
  description?: string // Track description
  intention?: string // Intention/purpose of the music
  emotional: {
    primaryEmotions: string[]
    emotionalJourney: string
    psychologicalProfile: string
    moodTransitions: Array<{ time: number; emotion: string; intensity: number }>
  }
  musical: {
    keySignature: string
    timeSignature: string
    scale?: string // Musical scale
    harmonicComplexity: string
    rhythmicPatterns: string
    instrumentation: string[]
    productionTechniques: string[]
    musicalInfluences: string[]
  }
  historical: {
    eraInfluences: string[]
    historicalContext: string
    evolutionFrom: string[]
    innovationPoints: string[]
  }
  regional: {
    primaryRegions: string[]
    culturalInfluences: string[]
    regionalCharacteristics: string
    crossCulturalElements: string[]
  }
  genres: {
    primaryGenres: string[]
    subgenres: string[]
    genreFusion: string
    genreEvolution: string
    genreCharacteristics?: string[]
    genreInfluences?: string[]
  }
  technical: {
    bpm: number
    energyLevel: number
    danceability: number
    key?: { key: string; mode: string; scale: string; confidence: number }
    timeSignature?: string
    technicalDescription?: string
  }
  drums?: {
    patternType: string
    kickPattern: string
    snarePattern: string
    hihatPattern: string
    genreStyles?: string[]
    patternRecognition?: string
    complexity?: string
  }
  musicology?: {
    description?: string
    era?: { decade: string; description?: string }
    style?: { primaryStyle: string; description?: string }
    production?: { techniques: string[]; description?: string }
  }
  cultural?: {
    description?: string
    regions?: string[]
    culturalInfluences?: string[]
    regionalCharacteristics?: string
  }
  summary: string
}

// Module-level caches to dedupe requests across component instances
// Data version - increment to clear all caches after data updates
const SONIC_DNA_DATA_VERSION = '20260903-intelligence-encyclopedia'
const SONIC_DNA_TTL_MS = 30 * 1000 // 30 second cache (reduced for fresh data)
const sonicDNAResponseCache = new Map<
  string,
  { data: any; expiresAt: number; version: string }
>()
const sonicDNAInFlight = new Map<string, Promise<any>>()

// Clear cache on module load and check version
if (typeof window !== 'undefined') {
  // Clear old caches on load
  sonicDNAResponseCache.clear()
  // Also clear service worker cache if possible
  if ('caches' in window) {
    caches.delete('sergik-api-cache-v1').catch(() => {})
  }
}

function normalizeTrackPath(trackFile: string): string {
  return sonicDnaLookupPath(trackFile)
}

export default function SonicDNA({
  trackId,
  audioFileId,
  trackFile,
  trackTitle,
  artistName,
  initialSonicDna = null,
  enabled = true,
  onSonicDnaLoaded,
  compact = false,
  hideHeader = false,
}: SonicDNAProps) {
  const lookupKey = trackLookupKey(trackId, audioFileId, trackFile)
  const seededDna = prepareSonicDnaForDisplay(initialSonicDna)
  const [sonicDNA, setSonicDNA] = useState<SonicDNAData | null>(seededDna)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>(
    seededDna ? 'completed' : 'pending',
  )
  const [awaitingGroove, setAwaitingGroove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [expandedCopy, setExpandedCopy] = useState<{ title: string; text: string } | null>(null)
  const [isExpandedView, setIsExpandedView] = useState(false)
  const [viewMode, setViewMode] = useState<'simple' | 'deep'>('deep')
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fetchGenerationRef = useRef(0)
  const hasLoadedForKeyRef = useRef(Boolean(seededDna))
  const lookupKeyRef = useRef(lookupKey)
  const statusRef = useRef<'pending' | 'processing' | 'completed' | 'failed'>(
    seededDna ? 'completed' : 'pending',
  )

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  const applyLoadedDna = (dna: SonicDNAData, generation: number) => {
    if (generation !== fetchGenerationRef.current) return
    hasLoadedForKeyRef.current = true
    setSonicDNA(dna)
    setAwaitingGroove(false)
    setStatus('completed')
    setError(null)
    setIsLoading(false)
    stopPolling()
    onSonicDnaLoaded?.(dna)
  }

  const applyApiPayload = (data: Record<string, unknown>, generation: number) => {
    if (generation !== fetchGenerationRef.current) return

    const prepared = prepareSonicDnaForDisplay(data.sonicDNA)
    if (prepared) {
      applyLoadedDna(prepared, generation)
      return
    }

    const apiStatus = typeof data.status === 'string' ? data.status : 'pending'
    const hasThinDna = Boolean(data.sonicDNA && typeof data.sonicDNA === 'object')
    const percent = Number(data.percent)
    // Completed API payload without groove core → not "missing", gated on DSP.
    if (hasThinDna && (apiStatus === 'completed' || (Number.isFinite(percent) && percent === 0))) {
      hasLoadedForKeyRef.current = true
      setSonicDNA(null)
      setAwaitingGroove(true)
      setStatus('pending')
      setError(null)
      setIsLoading(false)
      stopPolling()
      return
    }

    if (apiStatus === 'processing') {
      setStatus('processing')
      setIsLoading(true)
      setError('Analysis is in progress. Please wait...')
      if (!pollIntervalRef.current) {
        let pollCount = 0
        const maxPolls = 60
        pollIntervalRef.current = setInterval(() => {
          pollCount++
          if (statusRef.current === 'completed' || statusRef.current === 'failed') {
            stopPolling()
            return
          }
          if (pollCount >= maxPolls) {
            setError('Analysis is taking longer than expected. Try loading again.')
            setStatus('failed')
            setIsLoading(false)
            stopPolling()
            return
          }
          if (statusRef.current === 'processing') {
            void fetchSonicDNA(true, generation)
          }
        }, 3000)
      }
      return
    }

    if (apiStatus === 'failed') {
      setError(
        (typeof data.error === 'string' && data.error) ||
          (typeof data.message === 'string' && data.message) ||
          'Analysis failed',
      )
      setStatus('failed')
      setIsLoading(false)
      stopPolling()
      return
    }

    if (apiStatus === 'not_found') {
      setError(
        (typeof data.details === 'string' && data.details) ||
          'Track not found in database',
      )
      setStatus('failed')
      setIsLoading(false)
      stopPolling()
      return
    }

    if (data.error) {
      setError(
        (typeof data.details === 'string' && data.details) ||
          (typeof data.error === 'string' && data.error) ||
          'Failed to load Sonic DNA',
      )
      setStatus('failed')
      setIsLoading(false)
      stopPolling()
      return
    }

    setStatus('pending')
    setIsLoading(false)
    setSonicDNA(null)
    setError(null)
    stopPolling()
  }

  const fetchSonicDNA = async (force = false, generation = fetchGenerationRef.current) => {
    if (force) {
      fetchGenerationRef.current += 1
      generation = fetchGenerationRef.current
      hasLoadedForKeyRef.current = false
    }

    if (!force && hasLoadedForKeyRef.current) {
      setIsLoading(false)
      stopPolling()
      return
    }

    if (!force && sonicDNA && status === 'completed' && isSonicDnaReadyForDisplay(sonicDNA)) {
      setIsLoading(false)
      stopPolling()
      return
    }

    if (!force && isLoading && status === 'processing' && pollIntervalRef.current) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const normalizedPath = normalizeTrackPath(trackFile)
      const cacheKey = `${SONIC_DNA_DATA_VERSION}::${trackId || ''}::${audioFileId || ''}::${normalizedPath}`

      if (force) {
        sonicDNAResponseCache.delete(cacheKey)
        sonicDNAInFlight.delete(cacheKey)
      }

      const cached = sonicDNAResponseCache.get(cacheKey)
      if (!force && cached && Date.now() < cached.expiresAt && cached.version === SONIC_DNA_DATA_VERSION) {
        applyApiPayload(cached.data, generation)
        return
      }

      let promise = sonicDNAInFlight.get(cacheKey)
      if (!promise) {
        const params = new URLSearchParams({ v: SONIC_DNA_DATA_VERSION })
        appendSonicDnaLookupParams(params, {
          libraryTrackId: trackId,
          audioFileId,
          file: normalizedPath,
          title: trackTitle,
        })
        promise = fetch(`/api/audio/sonic-dna?${params.toString()}`, {
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        }).then(async (response) => {
          const data = await response.json().catch(() => ({}))
          if (!response.ok && response.status !== 404) {
            throw new Error(data.error || data.details || `HTTP ${response.status}`)
          }
          return data
        }).finally(() => {
          sonicDNAInFlight.delete(cacheKey)
        })
        sonicDNAInFlight.set(cacheKey, promise)
      }

      const data = await promise
      if (generation !== fetchGenerationRef.current) return

      if (prepareSonicDnaForDisplay(data.sonicDNA)) {
        sonicDNAResponseCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + SONIC_DNA_TTL_MS,
          version: SONIC_DNA_DATA_VERSION,
        })
      }

      applyApiPayload(data, generation)
    } catch (err: any) {
      if (generation !== fetchGenerationRef.current) return
      console.error('Sonic DNA fetch error:', err)
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        setError('Request timed out. Please check your connection and try again.')
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setError('Network error. Please check your connection and Supabase configuration.')
      } else {
        setError(err.message || 'Failed to fetch Sonic DNA analysis')
      }
      setStatus('failed')
      setIsLoading(false)
      stopPolling()
    }
  }

  // Reset only when track identity changes — do not wipe fetched DNA on unrelated re-renders.
  useEffect(() => {
    if (lookupKeyRef.current === lookupKey) return
    lookupKeyRef.current = lookupKey
    fetchGenerationRef.current += 1
    stopPolling()
    hasLoadedForKeyRef.current = false

    const nextSeed = prepareSonicDnaForDisplay(initialSonicDna)
    if (nextSeed) hasLoadedForKeyRef.current = true
    setSonicDNA(nextSeed)
    setStatus(nextSeed ? 'completed' : 'pending')
    setError(null)
    setIsLoading(false)
  }, [lookupKey])

  // Adopt preloaded DNA when parent supplies it for the current track.
  useEffect(() => {
    const nextSeed = prepareSonicDnaForDisplay(initialSonicDna)
    if (!nextSeed || hasLoadedForKeyRef.current) return
    applyLoadedDna(nextSeed, fetchGenerationRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSonicDna])

  // Load from knowledge/DB when the panel opens (or on track change while open).
  useEffect(() => {
    const shouldLoad =
      enabled && (!compact || hideHeader || !isCollapsed)
    if (!shouldLoad || hasLoadedForKeyRef.current) return

    void fetchSonicDNA(false, fetchGenerationRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, enabled, compact, hideHeader, isCollapsed])

  // Stop polling when component unmounts
  useEffect(() => () => stopPolling(), [])

  // Update status ref when status changes
  useEffect(() => {
    statusRef.current = status
    if ((status === 'completed' || status === 'failed') && pollIntervalRef.current) {
      stopPolling()
    }
  }, [status])

  useEffect(() => {
    if (!expandedCopy) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedCopy(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedCopy])

  useEffect(() => {
    if (!isExpandedView) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpandedView(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpandedView])

  const loadFromDatabaseButton = (
    <button
      type="button"
      onClick={() => {
        hasLoadedForKeyRef.current = false
        void fetchSonicDNA(true)
      }}
      disabled={isLoading}
      className={`w-full ${
        compact
          ? 'px-3 py-2 text-xs'
          : 'px-4 py-3'
      } bg-gray-700/80 hover:bg-gray-600/80 border border-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
    >
      {isLoading ? (
        <>
          <FaSpinner className="animate-spin" />
          <span>Loading Sonic DNA...</span>
        </>
      ) : (
        <span>Load Sonic DNA intelligence</span>
      )}
    </button>
  )

  const emptyState = (
    <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400 space-y-2`}>
      <p>
        {awaitingGroove
          ? 'Sonic DNA is stored, but groove analysis is incomplete (needs measured BPM + drum grid). Encyclopedia stays gated until audio is analyzed.'
          : 'No Sonic DNA intelligence card found for this track yet.'}
      </p>
      {loadFromDatabaseButton}
    </div>
  )

  // Render Sonic DNA sections with beautiful styling
  const renderSonicDNASections = (dna: SonicDNAData, isCompact: boolean = false, mode: 'simple' | 'deep' = 'deep') => {
    const textSize = isCompact ? 'text-xs' : 'text-sm'
    const padding = isCompact ? 'p-2' : 'p-4'
    const sectionGap = isCompact ? 'mb-2' : 'mb-4'
    const bodyPad = isCompact ? 'pl-0' : 'pl-5'
    const isDeep = mode === 'deep'
    const maxTextLength = isCompact ? 140 : 220
    const truncateText = (value?: string) => {
      if (!value) return ''
      if (isDeep) return value
      if (value.length <= maxTextLength) return value
      return `${value.slice(0, maxTextLength).trimEnd()}…`
    }
    
    // Extract comprehensive data if available - merge from multiple sources
    const comprehensive = (dna as any).comprehensive || {}
    const technical = comprehensive?.technical || dna.technical || {}
    const drums = comprehensive?.drums || (dna as any).drums || {}
    const harmony = comprehensive?.harmony || (dna as any).harmony || {}
    const musicbrainz = comprehensive?.musicbrainz || (dna as any).musicbrainz || {}
    const musicology = comprehensive?.musicology || (dna as any).musicology || {}
    const cultural = comprehensive?.cultural || (dna as any).cultural || dna.regional || {}
    
    // Merge emotional data from multiple sources
    const emotional = {
      ...dna.emotional,
      ...comprehensive?.emotional,
      primaryEmotions: dna.emotional?.primaryEmotions?.length > 0 
        ? dna.emotional.primaryEmotions 
        : comprehensive?.emotional?.primaryEmotions || [],
      emotionalJourney: dna.emotional?.emotionalJourney || comprehensive?.emotional?.emotionalJourney || '',
      psychologicalProfile: dna.emotional?.psychologicalProfile || comprehensive?.emotional?.psychologicalProfile || '',
    }
    
    // Merge genres data
    const genres = {
      ...dna.genres,
      ...comprehensive?.genres,
      primaryGenres: dna.genres?.primaryGenres?.length > 0 
        ? dna.genres.primaryGenres 
        : comprehensive?.genres?.primaryGenres || comprehensive?.genres?.primary || [],
      subgenres: dna.genres?.subgenres?.length > 0 
        ? dna.genres.subgenres 
        : comprehensive?.genres?.subgenres || [],
      genreFusion: dna.genres?.genreFusion || comprehensive?.genres?.fusion || '',
      relatedGenres: (dna.genres as { relatedGenres?: string[] })?.relatedGenres
        || comprehensive?.genres?.relatedGenres
        || comprehensive?.genres?.genreInfluences
        || [],
    }
    
    // Merge historical data
    const historical = {
      ...dna.historical,
      ...comprehensive?.historical,
      eraInfluences: dna.historical?.eraInfluences?.length > 0 
        ? dna.historical.eraInfluences 
        : comprehensive?.historical?.eraInfluences || musicology?.era?.eraInfluences || [],
    }
    
    // Merge regional data from cultural/regional sources
    const regional = {
      ...dna.regional,
      primaryRegions: dna.regional?.primaryRegions?.length > 0 
        ? dna.regional.primaryRegions 
        : cultural?.regions || [],
      culturalInfluences: dna.regional?.culturalInfluences?.length > 0 
        ? dna.regional.culturalInfluences 
        : cultural?.culturalInfluences || [],
      regionalCharacteristics: dna.regional?.regionalCharacteristics || cultural?.regionalCharacteristics || '',
    }
    
    const report = getSonicDnaReportView(dna)
    const measured = report.measured || {}
    const usageLines = report.usageLines
    const instrumentationLines = report.instrumentationLines || []
    const instrumentationChips = report.instrumentationChips || []
    const groovePrimary = report.groovePrimary
    const grooveSub = report.grooveSub
    const keyLabel = report.key
    const bpmLabel = report.bpm
    const related = report.related
    const dspFacts = report.byId.dsp?.text || ''
    const historyText = report.byId.history?.text || ''
    const cultureText = report.byId.culture?.text || ''
    const psychText = report.byId.psychology?.text || ''
    const psychoText = report.byId.psychoacoustics?.text || ''
    const musicoText = report.byId.musicology?.text || ''
    const description = report.byId.description?.text || ''
    const benefitsText = report.byId.benefits?.text || ''
    const intention = report.byId.intention?.text || ''
    const grooveFacts = measuredGrooveFacts(measured)
    const showLegacyExtras = !report.encyclopedia
    
    const scoreLabel = (value: unknown, asTen = true) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return null
      if (n <= 1) return `${Math.round(n * 100)}%`
      if (n <= 10 || asTen) return `${Math.round(n)}/10`
      return `${Math.round(n)}%`
    }

    const Chip = ({ text, className }: { text: string; className: string }) => (
      <span className={`px-2 py-1 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border ${className}`}>
        {text}
      </span>
    )
    
    // Create merged dna object for rendering
    return (
      <div className="space-y-3">
        {(groovePrimary || bpmLabel || keyLabel) && (
          <div className={`bg-gradient-to-br from-purple-900/30 to-indigo-900/20 rounded-lg ${padding} border border-purple-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaTags className="text-purple-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-purple-300 ${textSize}`}>Groove class</h3>
            </div>
            <p className={`text-purple-100 ${isCompact ? 'text-sm' : 'text-base'} font-semibold ${bodyPad} break-words`}>
              {groovePrimary || 'Unclassified'}
              {grooveSub ? ` / ${grooveSub}` : ''}
            </p>
            <div className={`flex flex-wrap gap-1.5 sm:gap-2 ${bodyPad} mt-2`}>
              {bpmLabel ? <Chip text={`${Math.round(Number(bpmLabel))} BPM`} className="bg-purple-900/40 text-purple-200 border-purple-700/30" /> : null}
              {measured.timingFeel ? <Chip text={String(measured.timingFeel)} className="bg-purple-900/40 text-purple-200 border-purple-700/30" /> : null}
              {measured.effectiveBpm && measured.bpm && Math.abs(measured.effectiveBpm - measured.bpm) >= 8 ? (
                <Chip text={`felt ~${Math.round(measured.effectiveBpm)} BPM`} className="bg-amber-900/40 text-amber-200 border-amber-700/30" />
              ) : null}
              {keyLabel && keyLabel !== 'Unknown' ? <Chip text={String(keyLabel)} className="bg-indigo-900/40 text-indigo-200 border-indigo-700/30" /> : null}
              {measured.camelot ? <Chip text={`Camelot ${measured.camelot}`} className="bg-indigo-900/40 text-indigo-200 border-indigo-700/30" /> : null}
            </div>
          </div>
        )}

        {usageLines.length > 0 && (
          <div className={`bg-gradient-to-br from-orange-900/20 to-amber-900/20 rounded-lg ${padding} border border-orange-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaMusic className="text-orange-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-orange-300 ${textSize}`}>How percussion and instruments are used</h3>
            </div>
            <ul className={`space-y-1.5 ${bodyPad} text-orange-100 ${textSize} leading-relaxed`}>
              {(isDeep ? usageLines : usageLines.slice(0, 4)).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {(instrumentationLines.length > 0 || instrumentationChips.length > 0) && (
          <div className={`bg-gradient-to-br from-teal-900/20 to-cyan-900/20 rounded-lg ${padding} border border-teal-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaTags className="text-teal-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-teal-300 ${textSize}`}>Technical instrumentation</h3>
            </div>
            {instrumentationChips.length > 0 && (
              <div className={`flex flex-wrap gap-1.5 ${bodyPad} mb-2`}>
                {(isDeep ? instrumentationChips : instrumentationChips.slice(0, 8)).map((chip) => (
                  <Chip
                    key={`${chip.category}-${chip.label}`}
                    text={chip.label}
                    className="bg-teal-900/40 text-teal-200 border-teal-700/30"
                  />
                ))}
              </div>
            )}
            {instrumentationLines.length > 0 && (
              <ul className={`space-y-1.5 ${bodyPad} text-teal-100 ${textSize} leading-relaxed`}>
                {(isDeep ? instrumentationLines : instrumentationLines.slice(0, 3)).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(grooveFacts.length > 0 || dspFacts) && (
          <div
            className={`bg-gradient-to-br from-slate-900/40 to-gray-900/20 rounded-lg ${padding} border border-gray-600/30 ${sectionGap} cursor-zoom-in`}
            onDoubleClick={() => setExpandedCopy({ title: 'Measured groove', text: dspFacts })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setExpandedCopy({ title: 'Measured groove', text: dspFacts })
              }
            }}
            role="button"
            tabIndex={0}
            title="Double-click to expand"
            aria-label="Expand measured groove facts"
          >
            <div className="flex items-center gap-2 mb-2">
              <FaInfoCircle className="text-gray-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-gray-300 ${textSize}`}>Measured groove</h3>
            </div>
            {grooveFacts.length > 0 ? (
              <dl className={`grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 ${bodyPad} ${textSize} text-gray-200`}>
                {grooveFacts.map((row) => (
                  <div key={row.label}>
                    <dt className="text-[10px] uppercase tracking-wide text-gray-500">{row.label}</dt>
                    <dd className="leading-relaxed">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <DnaReadableCopy text={dspFacts} className={`text-gray-200 ${bodyPad} ${textSize}`} simple={!isDeep} />
            )}
          </div>
        )}

        {related.length > 0 && (
          <div className={`bg-gradient-to-br from-fuchsia-900/20 to-purple-900/20 rounded-lg ${padding} border border-fuchsia-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaGlobe className="text-fuchsia-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-fuchsia-300 ${textSize}`}>Related traditions</h3>
            </div>
            <p className={`text-fuchsia-200/80 ${isCompact ? 'text-[10px]' : 'text-xs'} ${bodyPad} mb-2`}>
              World-genre map for this class — not extra crate labels for this file.
            </p>
            <div className={`flex flex-wrap gap-1.5 ${bodyPad}`}>
              {(isDeep ? related : related.slice(0, 8)).map((name) => (
                <Chip key={name} text={name} className="bg-fuchsia-900/40 text-fuchsia-100 border-fuchsia-700/30" />
              ))}
            </div>
          </div>
        )}

        {intention && (
          <div className={`bg-gradient-to-br from-pink-900/20 to-rose-900/20 rounded-lg ${padding} border border-pink-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHeart className="text-pink-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-pink-300 ${textSize}`}>Intention</h3>
            </div>
            <DnaReadableCopy text={intention} className={`text-pink-200 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {psychoText && (
          <div
            className={`bg-gradient-to-br from-indigo-900/30 to-fuchsia-900/20 rounded-lg ${padding} border border-indigo-500/25 ${sectionGap} cursor-zoom-in`}
            onDoubleClick={() => setExpandedCopy({ title: 'Psychoacoustics study', text: psychoText })}
            role="button"
            tabIndex={0}
            aria-label="Expand psychoacoustics study"
          >
            <div className="flex items-center gap-2 mb-2">
              <FaBrain className="text-indigo-300" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-indigo-200 ${textSize}`}>Psychoacoustics study</h3>
            </div>
            <p className={`text-indigo-200/70 ${isCompact ? 'text-[10px]' : 'text-xs'} ${bodyPad} mb-2`}>
              Social usage, sonic intent, and the DNA formula this groove activates in a listener.
            </p>
            <DnaReadableCopy text={psychoText} className={`text-indigo-100 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {description && (
          <div
            className={`bg-gradient-to-br from-blue-900/20 to-indigo-900/20 rounded-lg ${padding} border border-blue-500/20 ${sectionGap} cursor-zoom-in`}
            onDoubleClick={() => setExpandedCopy({ title: 'Description', text: description })}
            role="button"
            tabIndex={0}
            aria-label="Expand description"
          >
            <div className="flex items-center gap-2 mb-2">
              <FaInfoCircle className="text-blue-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-blue-300 ${textSize}`}>Description</h3>
            </div>
            <DnaReadableCopy text={description} className={`text-blue-200 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {benefitsText && (
          <div
            className={`bg-gradient-to-br from-emerald-900/20 to-teal-900/20 rounded-lg ${padding} border border-emerald-500/20 ${sectionGap} cursor-zoom-in`}
            onDoubleClick={() => setExpandedCopy({ title: 'Benefits of listening', text: benefitsText })}
            role="button"
            tabIndex={0}
            aria-label="Expand listening benefits"
          >
            <div className="flex items-center gap-2 mb-2">
              <FaHeart className="text-emerald-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-emerald-300 ${textSize}`}>Benefits of listening</h3>
            </div>
            <p className={`text-emerald-200/70 ${isCompact ? 'text-[10px]' : 'text-xs'} ${bodyPad} mb-2`}>
              What this groove offers a listener or DJ — derived from the full Sonic DNA card.
            </p>
            <DnaReadableCopy text={benefitsText} className={`text-emerald-100 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {historyText && (
          <div
            className={`bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-lg ${padding} border border-amber-500/20 ${sectionGap} cursor-zoom-in`}
            onDoubleClick={() => setExpandedCopy({ title: 'History and science', text: historyText })}
            role="button"
            tabIndex={0}
            aria-label="Expand historical context"
          >
            <div className="flex items-center gap-2 mb-2">
              <FaHistory className="text-amber-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-amber-300 ${textSize}`}>History and science</h3>
            </div>
            <DnaReadableCopy text={historyText} className={`text-amber-100 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {cultureText && (
          <div className={`bg-gradient-to-br from-teal-900/20 to-emerald-900/20 rounded-lg ${padding} border border-teal-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaGlobe className="text-teal-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-teal-300 ${textSize}`}>Culture</h3>
            </div>
            <DnaReadableCopy text={cultureText} className={`text-teal-100 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {psychText && (
          <div className={`bg-gradient-to-br from-rose-900/20 to-pink-900/20 rounded-lg ${padding} border border-rose-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaHeart className="text-rose-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-rose-300 ${textSize}`}>Psychology</h3>
            </div>
            <DnaReadableCopy text={psychText} className={`text-rose-100 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {musicoText && (
          <div className={`bg-gradient-to-br from-violet-900/20 to-purple-900/20 rounded-lg ${padding} border border-violet-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaHistory className="text-violet-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-violet-300 ${textSize}`}>Musicology</h3>
            </div>
            <DnaReadableCopy text={musicoText} className={`text-violet-100 ${bodyPad} ${textSize}`} simple={!isDeep} />
          </div>
        )}

        {/* Technical Analysis */}
        {showLegacyExtras && technical && (technical.bpm || technical.key) && (
          <div className={`bg-gradient-to-br from-cyan-900/20 to-teal-900/20 rounded-lg ${padding} border border-cyan-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaMusic className="text-cyan-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-cyan-300 ${textSize}`}>Technical Analysis</h3>
            </div>
            <div className={`grid grid-cols-2 gap-3 ${bodyPad}`}>
              {technical.bpm && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>BPM</p>
                  <p className={`text-cyan-200 font-bold ${textSize}`}>{Math.round(Number(technical.bpm))}</p>
                </div>
              )}
              {keyLabel && keyLabel !== 'Unknown' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Key</p>
                  <p className={`text-cyan-200 font-bold ${textSize}`}>{keyLabel}</p>
                </div>
              )}
              {(measured.scale || technical.key?.scale || dna.musical?.scale) && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Scale</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>{measured.scale || technical.key?.scale || dna.musical?.scale}</p>
                </div>
              )}
              {technical.timeSignature && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Time Signature</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>{technical.timeSignature}</p>
                </div>
              )}
              {technical.energyLevel !== undefined && scoreLabel(technical.energyLevel) && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Energy</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>{scoreLabel(technical.energyLevel)}</p>
                </div>
              )}
              {technical.danceability !== undefined && scoreLabel(technical.danceability) && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Danceability</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>{scoreLabel(technical.danceability)}</p>
                </div>
              )}
            </div>
            {technical.technicalDescription && (
              <div className={`mt-3 ${bodyPad}`}>
                <p className={`text-cyan-200 ${textSize} leading-relaxed`}>{truncateText(technical.technicalDescription)}</p>
              </div>
            )}
          </div>
        )}

        {/* Drum Pattern Analysis */}
        {showLegacyExtras && isDeep && ((drums && drums.pattern) || (dna.drums && (dna.drums.patternType || dna.drums.genreStyles))) ? (
          <div className={`bg-gradient-to-br from-orange-900/20 to-red-900/20 rounded-lg ${padding} border border-orange-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaMusic className="text-orange-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-orange-300 ${textSize}`}>Drum Pattern</h3>
            </div>
            <div className={`space-y-2 ${bodyPad}`}>
              {(drums?.pattern?.patternType || dna.drums?.patternType) && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Pattern Type</p>
                  <p className={`text-orange-200 font-medium ${textSize}`}>{drums?.pattern?.patternType || dna.drums?.patternType}</p>
                </div>
              )}
              {(drums?.pattern || dna.drums) && (
                <div className="grid grid-cols-3 gap-2">
                  {(drums?.pattern?.kickPattern || dna.drums?.kickPattern) && (
                    <div>
                      <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Kick</p>
                      <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{drums?.pattern?.kickPattern || dna.drums?.kickPattern}</p>
                    </div>
                  )}
                  {(drums?.pattern?.snarePattern || dna.drums?.snarePattern) && (
                    <div>
                      <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Snare</p>
                      <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{drums?.pattern?.snarePattern || dna.drums?.snarePattern}</p>
                    </div>
                  )}
                  {(drums?.pattern?.hihatPattern || dna.drums?.hihatPattern) && (
                    <div>
                      <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Hi-Hat</p>
                      <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{drums?.pattern?.hihatPattern || dna.drums?.hihatPattern}</p>
                    </div>
                  )}
                </div>
              )}
              {/* Genre Drum Styles */}
              {(() => {
                const genreStyles = Array.isArray(drums?.genreStyles) 
                  ? drums.genreStyles 
                  : Array.isArray(dna.drums?.genreStyles) 
                    ? dna.drums.genreStyles 
                    : []
                return genreStyles.length > 0 && (
                  <div className="mt-3">
                    <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Genre Drum Styles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {genreStyles.map((style: string, i: number) => (
                        <span key={i} className={`px-2 py-1 bg-orange-900/40 text-orange-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-orange-700/30`}>
                          {style}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {/* Timing Analysis (Enhanced) */}
              {(() => {
                const timing = (drums as any)?.timing || (dna.drums as any)?.timing || (dna as any).timing
                if (!timing) return null
                const isHalfTime = timing.type === 'half-time'
                return (
                  <div className="mt-3">
                    <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Timing Feel</p>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-md ${textSize} font-medium border ${
                        isHalfTime 
                          ? 'bg-amber-900/40 text-amber-200 border-amber-700/30' 
                          : 'bg-green-900/40 text-green-200 border-green-700/30'
                      }`}>
                        {isHalfTime ? '⏱️ Half-Time' : '⏱️ Full-Time'}
                      </span>
                      {timing.effectiveBpm && (
                        <span className={`text-gray-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                          (Effective: {timing.effectiveBpm} BPM)
                        </span>
                      )}
                      {timing.confidence && (
                        <span className={`text-gray-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                          {timing.confidence}% confident
                        </span>
                      )}
                    </div>
                    {timing.indicators && timing.indicators.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {timing.indicators.slice(0, 3).map((indicator: string, i: number) => (
                          <span key={i} className={`px-1.5 py-0.5 bg-gray-800/50 text-gray-400 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                            {indicator}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* Cadence Analysis (Enhanced) */}
              {(() => {
                const cadence = (drums as any)?.cadence || (dna.drums as any)?.cadence
                if (!cadence) return null
                return (
                  <div className="mt-3">
                    <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Rhythm Cadence</p>
                    <div className="grid grid-cols-2 gap-2">
                      {cadence.groove && (
                        <div>
                          <p className={`text-gray-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Groove</p>
                          <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'} capitalize`}>{cadence.groove}</p>
                        </div>
                      )}
                      {cadence.density && (
                        <div>
                          <p className={`text-gray-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Density</p>
                          <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'} capitalize`}>{cadence.density}</p>
                        </div>
                      )}
                      {cadence.complexity !== undefined && (
                        <div>
                          <p className={`text-gray-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Complexity</p>
                          <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{cadence.complexity}/10</p>
                        </div>
                      )}
                      {cadence.syncopation !== undefined && cadence.syncopation > 30 && (
                        <div>
                          <p className={`text-gray-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Syncopation</p>
                          <p className={`text-orange-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{cadence.syncopation}%</p>
                        </div>
                      )}
                    </div>
                    {cadence.polyrhythm && (
                      <span className={`inline-block mt-1.5 px-2 py-0.5 bg-purple-900/40 text-purple-200 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'} border border-purple-700/30`}>
                        Polyrhythmic
                      </span>
                    )}
                  </div>
                )
              })()}
              {/* Bassline Analysis (Enhanced) */}
              {(() => {
                const bassline = (drums as any)?.bassline || (dna.drums as any)?.bassline
                if (!bassline) return null
                return (
                  <div className="mt-3">
                    <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Bassline</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-1 bg-red-900/40 text-red-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-red-700/30`}>
                        {bassline.type?.replace(/-/g, ' ')}
                      </span>
                      {bassline.slides && (
                        <span className={`px-1.5 py-0.5 bg-amber-900/30 text-amber-300 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                          slides
                        </span>
                      )}
                      {bassline.subHarmonics && (
                        <span className={`px-1.5 py-0.5 bg-indigo-900/30 text-indigo-300 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                          sub-bass
                        </span>
                      )}
                    </div>
                    {Array.isArray(bassline.character) && bassline.character.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {bassline.character.slice(0, 4).map((char: string, i: number) => (
                          <span key={i} className={`px-1.5 py-0.5 bg-gray-800/50 text-gray-400 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                            {char}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* Pattern Recognition */}
              {((drums as any)?.patternRecognition || (dna.drums as any)?.patternRecognition) && (
                <div className="mt-3">
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Pattern Recognition</p>
                  <p className={`text-orange-200 ${textSize} leading-relaxed`}>{truncateText((drums as any)?.patternRecognition || (dna.drums as any)?.patternRecognition)}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Harmony Analysis */}
        {isDeep && harmony && harmony.keySignature && harmony.keySignature !== 'Unknown' && (
          <div className={`bg-gradient-to-br from-indigo-900/20 to-violet-900/20 rounded-lg ${padding} border border-indigo-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaMusic className="text-indigo-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-indigo-300 ${textSize}`}>Harmony</h3>
            </div>
            <div className={`space-y-2 ${bodyPad}`}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Key</p>
                  <p className={`text-indigo-200 font-medium ${textSize}`}>{harmony.keySignature}</p>
                </div>
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Scale</p>
                  <p className={`text-indigo-200 font-medium ${textSize}`}>{harmony.scale}</p>
                </div>
              </div>
              {harmony.tonality && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Tonality</p>
                  <p className={`text-indigo-200 ${textSize}`}>{harmony.tonality}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MusicBrainz Metadata */}
        {showLegacyExtras && isDeep && musicbrainz && (musicbrainz.artistInfo || musicbrainz.artistId) && (
          <div className={`bg-gradient-to-br from-emerald-900/20 to-green-900/20 rounded-lg ${padding} border border-emerald-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaGlobe className="text-emerald-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-emerald-300 ${textSize}`}>MusicBrainz Data</h3>
            </div>
            <div className={`space-y-2 ${bodyPad}`}>
              {musicbrainz.artistInfo?.name && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Artist</p>
                  <p className={`text-emerald-200 ${textSize}`}>{musicbrainz.artistInfo.name}</p>
                </div>
              )}
              {musicbrainz.artistInfo?.area && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Origin</p>
                  <p className={`text-emerald-200 ${textSize}`}>{musicbrainz.artistInfo.area}</p>
                </div>
              )}
              {musicbrainz.artistInfo?.country && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Country</p>
                  <p className={`text-emerald-200 ${textSize}`}>{musicbrainz.artistInfo.country}</p>
                </div>
              )}
              {Array.isArray(musicbrainz.artistInfo?.genres) && musicbrainz.artistInfo.genres.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Genres</p>
                  <div className="flex flex-wrap gap-1.5">
                    {musicbrainz.artistInfo.genres.slice(0, 5).map((genre: string, i: number) => (
                      <span key={i} className={`px-2 py-1 bg-emerald-900/40 text-emerald-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-emerald-700/30`}>
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(musicbrainz.artistInfo?.tags) && musicbrainz.artistInfo.tags.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {musicbrainz.artistInfo.tags.slice(0, 5).map((tag: string, i: number) => (
                      <span key={i} className={`px-2 py-1 bg-emerald-800/30 text-emerald-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-emerald-700/20`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {musicbrainz.releaseInfo?.date && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Release Date</p>
                  <p className={`text-emerald-200 ${textSize}`}>{musicbrainz.releaseInfo.date}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Musicology Analysis */}
        {showLegacyExtras && isDeep && musicology && (
          <div className={`bg-gradient-to-br from-violet-900/20 to-purple-900/20 rounded-lg ${padding} border border-violet-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHistory className="text-violet-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-violet-300 ${textSize}`}>Musicology</h3>
            </div>
            <div className={`space-y-2.5 ${bodyPad}`}>
              {musicology.era && musicology.era.decade && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Era</p>
                  <p className={`text-violet-200 ${textSize}`}>{musicology.era.decade}</p>
                  {Array.isArray(musicology.era.eraInfluences) && musicology.era.eraInfluences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {musicology.era.eraInfluences.map((influence: string, i: number) => (
                        <span key={i} className={`px-2 py-1 bg-violet-900/40 text-violet-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-violet-700/30`}>
                          {influence}
                        </span>
                      ))}
                    </div>
                  )}
                  {musicology.era.historicalPeriod && (
                    <p className={`text-violet-300 mt-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{musicology.era.historicalPeriod}</p>
                  )}
                </div>
              )}
              {musicology.style && musicology.style.primaryStyle && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Primary Style</p>
                  <p className={`text-violet-200 font-medium ${textSize}`}>{musicology.style.primaryStyle}</p>
                  {Array.isArray(musicology.style.styleCharacteristics) && musicology.style.styleCharacteristics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {musicology.style.styleCharacteristics.slice(0, 5).map((char: string, i: number) => (
                        <span key={i} className={`px-2 py-1 bg-violet-800/30 text-violet-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-violet-700/20`}>
                          {char}
                        </span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(musicology.style.stylisticInfluences) && musicology.style.stylisticInfluences.length > 0 && (
                    <div className="mt-2">
                      <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Stylistic Influences</p>
                      <div className="flex flex-wrap gap-1.5">
                        {musicology.style.stylisticInfluences.slice(0, 5).map((influence: string, i: number) => (
                          <span key={i} className={`px-2 py-1 bg-violet-800/30 text-violet-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-violet-700/20`}>
                            {influence}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {musicology.production && Array.isArray(musicology.production.techniques) && musicology.production.techniques.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Production Techniques</p>
                  <div className="flex flex-wrap gap-1.5">
                    {musicology.production.techniques.slice(0, 5).map((tech: string, i: number) => (
                      <span key={i} className={`px-2 py-1 bg-violet-800/30 text-violet-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-violet-700/20`}>
                        {tech}
                      </span>
                    ))}
                  </div>
                  {musicology.production.productionEra && (
                    <p className={`text-violet-300 mt-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Era: {musicology.production.productionEra}</p>
                  )}
                </div>
              )}
              {/* Musicology Description */}
              {musicology.description && (
                <div className="mt-3">
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Musicological Analysis</p>
                  <p className={`text-violet-200 ${textSize} leading-relaxed`}>{truncateText(musicology.description)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cultural Analysis (from comprehensive) */}
        {showLegacyExtras && isDeep && comprehensive?.cultural && (
          <div className={`bg-gradient-to-br from-teal-900/20 to-cyan-900/20 rounded-lg ${padding} border border-teal-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaGlobe className="text-teal-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-teal-300 ${textSize}`}>Cultural Analysis</h3>
            </div>
            <div className={`space-y-2.5 ${bodyPad}`}>
              {Array.isArray(comprehensive.cultural.regions) && comprehensive.cultural.regions.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Regions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {comprehensive.cultural.regions.map((region: string, i: number) => (
                      <span key={i} className={`px-2 py-1 bg-teal-900/40 text-teal-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-teal-700/30`}>
                        {region}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(comprehensive.cultural.culturalInfluences) && comprehensive.cultural.culturalInfluences.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Cultural Influences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {comprehensive.cultural.culturalInfluences.map((influence: string, i: number) => (
                      <span key={i} className={`px-2 py-1 bg-teal-800/30 text-teal-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-teal-700/20`}>
                        {influence}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {comprehensive.cultural.regionalCharacteristics && comprehensive.cultural.regionalCharacteristics !== 'Unknown origin' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Regional Characteristics</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(comprehensive.cultural.regionalCharacteristics)}</p>
                </div>
              )}
              {Array.isArray(comprehensive.cultural.crossCulturalElements) && comprehensive.cultural.crossCulturalElements.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Cross-Cultural Elements</p>
                  <div className="flex flex-wrap gap-1.5">
                    {comprehensive.cultural.crossCulturalElements.slice(0, 5).map((element: string, i: number) => (
                      <span key={i} className={`px-2 py-1 bg-teal-800/30 text-teal-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-teal-700/20`}>
                        {element}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Cultural Description */}
              {(comprehensive.cultural.description || dna.cultural?.description) && (
                <div className="mt-3">
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Cultural Analysis</p>
                  <p className={`text-teal-200 ${textSize} leading-relaxed`}>{truncateText(comprehensive.cultural.description || dna.cultural?.description)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Emotional Intelligence */}
        {emotional && Array.isArray(emotional.primaryEmotions) && emotional.primaryEmotions.length > 0 && emotional.primaryEmotions[0] !== 'Unknown' && (
          <div className={`bg-gradient-to-br from-pink-900/20 to-rose-900/20 rounded-lg ${padding} border border-pink-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHeart className="text-pink-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-pink-300 ${textSize}`}>Emotional Intelligence</h3>
            </div>
            <div className={`space-y-2.5 ${bodyPad}`}>
              <div>
                <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Primary Emotions</p>
                <div className="flex flex-wrap gap-1.5">
                  {emotional.primaryEmotions.slice(0, isDeep ? undefined : 3).map((emotion: string, i: number) => (
                    <span key={i} className={`px-2 py-1 bg-pink-900/40 text-pink-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} font-medium border border-pink-700/30`}>
                      {emotion}
                    </span>
                  ))}
                </div>
              </div>
              {emotional.emotionalJourney && emotional.emotionalJourney !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Emotional Journey</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(emotional.emotionalJourney)}</p>
                </div>
              )}
              {emotional.psychologicalProfile && emotional.psychologicalProfile !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Psychological Profile</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(emotional.psychologicalProfile)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Musical Intelligence */}
        {dna.musical && (
          <div className={`bg-gradient-to-br from-blue-900/20 to-cyan-900/20 rounded-lg ${padding} border border-blue-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaMusic className="text-blue-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-blue-300 ${textSize}`}>Musical Intelligence</h3>
            </div>
            <div className={`space-y-2 ${bodyPad}`}>
              <div className="grid grid-cols-2 gap-3">
                {/* Key - check multiple sources */}
                {(() => {
                  const keyFromTechnical = technical?.key?.key && technical.key.key !== 'Unknown' 
                    ? `${technical.key.key} ${technical.key.mode || ''}`.trim()
                    : null
                  const keyFromHarmony = harmony?.keySignature && harmony.keySignature !== 'Unknown'
                    ? harmony.keySignature
                    : null
                  const keyFromMusical = dna.musical.keySignature && dna.musical.keySignature !== 'Unknown'
                    ? dna.musical.keySignature
                    : null
                  const displayKey = keyFromTechnical || keyFromHarmony || keyFromMusical
                  
                  return displayKey ? (
                    <div>
                      <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Key</p>
                      <p className={`text-blue-200 font-medium ${textSize}`}>{displayKey}</p>
                    </div>
                  ) : null
                })()}
                {/* Scale - check multiple sources */}
                {(() => {
                  const scaleFromTechnical = technical?.key?.scale
                  const scaleFromHarmony = harmony?.scale
                  const scaleFromMusical = dna.musical.scale
                  const displayScale = scaleFromTechnical || scaleFromHarmony || scaleFromMusical
                  
                  return displayScale ? (
                    <div>
                      <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Scale</p>
                      <p className={`text-blue-200 font-medium ${textSize}`}>{displayScale}</p>
                    </div>
                  ) : null
                })()}
                {dna.musical.timeSignature && (
                  <div>
                    <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Time Signature</p>
                    <p className={`text-blue-200 font-medium ${textSize}`}>{dna.musical.timeSignature}</p>
                  </div>
                )}
              </div>
              {dna.musical.harmonicComplexity && dna.musical.harmonicComplexity !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Harmonic Complexity</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(dna.musical.harmonicComplexity)}</p>
                </div>
              )}
              {Array.isArray(dna.musical.instrumentation) && dna.musical.instrumentation.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Instrumentation</p>
                  <div className="flex flex-wrap gap-1.5">
                    {dna.musical.instrumentation.slice(0, isDeep ? 6 : 3).map((instrument, i) => (
                      <span key={i} className={`px-2 py-1 bg-blue-800/30 text-blue-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-blue-700/20`}>
                        {instrument}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(dna.musical.productionTechniques) && dna.musical.productionTechniques.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Production Techniques</p>
                  <div className="flex flex-wrap gap-1.5">
                    {dna.musical.productionTechniques.slice(0, isDeep ? 6 : 3).map((technique, i) => (
                      <span key={i} className={`px-2 py-1 bg-blue-800/30 text-blue-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-blue-700/20`}>
                        {technique}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(dna.musical.musicalInfluences) && dna.musical.musicalInfluences.length > 0 && (
                <div>
                  <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Musical Influences</p>
                  <div className="flex flex-wrap gap-1.5">
                    {dna.musical.musicalInfluences.slice(0, isDeep ? 5 : 3).map((influence, i) => (
                      <span key={i} className={`px-2 py-1 bg-blue-900/40 text-blue-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-blue-700/30`}>
                        {influence}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {dna.musical.rhythmicPatterns && dna.musical.rhythmicPatterns !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Rhythmic Patterns</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(dna.musical.rhythmicPatterns)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Genre Analysis */}
        {genres && Array.isArray(genres.primaryGenres) && genres.primaryGenres.length > 0 && (
          <div className={`bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-lg ${padding} border border-purple-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaTags className="text-purple-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-purple-300 ${textSize}`}>Genre Analysis</h3>
              {/* Enhanced classification confidence */}
              {genres.confidence && genres.confidence > 0 && (
                <span className={`ml-auto px-2 py-0.5 bg-purple-900/50 text-purple-400 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                  {Math.round(genres.confidence * 100)}% confidence
                </span>
              )}
            </div>
            <div className={`space-y-2.5 ${bodyPad}`}>
              <div>
                <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Primary Genres</p>
                <div className="flex flex-wrap gap-1.5">
                  {genres.primaryGenres.map((genre: string, i: number) => (
                    <span key={i} className={`px-2 py-1 bg-purple-900/40 text-purple-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} font-semibold border border-purple-700/30`}>
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
              {/* Enhanced Subgenre Classification */}
              {(() => {
                const subgenreClassification = genres.subgenreClassification || (dna as any).genres?.subgenreClassification
                if (subgenreClassification?.primary) {
                  return (
                    <div>
                      <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Subgenre Classification</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Primary subgenre with confidence */}
                        <span className={`px-2.5 py-1 bg-purple-800/50 text-purple-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} font-medium border border-purple-600/40`}>
                          {subgenreClassification.primary.name}
                          {subgenreClassification.primary.confidence && (
                            <span className="ml-1.5 text-purple-400 opacity-80">
                              ({Math.round(subgenreClassification.primary.confidence * 100)}%)
                            </span>
                          )}
                        </span>
                        {/* Secondary subgenres */}
                        {Array.isArray(subgenreClassification.secondary) && subgenreClassification.secondary.slice(0, 3).map((sub: any, i: number) => (
                          <span key={i} className={`px-2 py-1 bg-purple-800/30 text-purple-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-purple-700/20`}>
                            {typeof sub === 'string' ? sub : sub.name}
                          </span>
                        ))}
                      </div>
                      {/* Matched features */}
                      {subgenreClassification.primary.matchedFeatures && subgenreClassification.primary.matchedFeatures.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {subgenreClassification.primary.matchedFeatures.slice(0, 4).map((feature: string, i: number) => (
                            <span key={i} className={`px-1.5 py-0.5 bg-gray-800/50 text-gray-400 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                // Fallback to regular subgenres list
                return Array.isArray(genres.subgenres) && genres.subgenres.length > 0 && (
                  <div>
                    <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Subgenres</p>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.subgenres.slice(0, 5).map((subgenre: string, i: number) => (
                        <span key={i} className={`px-2 py-1 bg-purple-800/30 text-purple-300 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-purple-700/20`}>
                          {subgenre}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {/* Microgenres */}
              {(() => {
                const microgenres = genres.microgenres || (dna as any).genres?.microgenres
                return Array.isArray(microgenres) && microgenres.length > 0 && (
                  <div>
                    <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Microgenres</p>
                    <div className="flex flex-wrap gap-1">
                      {microgenres.slice(0, 4).map((micro: string, i: number) => (
                        <span key={i} className={`px-1.5 py-0.5 bg-indigo-900/30 text-indigo-300 rounded ${isCompact ? 'text-[9px]' : 'text-[10px]'} border border-indigo-700/20`}>
                          {micro}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {/* Era and Origins */}
              {(() => {
                const era = genres.era || (dna as any).genres?.era
                const origins = genres.origins || (dna as any).genres?.origins
                if (!era && (!origins || origins.length === 0)) return null
                return (
                  <div className="flex flex-wrap gap-3">
                    {era && (
                      <div>
                        <p className={`text-gray-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Era</p>
                        <p className={`text-purple-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{era}</p>
                      </div>
                    )}
                    {Array.isArray(origins) && origins.length > 0 && (
                      <div>
                        <p className={`text-gray-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Origins</p>
                        <p className={`text-purple-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{origins.slice(0, 2).join(', ')}</p>
                      </div>
                    )}
                  </div>
                )
              })()}
              {genres.genreFusion && genres.genreFusion !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Genre Fusion</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(genres.genreFusion)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Historical Context */}
        {isDeep && historical && Array.isArray(historical.eraInfluences) && historical.eraInfluences.length > 0 && !historyText && (
          <div className={`bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-lg ${padding} border border-amber-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHistory className="text-amber-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-amber-300 ${textSize}`}>Historical Context</h3>
            </div>
            <div className={`space-y-2.5 ${bodyPad}`}>
              <div>
                <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Era Influences</p>
                <div className="flex flex-wrap gap-1.5">
                  {historical.eraInfluences.slice(0, isDeep ? 5 : 3).map((era: string, i: number) => (
                    <span key={i} className={`px-2 py-1 bg-amber-900/40 text-amber-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-amber-700/30`}>
                      {era}
                    </span>
                  ))}
                </div>
              </div>
              {historical.historicalContext && historical.historicalContext !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Historical Context</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(historical.historicalContext)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Regional & Cultural */}
        {isDeep && regional && Array.isArray(regional.primaryRegions) && regional.primaryRegions.length > 0 && (
          <div className={`bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-lg ${padding} border border-green-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaGlobe className="text-green-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-green-300 ${textSize}`}>Regional & Cultural</h3>
            </div>
            <div className={`space-y-2.5 ${bodyPad}`}>
              <div>
                <p className={`text-gray-400 mb-1.5 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Primary Regions</p>
                <div className="flex flex-wrap gap-1.5">
                  {regional.primaryRegions.slice(0, 5).map((region: string, i: number) => (
                    <span key={i} className={`px-2 py-1 bg-green-900/40 text-green-200 rounded-md ${isCompact ? 'text-[10px]' : 'text-xs'} border border-green-700/30`}>
                      {region}
                    </span>
                  ))}
                </div>
              </div>
              {regional.regionalCharacteristics && regional.regionalCharacteristics !== 'Analysis pending' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Regional Characteristics</p>
                  <p className={`text-gray-200 leading-relaxed ${textSize}`}>{truncateText(regional.regionalCharacteristics)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const descriptionModal = expandedCopy ? (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={() => setExpandedCopy(null)}
      role="dialog"
      aria-modal="true"
      aria-label={`Expanded ${expandedCopy.title}`}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-950/90 to-indigo-950/90 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-blue-500/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <FaInfoCircle className="text-blue-300" />
            <h3 className="text-sm font-semibold text-blue-200">{expandedCopy.title}</h3>
          </div>
          <button
            type="button"
            onClick={() => setExpandedCopy(null)}
            className="rounded-md px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/40"
            aria-label={`Close ${expandedCopy.title}`}
          >
            Close
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
          <DnaReadableCopy text={expandedCopy.text} className="text-sm text-blue-100" />
        </div>
      </div>
    </div>
  ) : null

  const expandedViewModal = isExpandedView && sonicDNA ? (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={() => setIsExpandedView(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded Sonic DNA view"
    >
      <div
        className="max-h-[85vh] w-full max-w-[1100px] overflow-hidden rounded-xl border border-purple-500/30 bg-gray-950/90 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-purple-500/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <FaBrain className="text-purple-300" />
            <h3 className="text-sm font-semibold text-purple-200">Sonic DNA</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-gray-700/60 bg-gray-900/50 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setViewMode('simple')}
                className={`rounded-full px-2.5 py-0.5 transition ${
                  viewMode === 'simple' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
                }`}
                aria-pressed={viewMode === 'simple'}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setViewMode('deep')}
                className={`rounded-full px-2.5 py-0.5 transition ${
                  viewMode === 'deep' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
                }`}
                aria-pressed={viewMode === 'deep'}
              >
                Deep
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsExpandedView(false)}
              className="rounded-md px-2 py-1 text-xs text-purple-200 hover:bg-purple-900/40"
              aria-label="Close expanded Sonic DNA"
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
          {renderSonicDNASections(sonicDNA, false, viewMode)}
        </div>
      </div>
    </div>
  ) : null

  if (compact) {
    // Compact version for inline display in player
    const shouldShowContent = hideHeader ? true : !isCollapsed
    
    return (
      <div className={hideHeader ? '' : 'mt-3'}>
        {!hideHeader && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 mb-2 w-full text-left hover:opacity-80 transition-opacity"
            aria-label={isCollapsed ? 'Expand Sonic DNA' : 'Collapse Sonic DNA'}
          >
            <FaBrain className="text-purple-400 text-sm" />
            <span className="text-xs font-semibold text-white">Sonic DNA</span>
            {isCollapsed ? (
              <FaChevronDown className="text-gray-400 text-xs ml-auto" />
            ) : (
              <FaChevronUp className="text-gray-400 text-xs ml-auto" />
            )}
          </button>
        )}
        
        {shouldShowContent && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[10px] text-gray-400">Mode</span>
              <div className="inline-flex items-center rounded-full border border-gray-700/60 bg-gray-900/50 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setViewMode('simple')}
                  className={`rounded-full px-2.5 py-1 transition touch-manipulation ${
                    viewMode === 'simple' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                  aria-pressed={viewMode === 'simple'}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('deep')}
                  className={`rounded-full px-2.5 py-1 transition touch-manipulation ${
                    viewMode === 'deep' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                  aria-pressed={viewMode === 'deep'}
                >
                  Deep
                </button>
              </div>
            </div>
            {!sonicDNA && !isLoading && status === 'pending' && !error && emptyState}

            {isLoading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs py-4">
                <FaSpinner className="animate-spin" />
                <span>Loading Sonic DNA...</span>
              </div>
            )}

            {error && (
              <div className="text-red-400 text-xs p-2 bg-red-900/20 rounded mb-2 space-y-2">
                <p>{error}</p>
                {loadFromDatabaseButton}
              </div>
            )}

            {sonicDNA && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700/50">
                <div className={`flex items-center justify-between px-3 pt-3 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                  <span className="text-gray-400">View</span>
                  <button
                    type="button"
                    onClick={() => setIsExpandedView(true)}
                    className="rounded px-2 py-1 text-gray-300 hover:bg-gray-700/60"
                    aria-label="Expand Sonic DNA"
                  >
                    Expand
                  </button>
                </div>
                <div className="p-2.5 sm:p-3 max-h-[min(40dvh,22rem)] sm:max-h-96 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
                  {renderSonicDNASections(sonicDNA, true, viewMode)}
                </div>
              </div>
            )}

          </>
        )}
        {descriptionModal}
        {expandedViewModal}
      </div>
    )
  }

  // Full version
  return (
    <div className="border-t border-gray-800 mt-4 pt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaBrain className="text-purple-400" />
          <span className="font-semibold text-white">Sonic DNA</span>
        </div>
        <div className="inline-flex items-center rounded-full border border-gray-700/60 bg-gray-900/50 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('simple')}
            className={`rounded-full px-3 py-1 transition ${
              viewMode === 'simple' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
            }`}
            aria-pressed={viewMode === 'simple'}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => setViewMode('deep')}
            className={`rounded-full px-3 py-1 transition ${
              viewMode === 'deep' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
            }`}
            aria-pressed={viewMode === 'deep'}
          >
            Deep
          </button>
        </div>
      </div>
      
      {!sonicDNA && !isLoading && status === 'pending' && !error && emptyState}

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 py-4">
          <FaSpinner className="animate-spin" />
          <span>Loading Sonic DNA...</span>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded mb-4 space-y-2">
          <p>{error}</p>
          {loadFromDatabaseButton}
        </div>
      )}

      {sonicDNA && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50">
          <div className="p-4">
            {renderSonicDNASections(sonicDNA, false, viewMode)}
          </div>
        </div>
      )}

      {descriptionModal}
      {expandedViewModal}
    </div>
  )
}
