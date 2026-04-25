'use client'

import { useState, useEffect, useRef } from 'react'
import { FaBrain, FaSpinner, FaHeart, FaMusic, FaHistory, FaGlobe, FaTags, FaInfoCircle, FaChevronDown, FaChevronUp } from 'react-icons/fa'

interface SonicDNAProps {
  trackId: string
  trackFile: string
  trackTitle: string
  artistName: string
  compact?: boolean // For inline display in player
  hideHeader?: boolean // Hide the header when already inside a collapsible container
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
const SONIC_DNA_DATA_VERSION = '20260131-v2'
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
  let normalizedPath = trackFile || ''

  // Extract local path from Supabase URL if it's a full URL
  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    const match = normalizedPath.match(/\/storage\/v1\/object\/public\/audio-files\/(.+)$/)
    if (match) {
      normalizedPath = decodeURIComponent(match[1])
    }
  }

  // Remove leading slashes and audio/ prefix
  if (normalizedPath.startsWith('/audio/')) {
    normalizedPath = normalizedPath.replace('/audio/', '')
  }
  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.substring(1)
  }

  return normalizedPath
}

export default function SonicDNA({ trackId, trackFile, trackTitle, artistName, compact = false, hideHeader = false }: SonicDNAProps) {
  const [sonicDNA, setSonicDNA] = useState<SonicDNAData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [status, setStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [expandedDescription, setExpandedDescription] = useState<string | null>(null)
  const [isExpandedView, setIsExpandedView] = useState(false)
  const [viewMode, setViewMode] = useState<'simple' | 'deep'>('deep')
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedRef = useRef(false)
  const currentTrackRef = useRef<string>(trackFile)
  const statusRef = useRef<'pending' | 'processing' | 'completed' | 'failed'>('pending')

  // Reset when track changes
  useEffect(() => {
    if (currentTrackRef.current !== trackFile) {
      currentTrackRef.current = trackFile
      hasFetchedRef.current = false
      setSonicDNA(null)
      setStatus('pending')
      setError(null)
      // Clear any existing polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [trackFile])

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [])

  // Update status ref when status changes
  useEffect(() => {
    statusRef.current = status
    // Stop polling when status becomes completed or failed
    if ((status === 'completed' || status === 'failed') && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [status])

  useEffect(() => {
    if (!expandedDescription) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedDescription(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedDescription])

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

  // Load cached data on mount if available (but don't auto-trigger analysis)
  useEffect(() => {
    // For compact (collapsible) UI, avoid auto-fetching on mount; fetch on expand instead.
    const shouldAutoFetch = !compact || hideHeader
    if (shouldAutoFetch && !hasFetchedRef.current && !sonicDNA && currentTrackRef.current === trackFile) {
      hasFetchedRef.current = true
      // Only fetch if data might exist (don't trigger new analysis)
      fetchSonicDNA()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackFile]) // Re-fetch if trackFile changes

  // For collapsible compact UI: fetch when expanded (prevents mass background fetches)
  useEffect(() => {
    if (!compact) return
    if (hideHeader) return // hideHeader implies always-visible container; handled above
    if (isCollapsed) return
    if (!hasFetchedRef.current && currentTrackRef.current === trackFile) {
      hasFetchedRef.current = true
      fetchSonicDNA()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, hideHeader, isCollapsed, trackFile])

  const fetchSonicDNA = async () => {
    // Don't fetch if we already have completed data
    if (sonicDNA && status === 'completed') {
      setIsLoading(false)
      // Make sure polling is stopped
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    // Don't fetch if already loading (prevents duplicate requests)
    if (isLoading && status === 'processing' && pollIntervalRef.current) {
      return
    }

    setIsLoading(true)
    setError(null)
    
    try {
      const normalizedPath = normalizeTrackPath(trackFile)
      const cacheKey = normalizedPath

      // Serve from cache if fresh AND same version
      const cached = sonicDNAResponseCache.get(cacheKey)
      if (cached && Date.now() < cached.expiresAt && cached.version === SONIC_DNA_DATA_VERSION) {
        const data = cached.data
        if (data.status === 'completed' && data.sonicDNA) {
          setSonicDNA(data.sonicDNA)
          setStatus('completed')
          setIsLoading(false)
          setError(null)
          return
        }
      }

      // Deduplicate in-flight requests across instances
      let promise = sonicDNAInFlight.get(cacheKey)
      if (!promise) {
        // Add cache buster to force fresh data after enhancement
        const cacheBuster = 'v=20260130'
        promise = fetch(`/api/audio/sonic-dna?path=${encodeURIComponent(normalizedPath)}&${cacheBuster}`, {
          signal: AbortSignal.timeout(10000), // 10 second timeout
          cache: 'no-cache', // Force fresh data from server
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
              throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`)
            }
            return await response.json()
          })
          .finally(() => {
            sonicDNAInFlight.delete(cacheKey)
          })
        sonicDNAInFlight.set(cacheKey, promise)
      }

      const data = await promise

      // Cache successful payloads briefly (even pending/processing) to avoid tight re-fetch loops
      sonicDNAResponseCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + SONIC_DNA_TTL_MS,
        version: SONIC_DNA_DATA_VERSION,
      })
      
      if (data.error) {
        setError(data.details || data.error)
        setStatus('failed')
        setIsLoading(false)
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        return
      }
      
      if (data.status === 'completed' && data.sonicDNA) {
        setSonicDNA(data.sonicDNA)
        setStatus('completed')
        setIsLoading(false)
        setError(null)
        hasFetchedRef.current = true
        // Stop polling immediately
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        return // Exit early - data is loaded, no need to continue
      } else if (data.status === 'processing') {
        setStatus('processing')
        setIsLoading(true)
        setError('Analysis is in progress. Please wait...')
        // Start polling if not already polling
        if (!pollIntervalRef.current) {
          let pollCount = 0
          const maxPolls = 60 // 60 polls * 3 seconds = 3 minutes max
          pollIntervalRef.current = setInterval(() => {
            pollCount++
            // Check status ref (always current) before fetching
            if (statusRef.current === 'completed' || statusRef.current === 'failed') {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
              return
            }
            // Stop polling after max attempts
            if (pollCount >= maxPolls) {
              setError('Analysis is taking longer than expected. Please try refreshing or check if the analysis is still running.')
              setStatus('failed')
              setIsLoading(false)
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
              return
            }
            // Only fetch if still processing
            if (statusRef.current === 'processing') {
              fetchSonicDNA()
            }
          }, 3000)
        }
      } else if (data.status === 'failed') {
        setError(data.error || data.message || 'Analysis failed')
        setStatus('failed')
        setIsLoading(false)
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else if (data.status === 'not_found') {
        setError(data.details || 'Track not found in database')
        setStatus('failed')
        setIsLoading(false)
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else if (data.status === 'pending') {
        // If pending, just show that no analysis exists yet (don't auto-trigger)
        // User can manually trigger analysis if they want deeper analysis
        setStatus('pending')
        setIsLoading(false)
        setError(null)
        setSonicDNA(null)
        hasFetchedRef.current = true
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else {
        // No data available
        setStatus('pending')
        setError(null) // Don't show error, just no data available
        setIsLoading(false)
        setSonicDNA(null)
        hasFetchedRef.current = true
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      }
    } catch (err: any) {
      console.error('Sonic DNA fetch error:', err)
      // Handle network errors, timeouts, and other fetch errors
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        setError('Request timed out. Please check your connection and try again.')
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setError('Network error. Please check your connection and Supabase configuration.')
      } else {
        setError(err.message || 'Failed to fetch Sonic DNA analysis')
      }
      setStatus('failed')
      setIsLoading(false)
      // Stop polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }

  const triggerAnalysis = async () => {
    setIsLoading(true)
    setError(null)
    setStatus('processing')
    
    try {
      // Normalize the file path - extract from Supabase URL if needed
      const normalizedPath = normalizeTrackPath(trackFile)
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Triggering comprehensive analysis for:', normalizedPath)
      }
      const response = await fetch(`/api/audio/sonic-dna?path=${encodeURIComponent(normalizedPath)}`, {
        method: 'POST'
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (process.env.NODE_ENV === 'development') {
        console.log('Analysis triggered:', data)
      }
      
      if (data.status === 'processing') {
        setStatus('processing')
        setIsLoading(true)
        setError('Comprehensive analysis started. This may take a few moments. Please wait...')
        // Start polling after a short delay
        setTimeout(() => {
          if (!pollIntervalRef.current && statusRef.current === 'processing') {
            fetchSonicDNA()
          }
        }, 2000)
      } else if (data.status === 'completed' && data.hasComprehensive) {
        // Already has comprehensive analysis
        setStatus('completed')
        setIsLoading(false)
        // Fetch the existing data
        fetchSonicDNA()
      } else {
        setError(data.message || 'Failed to start analysis')
        setStatus('failed')
        setIsLoading(false)
      }
    } catch (err: any) {
      console.error('Analysis trigger error:', err)
      setError(err.message || 'Failed to trigger analysis')
      setStatus('failed')
      setIsLoading(false)
    }
  }

  // Check if current Sonic DNA has comprehensive analysis
  const hasComprehensiveAnalysis = sonicDNA && typeof sonicDNA === 'object' && 'comprehensive' in sonicDNA

  // Render Sonic DNA sections with beautiful styling
  const renderSonicDNASections = (dna: SonicDNAData, isCompact: boolean = false, mode: 'simple' | 'deep' = 'deep') => {
    const textSize = isCompact ? 'text-xs' : 'text-sm'
    const padding = isCompact ? 'p-2.5' : 'p-4'
    const sectionGap = isCompact ? 'mb-2.5' : 'mb-4'
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
    
    // Extract description, intention, summary from multiple sources
    const description = dna.description || comprehensive?.description || musicology?.description || ''
    const intention = dna.intention || comprehensive?.intention || ''
    const summary = dna.summary || comprehensive?.summary || ''
    const descriptionText = truncateText(description)
    const intentionText = truncateText(intention)
    const summaryText = truncateText(summary)
    
    // Create merged dna object for rendering
    const mergedDna = {
      ...dna,
      description,
      intention,
      summary,
      emotional,
      genres,
      historical,
      regional,
    }
    
    return (
      <div className="space-y-3">
        {/* Track Description */}
        {description && (
          <div
            className={`bg-gradient-to-br from-blue-900/20 to-indigo-900/20 rounded-lg ${padding} border border-blue-500/20 ${sectionGap} cursor-zoom-in`}
            onDoubleClick={() => setExpandedDescription(description)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setExpandedDescription(description)
              }
            }}
            role="button"
            tabIndex={0}
            title="Double-click to expand"
            aria-label="Expand track description"
          >
            <div className="flex items-center gap-2 mb-3">
              <FaInfoCircle className="text-blue-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-blue-300 ${textSize}`}>Track Description</h3>
            </div>
            <p className={`text-blue-200 ${textSize} leading-relaxed pl-5`}>{descriptionText}</p>
          </div>
        )}

        {/* Intention */}
        {intention && (
          <div className={`bg-gradient-to-br from-pink-900/20 to-rose-900/20 rounded-lg ${padding} border border-pink-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHeart className="text-pink-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-pink-300 ${textSize}`}>Intention</h3>
            </div>
            <p className={`text-pink-200 ${textSize} leading-relaxed pl-5`}>{intentionText}</p>
          </div>
        )}

        {/* Summary */}
        {summary && summary !== 'Analysis pending' && (
          <div className={`bg-gradient-to-br from-purple-900/30 via-blue-900/20 to-purple-800/20 rounded-lg ${padding} border border-purple-500/20 ${sectionGap}`}>
            <div className="flex items-start gap-2 mb-2">
              <FaInfoCircle className="text-purple-400 flex-shrink-0 mt-0.5" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-purple-300 ${textSize}`}>Summary</h3>
            </div>
            <p className={`text-gray-200 leading-relaxed ${textSize} pl-5`}>{summaryText}</p>
          </div>
        )}

        {/* Technical Analysis */}
        {technical && (technical.bpm || technical.key) && (
          <div className={`bg-gradient-to-br from-cyan-900/20 to-teal-900/20 rounded-lg ${padding} border border-cyan-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaMusic className="text-cyan-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-cyan-300 ${textSize}`}>Technical Analysis</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 pl-5">
              {technical.bpm && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>BPM</p>
                  <p className={`text-cyan-200 font-bold ${textSize}`}>{technical.bpm}</p>
                </div>
              )}
              {technical.key && technical.key.key !== 'Unknown' && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Key</p>
                  <p className={`text-cyan-200 font-bold ${textSize}`}>
                    {technical.key.key} {technical.key.mode || ''}
                  </p>
                </div>
              )}
              {technical.key?.scale && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Scale</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>{technical.key.scale}</p>
                </div>
              )}
              {technical.timeSignature && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Time Signature</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>{technical.timeSignature}</p>
                </div>
              )}
              {technical.danceability !== undefined && (
                <div>
                  <p className={`text-gray-400 mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Danceability</p>
                  <p className={`text-cyan-200 font-medium ${textSize}`}>
                    {Math.round(technical.danceability * 100)}%
                  </p>
                </div>
              )}
            </div>
            {technical.technicalDescription && (
              <div className="mt-3 pl-5">
                <p className={`text-cyan-200 ${textSize} leading-relaxed`}>{truncateText(technical.technicalDescription)}</p>
              </div>
            )}
          </div>
        )}

        {/* Drum Pattern Analysis */}
        {isDeep && ((drums && drums.pattern) || (dna.drums && (dna.drums.patternType || dna.drums.genreStyles))) ? (
          <div className={`bg-gradient-to-br from-orange-900/20 to-red-900/20 rounded-lg ${padding} border border-orange-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaMusic className="text-orange-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-orange-300 ${textSize}`}>Drum Pattern</h3>
            </div>
            <div className="space-y-2 pl-5">
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
            <div className="space-y-2 pl-5">
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
        {isDeep && musicbrainz && (musicbrainz.artistInfo || musicbrainz.artistId) && (
          <div className={`bg-gradient-to-br from-emerald-900/20 to-green-900/20 rounded-lg ${padding} border border-emerald-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaGlobe className="text-emerald-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-emerald-300 ${textSize}`}>MusicBrainz Data</h3>
            </div>
            <div className="space-y-2 pl-5">
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
        {isDeep && musicology && (
          <div className={`bg-gradient-to-br from-violet-900/20 to-purple-900/20 rounded-lg ${padding} border border-violet-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHistory className="text-violet-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-violet-300 ${textSize}`}>Musicology</h3>
            </div>
            <div className="space-y-2.5 pl-5">
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
        {isDeep && comprehensive?.cultural && (
          <div className={`bg-gradient-to-br from-teal-900/20 to-cyan-900/20 rounded-lg ${padding} border border-teal-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaGlobe className="text-teal-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-teal-300 ${textSize}`}>Cultural Analysis</h3>
            </div>
            <div className="space-y-2.5 pl-5">
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
            <div className="space-y-2.5 pl-5">
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
            <div className="space-y-2 pl-5">
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
            <div className="space-y-2.5 pl-5">
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
        {isDeep && historical && Array.isArray(historical.eraInfluences) && historical.eraInfluences.length > 0 && (
          <div className={`bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-lg ${padding} border border-amber-500/20 ${sectionGap}`}>
            <div className="flex items-center gap-2 mb-3">
              <FaHistory className="text-amber-400" style={{ fontSize: isCompact ? '0.75rem' : '0.875rem' }} />
              <h3 className={`font-bold text-amber-300 ${textSize}`}>Historical Context</h3>
            </div>
            <div className="space-y-2.5 pl-5">
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
            <div className="space-y-2.5 pl-5">
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

  const descriptionModal = expandedDescription ? (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={() => setExpandedDescription(null)}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded track description"
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-950/90 to-indigo-950/90 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-blue-500/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <FaInfoCircle className="text-blue-300" />
            <h3 className="text-sm font-semibold text-blue-200">Track Description</h3>
          </div>
          <button
            type="button"
            onClick={() => setExpandedDescription(null)}
            className="rounded-md px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/40"
            aria-label="Close description"
          >
            Close
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
          <p className="text-sm leading-relaxed text-blue-100">{expandedDescription}</p>
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
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-400">Mode</span>
              <div className="inline-flex items-center rounded-full border border-gray-700/60 bg-gray-900/50 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setViewMode('simple')}
                  className={`rounded-full px-2 py-0.5 transition ${
                    viewMode === 'simple' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                  aria-pressed={viewMode === 'simple'}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('deep')}
                  className={`rounded-full px-2 py-0.5 transition ${
                    viewMode === 'deep' ? 'bg-gray-200 text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                  aria-pressed={viewMode === 'deep'}
                >
                  Deep
                </button>
              </div>
            </div>
            {!sonicDNA && !isLoading && status !== 'processing' && (
              <button
                onClick={() => triggerAnalysis()}
                disabled={isLoading}
                className="w-full px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    <span>Starting Analysis...</span>
                  </>
                ) : (
                  <span>Generate Sonic DNA Analysis</span>
                )}
              </button>
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs py-4">
                <FaSpinner className="animate-spin" />
                <span>Loading Sonic DNA...</span>
              </div>
            )}

            {error && (
              <div className="text-red-400 text-xs p-2 bg-red-900/20 rounded mb-2">
                <p>{error}</p>
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
                <div className="p-3 max-h-96 overflow-y-auto">
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
      
      {!sonicDNA && !isLoading && status !== 'processing' && (
        <button
          onClick={() => triggerAnalysis()}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <FaSpinner className="animate-spin" />
              <span>Starting Analysis...</span>
            </>
          ) : (
            <span>Generate Sonic DNA Analysis</span>
          )}
        </button>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 py-4">
          <FaSpinner className="animate-spin" />
          <span>Loading Sonic DNA...</span>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded mb-4">
          <p>{error}</p>
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
