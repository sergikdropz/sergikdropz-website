'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  FaEdit,
  FaSave,
  FaTimes,
  FaSearch,
  FaSync,
  FaFilter,
  FaDownload,
  FaChevronDown,
  FaChevronUp,
  FaChevronRight,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaSpinner,
  FaChartBar,
  FaMusic,
  FaHeart,
  FaHistory,
  FaGlobe,
  FaTags,
  FaCog,
  FaTrash,
  FaPlus,
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeMute,
  FaSort,
  FaSortAlphaDown,
  FaSortAlphaUp,
  FaSortNumericDown,
  FaSortNumericUp,
  FaColumns,
  FaTable,
  FaList,
  FaTh,
  FaBookmark,
  FaBookmark as FaBookmarkSolid,
  FaFileExport,
  FaCheckSquare,
  FaSquare,
  FaEllipsisV,
  FaChartPie,
  FaChartLine,
  FaSlidersH,
  FaKeyboard,
  FaInfoCircle,
  FaExclamationTriangle,
  FaCopy,
  FaUndo,
  FaRedo,
} from 'react-icons/fa'
import { 
  BpmBadge, 
  KeyBadge, 
  EnergyBadge, 
  DnaMatchBadge,
  DnaMatchScoreBadge,
  MoodBadge,
  SubgenreBadge,
  DrumStyleBadge,
  ProductionEraBadge,
  MixingRecommendations,
  TrackDescription,
  InstrumentSignatures,
  GenreBadge,
  EnhancedTrackBadgesRow
} from '@/components/music/MusicBadges'
import { useBpmProfile, useKeyProfile, useDnaMatch } from '@/hooks/use-sergik-data'
import { GenreAnalyzer, extractCharacteristicsFromSonicDna } from '@/utils/genreAnalyzer'

// SERGIK DNA defaults for missing data (based on knowledge base)
const SERGIK_DEFAULTS = {
  genre: 'House',
  subgenre: 'Tech House',
  drumStyle: '4-on-the-floor',
  timeSignature: '4/4',
  key: '10B', // D Major - SERGIK's primary key (31%)
  scale: 'Major',
  bpm: 125,
  energy: 6,
  danceability: 7,
}

// Extract drum pattern info from sonic_dna for pattern recognition
const extractDrumPatternInfo = (track: any): { kickPattern?: string; hatPattern?: string; snarePattern?: string; swing?: number } => {
  if (!track.sonic_dna) return {}
  try {
    const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
    return {
      kickPattern: dna?.drums?.kickPattern || dna?.drums?.patternType || dna?.comprehensive?.drums?.kickPattern,
      hatPattern: dna?.drums?.hihatPattern || dna?.drums?.hatStyle || dna?.comprehensive?.drums?.hihatPattern,
      snarePattern: dna?.drums?.snarePattern || dna?.drums?.snareStyle,
      swing: dna?.drums?.swing || dna?.drums?.groove?.swing,
    }
  } catch {
    return {}
  }
}

// Infer genre from BPM AND drum pattern recognition
const inferGenreFromPatterns = (bpm: number | undefined, drumInfo: { kickPattern?: string; hatPattern?: string; snarePattern?: string; swing?: number }): string => {
  const { kickPattern, hatPattern, snarePattern, swing } = drumInfo
  const bpmVal = bpm || SERGIK_DEFAULTS.bpm
  
  // Pattern-based detection (prioritize over BPM alone)
  if (kickPattern || hatPattern || snarePattern) {
    const kick = (kickPattern || '').toLowerCase()
    const hat = (hatPattern || '').toLowerCase()
    const snare = (snarePattern || '').toLowerCase()
    
    // Trap detection: 808s + triplet hi-hats
    if (kick.includes('808') || hat.includes('triplet') || hat.includes('roll')) {
      if (bpmVal >= 130) return 'Trap'
    }
    
    // Boom Bap detection: swing + classic patterns
    if (kick.includes('boom') || kick.includes('bap') || (swing && swing > 50)) {
      if (bpmVal >= 80 && bpmVal <= 100) return 'Hip-Hop'
    }
    
    // House detection: 4-on-the-floor + offbeat hats
    if (kick.includes('4-on-the-floor') || kick.includes('four') || kick.includes('four-to-the-floor')) {
      if (hat.includes('offbeat') || hat.includes('open')) {
        if (bpmVal >= 118 && bpmVal <= 132) return 'House'
      }
      if (hat.includes('rolling') || hat.includes('16th')) {
        if (bpmVal >= 122 && bpmVal <= 130) return 'Tech House'
      }
      if (hat.includes('disco') || hat.includes('open')) {
        if (bpmVal >= 115 && bpmVal <= 130) return 'Disco'
      }
    }
    
    // Funk detection: syncopated patterns
    if (kick.includes('syncopat') || kick.includes('funk') || snare.includes('ghost')) {
      if (bpmVal >= 95 && bpmVal <= 115) return 'Funk'
    }
    
    // Breakbeat/DnB detection
    if (kick.includes('break') || kick.includes('chop') || hat.includes('break')) {
      if (bpmVal >= 160) return 'Drum & Bass'
      if (bpmVal >= 130) return 'Breakbeat'
    }
    
    // Reggaeton/Dembow detection
    if (kick.includes('dembow') || snare.includes('dembow')) {
      return 'Reggaeton'
    }
    
    // Techno detection: driving, minimal patterns
    if (kick.includes('minimal') || kick.includes('driving') || hat.includes('driving')) {
      if (bpmVal >= 128 && bpmVal <= 145) return 'Techno'
    }
    
    // Lo-fi detection: dusty, tape-like
    if (hat.includes('dusty') || hat.includes('lofi') || hat.includes('lo-fi')) {
      return 'Lo-Fi'
    }
  }
  
  // BPM-based fallback with SERGIK genre DNA distribution
  if (bpmVal < 85) return 'Hip-Hop'
  if (bpmVal >= 85 && bpmVal < 95) {
    return swing && swing > 40 ? 'Hip-Hop' : 'Lo-Fi'
  }
  if (bpmVal >= 95 && bpmVal < 108) return 'Funk'
  if (bpmVal >= 108 && bpmVal < 118) return 'Disco'
  if (bpmVal >= 118 && bpmVal < 126) return 'House'
  if (bpmVal >= 126 && bpmVal < 132) return 'Tech House'
  if (bpmVal >= 132 && bpmVal < 145) return 'Techno'
  if (bpmVal >= 145 && bpmVal < 165) return 'Trance'
  if (bpmVal >= 165) return 'Drum & Bass'
  
  return SERGIK_DEFAULTS.genre
}

// Infer energy from BPM and patterns
const inferEnergyFromBpm = (bpm: number | undefined): number => {
  if (!bpm) return SERGIK_DEFAULTS.energy
  if (bpm < 90) return 4
  if (bpm >= 90 && bpm < 110) return 5
  if (bpm >= 110 && bpm < 125) return 6
  if (bpm >= 125 && bpm < 135) return 7
  return 8
}

// Infer key from BPM and genre (house = major, hip-hop = minor)
const inferKeyFromBpm = (bpm: number | undefined): string => {
  if (!bpm) return SERGIK_DEFAULTS.key
  if (bpm < 100) return '7A' // D minor for hip-hop/downtempo
  return SERGIK_DEFAULTS.key // 10B for house
}

type StatusFilter = 'all' | 'completed' | 'processing' | 'pending'
type SortField = 'default' | 'title' | 'artist' | 'bpm' | 'status' | 'updated' | 'genre' | 'key' | 'energy' | 'danceability'
type SortDirection = 'asc' | 'desc'
type ViewMode = 'list' | 'table' | 'grid'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface AdvancedFilters {
  bpmMin: number | null
  bpmMax: number | null
  energyMin: number | null
  energyMax: number | null
  danceabilityMin: number | null
  danceabilityMax: number | null
  genres: string[]
  keys: string[]
  hasDescription: boolean | null
  hasEmotional: boolean | null
  hasHistorical: boolean | null
  dateFrom: string
  dateTo: string
}

interface SortConfig {
  primary: SortField
  secondary: SortField | null
  tertiary: SortField | null
  direction: SortDirection
}

interface FilterPreset {
  id: string
  name: string
  filters: AdvancedFilters
  sortConfig: SortConfig
  statusFilter: StatusFilter
}

interface TrackTag {
  id: string
  name: string
  color: string
}

interface TrackWithTags {
  tags?: string[]
  [key: string]: any
}

export default function AdminSonicDNA() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [tracks, setTracks] = useState<any[]>([])
  const [loadingTracks, setLoadingTracks] = useState(true)
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [autofillingField, setAutofillingField] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [bulkAutofillProgress, setBulkAutofillProgress] = useState<{
    isRunning: boolean
    current: number
    total: number
    completed: number
    failed: number
  } | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<any>(null)
  const [editingDNA, setEditingDNA] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [advancedSearch, setAdvancedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    primary: 'default',
    secondary: null,
    tertiary: null,
    direction: 'asc',
  })
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [contextMenuTrack, setContextMenuTrack] = useState<any>(null)
  const [isTextareaContextMenuOpen, setIsTextareaContextMenuOpen] = useState(false)
  const [textareaContextMenuPosition, setTextareaContextMenuPosition] = useState({ x: 0, y: 0 })
  const [textareaContextMenuFieldPath, setTextareaContextMenuFieldPath] = useState<string[] | null>(null)
  const textareaContextMenuRef = useRef<HTMLDivElement>(null)
  const [visibleColumns, setVisibleColumns] = useState({
    bpm: true,
    genre: true,
    key: true,
    energy: true,
    danceability: true,
    status: true,
    tags: true,
    quality: true,
    completeness: true,
  })
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    bpmMin: null,
    bpmMax: null,
    energyMin: null,
    energyMax: null,
    danceabilityMin: null,
    danceabilityMax: null,
    genres: [],
    keys: [],
    hasDescription: null,
    hasEmotional: null,
    hasHistorical: null,
    dateFrom: '',
    dateTo: '',
  })
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([])
  const [trackTags, setTrackTags] = useState<Map<string, string[]>>(new Map())
  const [availableTags, setAvailableTags] = useState<TrackTag[]>([])
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [focusedTrackIndex, setFocusedTrackIndex] = useState<number | null>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const filterMenuRef = useRef<HTMLDivElement>(null)
  const presetMenuRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']))
  const [toasts, setToasts] = useState<Toast[]>([])
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set())
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchTracks()
      fetchAgentStatus()
      loadPreferences()
      loadPresets()
      loadTags()
    }
  }, [isAdmin])

  // Load preferences from localStorage
  function loadPreferences() {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('sonic-dna-preferences')
      if (saved) {
        const prefs = JSON.parse(saved)
        if (prefs.sortConfig) setSortConfig(prefs.sortConfig)
        if (prefs.viewMode) setViewMode(prefs.viewMode)
        if (prefs.visibleColumns) setVisibleColumns(prefs.visibleColumns)
        if (prefs.advancedFilters) setAdvancedFilters(prefs.advancedFilters)
        if (prefs.statusFilter) setStatusFilter(prefs.statusFilter)
      }
    } catch (e) {
      console.error('Error loading preferences:', e)
    }
  }

  // Save preferences to localStorage
  function savePreferences() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(
        'sonic-dna-preferences',
        JSON.stringify({
          sortConfig,
          viewMode,
          visibleColumns,
          advancedFilters,
          statusFilter,
        })
      )
    } catch (e) {
      console.error('Error saving preferences:', e)
    }
  }

  // Load saved filter presets
  function loadPresets() {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('sonic-dna-presets')
      if (saved) {
        setFilterPresets(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Error loading presets:', e)
    }
  }

  // Save filter presets
  function savePresets() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('sonic-dna-presets', JSON.stringify(filterPresets))
    } catch (e) {
      console.error('Error saving presets:', e)
    }
  }

  // Load track tags
  function loadTags() {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('sonic-dna-tags')
      if (saved) {
        setTrackTags(new Map(JSON.parse(saved)))
      }
      const savedAvailable = localStorage.getItem('sonic-dna-available-tags')
      if (savedAvailable) {
        setAvailableTags(JSON.parse(savedAvailable))
      }
    } catch (e) {
      console.error('Error loading tags:', e)
    }
  }

  // Save track tags
  function saveTags() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('sonic-dna-tags', JSON.stringify(Array.from(trackTags.entries())))
      localStorage.setItem('sonic-dna-available-tags', JSON.stringify(availableTags))
    } catch (e) {
      console.error('Error saving tags:', e)
    }
  }

  // Save preferences when they change
  useEffect(() => {
    if (isAdmin) {
      savePreferences()
    }
  }, [sortConfig, viewMode, visibleColumns, advancedFilters, statusFilter, isAdmin])

  // Save tags when they change
  useEffect(() => {
    if (isAdmin && trackTags.size > 0) {
      saveTags()
    }
  }, [trackTags, availableTags, isAdmin])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchTracks()
        fetchAgentStatus()
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  // Clean up audio when track changes
  useEffect(() => {
    if (!selectedTrack) {
      setIsPlaying(false)
      setAudioUrl(null)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [selectedTrack])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  async function fetchTracks() {
    try {
      setLoadingTracks(true)
      // Keep the list query lightweight; fetch full Sonic DNA only when a track is opened/edited.
      const response = await fetch('/api/audio/list?limit=500&include_count=true')
      const data = await response.json()
      setTracks(data.files || [])
    } catch (error) {
      console.error('Error fetching tracks:', error)
      showToast('Failed to fetch tracks', 'error')
    } finally {
      setLoadingTracks(false)
    }
  }

  async function fetchAgentStatus() {
    try {
      const response = await fetch('/api/audio/agent-status')
      const data = await response.json()
      setAgentStatus(data)
    } catch (error) {
      console.error('Error fetching agent status:', error)
    }
  }

  async function handleAnalyzeAll() {
    if (!confirm('This will analyze all tracks. This may take a while. Continue?')) return

    setAnalyzing(true)
    try {
      const response = await fetch('/api/audio/analyze-all-sonic-dna?force=true', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        showToast('Analysis started! This may take a while.', 'info')
        setAutoRefresh(true)
        fetchTracks()
      } else {
        showToast('Analysis failed: ' + data.error, 'error')
      }
    } catch (error: any) {
      showToast('Analysis error: ' + error.message, 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleRegenerateAll() {
    if (!confirm('This will regenerate Sonic DNA for all tracks. Continue?')) return

    setRegenerating(true)
    try {
      const response = await fetch('/api/audio/regenerate-all-sonic-dna-agents', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.success) {
        showToast('Regeneration started! This may take a while.', 'info')
        setAutoRefresh(true)
        fetchTracks()
      } else {
        showToast('Regeneration failed: ' + data.error, 'error')
      }
    } catch (error: any) {
      showToast('Regeneration error: ' + error.message, 'error')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleRegenerateTrack(trackId: string) {
    try {
      const response = await fetch(
        `/api/audio/sonic-dna-agents?trackId=${trackId}&force=true`,
        { method: 'POST' }
      )
      const data = await response.json()
      if (response.ok) {
        showToast('Track regenerated successfully!', 'success')
        fetchTracks()
        if (selectedTrack?.id === trackId) {
          handleEditTrack(trackId)
        }
      } else {
        showToast('Regeneration failed: ' + data.error, 'error')
      }
    } catch (error: any) {
      showToast('Regeneration error: ' + error.message, 'error')
    }
  }

  async function handleBulkRegenerate() {
    if (selectedTracks.size === 0) {
      showToast('Please select tracks to regenerate', 'info')
      return
    }
    if (!confirm(`Regenerate Sonic DNA for ${selectedTracks.size} selected tracks?`)) return

    try {
      let success = 0
      let failed = 0
      for (const trackId of Array.from(selectedTracks)) {
        try {
          const response = await fetch(
            `/api/audio/sonic-dna-agents?trackId=${trackId}&force=true`,
            { method: 'POST' }
          )
          if (response.ok) {
            success++
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }
      showToast(`Regenerated ${success} tracks. ${failed} failed.`, success > 0 ? 'success' : 'error')
      setSelectedTracks(new Set())
      fetchTracks()
    } catch (error: any) {
      showToast('Bulk regeneration error: ' + error.message, 'error')
    }
  }

  async function handleBulkAutofill() {
    if (selectedTracks.size === 0) {
      showToast('Please select tracks to autofill', 'info')
      return
    }
    if (!confirm(`Analyze and autofill ${selectedTracks.size} selected tracks? This may take a while.`)) return

    const trackIds = Array.from(selectedTracks)
    setBulkAutofillProgress({
      isRunning: true,
      current: 0,
      total: trackIds.length,
      completed: 0,
      failed: 0,
    })

    try {
      for (let i = 0; i < trackIds.length; i++) {
        const trackId = trackIds[i]
        setBulkAutofillProgress((prev) =>
          prev
            ? {
                ...prev,
                current: i + 1,
              }
            : null
        )

        try {
          const response = await fetch(`/api/audio/sonic-dna-agents?trackId=${trackId}&force=true`, {
            method: 'POST',
          })

          if (response.ok) {
            setBulkAutofillProgress((prev) =>
              prev
                ? {
                    ...prev,
                    completed: prev.completed + 1,
                  }
                : null
            )
          } else {
            setBulkAutofillProgress((prev) =>
              prev
                ? {
                    ...prev,
                    failed: prev.failed + 1,
                  }
                : null
            )
          }
        } catch (error) {
          setBulkAutofillProgress((prev) =>
            prev
              ? {
                  ...prev,
                  failed: prev.failed + 1,
                }
              : null
          )
        }

        // Small delay between requests to avoid overwhelming the server
        if (i < trackIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      // Get final progress before resetting
      const finalCompleted = bulkAutofillProgress?.completed || 0
      const finalFailed = bulkAutofillProgress?.failed || 0
      
      setBulkAutofillProgress((prev) => (prev ? { ...prev, isRunning: false } : null))
      fetchTracks()
      
      // Small delay to ensure state is updated
      setTimeout(() => {
        showToast(
          `Bulk autofill complete: ${finalCompleted} succeeded, ${finalFailed} failed`,
          finalCompleted > 0 ? 'success' : 'error'
        )
      }, 100)
    } catch (error: any) {
      setBulkAutofillProgress(null)
      showToast('Bulk autofill error: ' + error.message, 'error')
    }
  }

  async function handleEditTrack(trackId: string) {
    try {
      const response = await fetch(`/api/admin/sonic-dna/${trackId}`)
      const data = await response.json()
      
      if (!response.ok) {
        const errorMessage = data.error || `Failed to load track (${response.status})`
        console.error('Error loading track:', errorMessage, data)
        
        if (response.status === 404) {
          showToast('Track not found. It may have been deleted.', 'error')
        } else if (response.status === 401) {
          showToast('Unauthorized. Please log in again.', 'error')
        } else {
          showToast(errorMessage, 'error')
        }
        return
      }

      if (!data.track) {
        showToast('Track data is missing', 'error')
        return
      }

      setSelectedTrack(data.track)
      setEditingDNA(JSON.parse(JSON.stringify(data.track.sonic_dna || {})))
      setActiveTab('read-report')
      setExpandedSections(new Set(['read-report']))
      
      // Load audio URL for the track
      await loadAudioUrl(data.track)
    } catch (error: any) {
      console.error('Error loading track:', error)
      showToast('Error loading track: ' + (error.message || 'Network error'), 'error')
    }
  }

  async function loadAudioUrl(track: any) {
    if (!track) {
      setAudioUrl(null)
      return
    }

    setIsLoadingAudio(true)
    try {
      // Try to get file_url or file_path from track
      const filePath = track.file_url || track.file_path || track.file_name
      if (!filePath) {
        setAudioUrl(null)
        setIsLoadingAudio(false)
        return
      }

      // If it's already a full URL, use it directly
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        setAudioUrl(filePath)
        setIsLoadingAudio(false)
        return
      }

      // Otherwise, resolve it through the API
      const response = await fetch(`/api/audio/resolve?path=${encodeURIComponent(filePath)}`)
      if (response.ok) {
        const data = await response.json()
        setAudioUrl(data.url || filePath)
      } else {
        // Fallback to the path as-is
        setAudioUrl(filePath)
      }
    } catch (error) {
      console.error('Error loading audio URL:', error)
      setAudioUrl(null)
    } finally {
      setIsLoadingAudio(false)
    }
  }

  // Audio player controls
  useEffect(() => {
    const audio = audioElementRef.current
    if (!audio || !audioUrl) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration || 0)
    const handleEnded = () => setIsPlaying(false)
    const handleError = () => {
      setIsPlaying(false)
      showToast('Error playing audio track', 'error')
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [audioUrl, showToast])

  useEffect(() => {
    const audio = audioElementRef.current
    if (!audio) return

    if (isPlaying) {
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Play error:', err)
          setIsPlaying(false)
        }
      })
    } else {
      audio.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    const audio = audioElementRef.current
    if (!audio) return
    audio.volume = isMuted ? 0 : volume
  }, [volume, isMuted])

  function togglePlay() {
    if (!audioUrl) {
      showToast('No audio available for this track', 'info')
      return
    }
    setIsPlaying(!isPlaying)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioElementRef.current
    if (!audio) return
    const newTime = parseFloat(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (newVolume > 0) {
      setIsMuted(false)
    }
  }

  function toggleMute() {
    setIsMuted(!isMuted)
  }

  function formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function handleSaveDNA() {
    if (!selectedTrack || !editingDNA) return

    setSaving(true)
    try {
      const response = await fetch(`/api/admin/sonic-dna/${selectedTrack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sonic_dna: editingDNA }),
      })

      const data = await response.json()
      if (response.ok) {
        showToast('Sonic DNA saved successfully!', 'success')
        setSelectedTrack({ ...selectedTrack, sonic_dna: editingDNA })
        fetchTracks()
      } else {
        showToast('Save failed: ' + data.error, 'error')
      }
    } catch (error: any) {
      showToast('Save error: ' + error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Deep merge helper function
  function deepMerge(target: any, source: any): any {
    const output = { ...target }
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] })
          } else {
            output[key] = deepMerge(target[key], source[key])
          }
        } else {
          // Prioritize source value (new analysis data)
          if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
            output[key] = source[key]
          } else if (target[key] !== undefined) {
            output[key] = target[key]
          }
        }
      })
    }
    return output
  }

  function isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item)
  }

  async function handleAnalyzeAndAutofill() {
    if (!selectedTrack) {
      showToast('No track selected', 'error')
      return
    }

    setAnalyzing(true)
    try {
      showToast('Starting analysis...', 'info')
      
      const response = await fetch(`/api/audio/sonic-dna-agents?trackId=${selectedTrack.id}&force=true`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`
        showToast(`Analysis failed: ${errorMessage}`, 'error')
        console.error('Analysis failed:', { status: response.status, error: errorData })
        return
      }

      const data = await response.json()
      
      if (data.sonicDNA) {
        // Deep merge the analyzed DNA with the current editing DNA
        // Prioritize new analysis data over existing data
        setEditingDNA((prev: any) => {
          const merged = deepMerge(prev || {}, data.sonicDNA)
          // Ensure all top-level fields are filled from analysis
          return {
            ...merged,
            description: data.sonicDNA.description ?? merged.description ?? '',
            intention: data.sonicDNA.intention ?? merged.intention ?? '',
            emotional: deepMerge(merged.emotional || {}, data.sonicDNA.emotional || {}),
            musical: deepMerge(merged.musical || {}, data.sonicDNA.musical || {}),
            technical: deepMerge(merged.technical || {}, data.sonicDNA.technical || {}),
            drums: deepMerge(merged.drums || {}, data.sonicDNA.drums || {}),
            harmony: deepMerge(merged.harmony || {}, data.sonicDNA.harmony || {}),
            genres: deepMerge(merged.genres || {}, data.sonicDNA.genres || {}),
            historical: deepMerge(merged.historical || {}, data.sonicDNA.historical || {}),
            regional: deepMerge(merged.regional || {}, data.sonicDNA.regional || {}),
            musicology: deepMerge(merged.musicology || {}, data.sonicDNA.musicology || {}),
            cultural: deepMerge(merged.cultural || {}, data.sonicDNA.cultural || {}),
            summary: data.sonicDNA.summary ?? merged.summary ?? '',
          }
        })
        showToast('Analysis complete! All fields have been autofilled.', 'success')
      } else {
        showToast('Analysis completed but no data returned', 'error')
        console.error('No sonicDNA in response:', data)
      }
    } catch (error: any) {
      showToast(`Analysis error: ${error.message}`, 'error')
      console.error('Analysis error:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleAutofillField(fieldPath: string[]) {
    if (!selectedTrack) {
      showToast('No track selected', 'error')
      return
    }

    if (!selectedTrack.id) {
      showToast('Track ID is missing', 'error')
      console.error('Selected track:', selectedTrack)
      return
    }

    const fieldKey = fieldPath.join('.')
    setAutofillingField(fieldKey)
    try {
      const response = await fetch(`/api/audio/sonic-dna-agents?trackId=${selectedTrack.id}&force=true`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`
        showToast(`Autofill failed: ${errorMessage}`, 'error')
        console.error('Autofill failed:', { status: response.status, error: errorData, trackId: selectedTrack.id })
        return
      }

      const data = await response.json()
      
      if (data.sonicDNA) {
        // Navigate to the field in the sonic DNA object
        let fieldValue: any = data.sonicDNA
        for (const key of fieldPath) {
          if (fieldValue && typeof fieldValue === 'object' && key in fieldValue) {
            fieldValue = fieldValue[key]
          } else {
            fieldValue = undefined
            break
          }
        }
        
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
          updateDNAField(fieldPath, fieldValue)
          const fieldName = fieldPath[fieldPath.length - 1]
          showToast(`${fieldName} autofilled successfully!`, 'success')
        } else {
          showToast(`Field "${fieldPath.join('.')}" not found in analysis`, 'error')
          console.warn('Field not found:', { fieldPath, sonicDNA: data.sonicDNA })
        }
      } else {
        showToast('No analysis data returned', 'error')
        console.error('No sonicDNA in response:', data)
      }
    } catch (error: any) {
      showToast(`Autofill error: ${error.message}`, 'error')
      console.error('Autofill error:', error, { trackId: selectedTrack.id, fieldPath })
    } finally {
      setAutofillingField(null)
    }
  }

  function handleExport() {
    if (!selectedTrack || !editingDNA) {
      showToast('No track selected to export', 'info')
      return
    }

    const dataStr = JSON.stringify(editingDNA, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedTrack.title || 'track'}-sonic-dna.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast('Sonic DNA exported successfully!', 'success')
  }

  async function handleExportPDF() {
    if (!selectedTrack || !editingDNA) {
      showToast('No track selected to export', 'info')
      return
    }

    try {
      showToast('Generating PDF...', 'info')
      
      // Create PDF content
      const completeness = getTrackCompleteness(selectedTrack)
      const qualityScore = getTrackQualityScore(selectedTrack)
      
      const pdfContent = {
        track: {
          title: selectedTrack.title || 'Untitled',
          artist: selectedTrack.artist || 'Unknown',
          bpm: getTrackBpm(selectedTrack),
          key: getTrackKey(selectedTrack),
          genre: getTrackGenre(selectedTrack),
        },
        metrics: {
          completeness: completeness.percentage,
          qualityScore,
          filled: completeness.filled,
          total: completeness.total,
        },
        sonicDNA: editingDNA,
      }

      // Call PDF generation API
      const response = await fetch('/api/admin/sonic-dna/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdfContent),
      })

      if (!response.ok) {
        throw new Error('PDF generation failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedTrack.title || 'track'}-sonic-dna.html`
      link.click()
      URL.revokeObjectURL(url)
      showToast('PDF exported successfully (HTML format - use browser print to PDF)', 'success')
    } catch (error: any) {
      showToast('PDF export failed: ' + error.message, 'error')
      console.error('PDF export error:', error)
    }
  }

  function updateDNAField(path: string[], value: any) {
    if (!editingDNA) return

    const newDNA = JSON.parse(JSON.stringify(editingDNA))
    let current = newDNA

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {}
      }
      current = current[path[i]]
    }

    current[path[path.length - 1]] = value
    setEditingDNA(newDNA)
  }

  function updateDNAArray(path: string[], index: number, value: any) {
    if (!editingDNA) return

    const newDNA = JSON.parse(JSON.stringify(editingDNA))
    let current = newDNA

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {}
      }
      current = current[path[i]]
    }

    const array = current[path[path.length - 1]] || []
    array[index] = value
    current[path[path.length - 1]] = array
    setEditingDNA(newDNA)
  }

  function addToDNAArray(path: string[], value: any = '') {
    if (!editingDNA) return

    const newDNA = JSON.parse(JSON.stringify(editingDNA))
    let current = newDNA

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {}
      }
      current = current[path[i]]
    }

    const array = current[path[path.length - 1]] || []
    array.push(value)
    current[path[path.length - 1]] = array
    setEditingDNA(newDNA)
  }

  function removeFromDNAArray(path: string[], index: number) {
    if (!editingDNA) return

    const newDNA = JSON.parse(JSON.stringify(editingDNA))
    let current = newDNA

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }

    const array = current[path[path.length - 1]] || []
    array.splice(index, 1)
    current[path[path.length - 1]] = array
    setEditingDNA(newDNA)
  }

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  function toggleTrackSelection(trackId: string) {
    setSelectedTracks((prev) => {
      const next = new Set(prev)
      if (next.has(trackId)) {
        next.delete(trackId)
      } else {
        next.add(trackId)
      }
      return next
    })
  }

  function toggleAllTracks() {
    if (selectedTracks.size === filteredTracks.length) {
      setSelectedTracks(new Set())
    } else {
      setSelectedTracks(new Set(filteredTracks.map((t) => t.id)))
    }
  }

  function handleSort(field: SortField, level: 'primary' | 'secondary' | 'tertiary' = 'primary') {
    setSortConfig((prev) => {
      const newConfig = { ...prev }
      if (level === 'primary') {
        if (prev.primary === field) {
          newConfig.direction = prev.direction === 'asc' ? 'desc' : 'asc'
        } else {
          newConfig.primary = field
          newConfig.direction = 'asc'
        }
      } else if (level === 'secondary') {
        if (prev.secondary === field) {
          newConfig.secondary = null
        } else {
          newConfig.secondary = field
        }
      } else if (level === 'tertiary') {
        if (prev.tertiary === field) {
          newConfig.tertiary = null
        } else {
          newConfig.tertiary = field
        }
      }
      return newConfig
    })
    setIsSortMenuOpen(false)
  }

  function clearSort(level: 'secondary' | 'tertiary') {
    setSortConfig((prev) => ({
      ...prev,
      [level]: null,
    }))
  }

  // Helper functions to extract metadata from sonic_dna with SERGIK defaults
  function getTrackGenre(track: any): string {
    // First check metadata (synced from sonic_dna)
    if (track.metadata?.primary_genre) return track.metadata.primary_genre
    if (track.metadata?.genres?.[0]) return track.metadata.genres[0]
    
    // Then check sonic_dna for explicit genre
    if (track.sonic_dna) {
      try {
        const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
        const explicitGenre = dna?.genres?.primaryGenres?.[0] || 
                              dna?.genres?.primary?.[0] ||
                              dna?.comprehensive?.genres?.primary?.[0] ||
                              dna?.drums?.genreStyles?.[0] ||
                              dna?.genre
        if (explicitGenre) return explicitGenre
      } catch {}
    }
    
    // Use comprehensive GenreAnalyzer for inference
    const characteristics = extractCharacteristicsFromSonicDna(track.sonic_dna)
    
    // Add BPM from track if not in sonic_dna
    if (!characteristics.bpm && track.bpm) {
      characteristics.bpm = track.bpm
    }
    
    // Add key from track if not in characteristics  
    if (!characteristics.key && track.key_signature) {
      characteristics.key = track.key_signature
    }
    
    const analyzer = new GenreAnalyzer(characteristics)
    return analyzer.inferGenre()
  }

  function getTrackKey(track: any): string {
    if (track.key_signature && track.key_signature !== 'Unknown') return track.key_signature
    if (!track.sonic_dna) {
      return inferKeyFromBpm(track.bpm)
    }
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      const key = dna?.musical?.keySignature || dna?.technical?.key?.key || ''
      return key || inferKeyFromBpm(track.bpm)
    } catch {
      return inferKeyFromBpm(track.bpm)
    }
  }

  function getTrackEnergy(track: any): number {
    if (track.energy_level !== undefined && track.energy_level > 0) return track.energy_level
    if (!track.sonic_dna) {
      return inferEnergyFromBpm(track.bpm)
    }
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      const energy = dna?.technical?.energyLevel || dna?.comprehensive?.energy?.level || 0
      return energy > 0 ? energy : inferEnergyFromBpm(track.bpm)
    } catch {
      return inferEnergyFromBpm(track.bpm)
    }
  }

  function getTrackDanceability(track: any): number {
    if (track.danceability !== undefined && track.danceability > 0) return track.danceability
    if (!track.sonic_dna) {
      // Infer danceability from BPM - house/disco range = high danceability
      if (track.bpm >= 115 && track.bpm <= 130) return SERGIK_DEFAULTS.danceability
      if (track.bpm >= 90 && track.bpm < 115) return 6
      return 5
    }
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      const danceability = dna?.technical?.danceability || 0
      if (danceability > 0) return danceability
      // Fallback inference
      if (track.bpm >= 115 && track.bpm <= 130) return SERGIK_DEFAULTS.danceability
      return 5
    } catch {
      return SERGIK_DEFAULTS.danceability
    }
  }

  function getTrackBpm(track: any): number {
    if (track.bpm && track.bpm > 0) return track.bpm
    if (!track.sonic_dna) return SERGIK_DEFAULTS.bpm
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.technical?.bpm || SERGIK_DEFAULTS.bpm
    } catch {
      return SERGIK_DEFAULTS.bpm
    }
  }

  // =========== ENRICHED DATA HELPERS ===========
  
  function getTrackMood(track: any): string | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.emotional?.mood || dna?.mood || null
    } catch {
      return null
    }
  }

  function getTrackDescription(track: any): string | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.description || dna?.summary || null
    } catch {
      return null
    }
  }

  function getTrackDnaMatchScore(track: any): number | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?._enrichment?.dnaMatchScore || null
    } catch {
      return null
    }
  }

  function getTrackMixingRecommendations(track: any): { bpmRange?: { min: number; max: number }; compatibleKeys?: string[]; mixableGenres?: string[] } | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.mixing || null
    } catch {
      return null
    }
  }

  function getTrackProductionEra(track: any): string | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.production?.era || null
    } catch {
      return null
    }
  }

  function getTrackInstruments(track: any): string[] | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.production?.instrumentSignatures || null
    } catch {
      return null
    }
  }

  function getTrackSubgenre(track: any): string | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.genres?.subgenres?.[0] || null
    } catch {
      return null
    }
  }

  function getTrackDrumStyle(track: any): string | null {
    if (!track.sonic_dna) return null
    try {
      const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna) : track.sonic_dna
      return dna?.drums?.patternType || dna?.drums?.genreStyles?.[0] || null
    } catch {
      return null
    }
  }

  // Completeness calculation
  function getTrackCompleteness(track: any): { percentage: number; filled: number; total: number; missingFields: string[] } {
    const dna = typeof track.sonic_dna === 'string' ? JSON.parse(track.sonic_dna || '{}') : (track.sonic_dna || {})
    let filled = 0
    const total = 20 // Total number of key fields
    const missingFields: string[] = []

    // Core fields (5 points)
    if (dna.description) filled++
    else missingFields.push('Description')
    if (dna.intention) filled++
    else missingFields.push('Intention')
    if (dna.summary) filled++
    else missingFields.push('Summary')

    // Emotional (3 points)
    if (dna.emotional?.primaryEmotions?.length > 0) filled++
    else missingFields.push('Primary Emotions')
    if (dna.emotional?.emotionalJourney) filled++
    else missingFields.push('Emotional Journey')
    if (dna.emotional?.psychologicalProfile) filled++
    else missingFields.push('Psychological Profile')

    // Musical (3 points)
    if (dna.musical?.keySignature) filled++
    else missingFields.push('Key Signature')
    if (dna.musical?.harmonicComplexity) filled++
    else missingFields.push('Harmonic Complexity')
    if (dna.musical?.rhythmicPatterns) filled++
    else missingFields.push('Rhythmic Patterns')

    // Technical (2 points)
    if (dna.technical?.technicalDescription) filled++
    else missingFields.push('Technical Description')
    if (dna.technical?.bpm || track.bpm) filled++
    else missingFields.push('BPM')

    // Drums (2 points)
    if (dna.drums?.patternType) filled++
    else missingFields.push('Drum Pattern Type')
    if (dna.drums?.patternRecognition) filled++
    else missingFields.push('Pattern Recognition')

    // Harmony (1 point)
    if (dna.harmony?.harmonicComplexity) filled++
    else missingFields.push('Harmony Analysis')

    // Genres (2 points)
    if (dna.genres?.primaryGenres?.length > 0) filled++
    else missingFields.push('Primary Genres')
    if (dna.genres?.genreFusion) filled++
    else missingFields.push('Genre Fusion')

    // Historical (1 point)
    if (dna.historical?.historicalContext) filled++
    else missingFields.push('Historical Context')

    // Regional (1 point)
    if (dna.regional?.regionalCharacteristics) filled++
    else missingFields.push('Regional Characteristics')

    // Cultural (1 point)
    if (dna.cultural?.description) filled++
    else missingFields.push('Cultural Description')

    // Musicology (1 point)
    if (dna.musicology?.description) filled++
    else missingFields.push('Musicology Description')

    const percentage = Math.round((filled / total) * 100)
    return { percentage, filled, total, missingFields }
  }

  // Data quality functions
  function getTrackQualityScore(track: any): number {
    let score = 0
    let maxScore = 0

    // Description (10 points)
    maxScore += 10
    if (track.sonic_dna?.description || track.sonic_dna?.intention) score += 10

    // Emotional analysis (15 points)
    maxScore += 15
    if (track.sonic_dna?.emotional?.primaryEmotions?.length > 0) score += 5
    if (track.sonic_dna?.emotional?.emotionalJourney) score += 5
    if (track.sonic_dna?.emotional?.psychologicalProfile) score += 5

    // Musical analysis (15 points)
    maxScore += 15
    if (track.sonic_dna?.musical?.keySignature) score += 5
    if (track.sonic_dna?.musical?.harmonicComplexity) score += 5
    if (track.sonic_dna?.musical?.rhythmicPatterns) score += 5

    // Technical (15 points)
    maxScore += 15
    if (track.bpm) score += 5
    if (track.sonic_dna?.technical?.energyLevel !== undefined) score += 5
    if (track.sonic_dna?.technical?.danceability !== undefined) score += 5

    // Genres (10 points)
    maxScore += 10
    if (track.sonic_dna?.genres?.primaryGenres?.length > 0) score += 10

    // Historical (10 points)
    maxScore += 10
    if (track.sonic_dna?.historical?.historicalContext) score += 10

    // Regional/Cultural (10 points)
    maxScore += 10
    if (track.sonic_dna?.regional?.regionalCharacteristics || track.sonic_dna?.cultural?.description) score += 10

    // Summary (15 points)
    maxScore += 15
    if (track.sonic_dna?.summary) score += 15

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  }

  function getTrackValidationWarnings(track: any): string[] {
    const warnings: string[] = []
    const dna = track.sonic_dna || {}

    if (!dna.description && !dna.intention) {
      warnings.push('Missing description')
    }
    if (!dna.emotional?.primaryEmotions?.length) {
      warnings.push('Missing emotional analysis')
    }
    if (!dna.genres?.primaryGenres?.length) {
      warnings.push('Missing genre classification')
    }
    if (!dna.summary) {
      warnings.push('Missing summary')
    }
    if (track.bpm && dna.technical?.bpm && Math.abs(track.bpm - dna.technical.bpm) > 5) {
      warnings.push('BPM mismatch between track and analysis')
    }

    return warnings
  }

  // Tag management
  function addTagToTrack(trackId: string, tagName: string) {
    const currentTags = trackTags.get(trackId) || []
    if (!currentTags.includes(tagName)) {
      setTrackTags(new Map(trackTags.set(trackId, [...currentTags, tagName])))
    }
    // Add to available tags if new
    if (!availableTags.find((t) => t.name === tagName)) {
      setAvailableTags([...availableTags, { id: Date.now().toString(), name: tagName, color: '#9333ea' }])
    }
  }

  function removeTagFromTrack(trackId: string, tagName: string) {
    const currentTags = trackTags.get(trackId) || []
    setTrackTags(new Map(trackTags.set(trackId, currentTags.filter((t) => t !== tagName))))
  }

  function getTrackTags(trackId: string): string[] {
    return trackTags.get(trackId) || []
  }

  // Preset management
  function saveCurrentAsPreset(name: string) {
    const preset: FilterPreset = {
      id: Date.now().toString(),
      name,
      filters: { ...advancedFilters },
      sortConfig: { ...sortConfig },
      statusFilter,
    }
    setFilterPresets([...filterPresets, preset])
    savePresets()
    showToast(`Preset "${name}" saved`, 'success')
  }

  function loadPreset(preset: FilterPreset) {
    setAdvancedFilters(preset.filters)
    setSortConfig(preset.sortConfig)
    setStatusFilter(preset.statusFilter)
    showToast(`Preset "${preset.name}" loaded`, 'success')
  }

  function deletePreset(presetId: string) {
    setFilterPresets(filterPresets.filter((p) => p.id !== presetId))
    savePresets()
    showToast('Preset deleted', 'success')
  }

  // Enhanced export
  function handleExportFiltered() {
    if (filteredTracks.length === 0) {
      showToast('No tracks to export', 'info')
      return
    }

    const exportData = filteredTracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      bpm: track.bpm,
      status: track.sonic_dna_status,
      genre: getTrackGenre(track),
      key: getTrackKey(track),
      energy: getTrackEnergy(track),
      danceability: getTrackDanceability(track),
      qualityScore: getTrackQualityScore(track),
      tags: getTrackTags(track.id),
      sonic_dna: track.sonic_dna,
    }))

    // Export as JSON
    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sonic-dna-export-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${exportData.length} tracks`, 'success')
  }

  function handleExportCSV() {
    if (filteredTracks.length === 0) {
      showToast('No tracks to export', 'info')
      return
    }

    const headers = [
      'Title',
      'Artist',
      'BPM',
      'Status',
      'Genre',
      'Key',
      'Energy',
      'Danceability',
      'Quality Score',
      'Tags',
      'Has Description',
      'Has Emotional',
      'Has Historical',
    ]

    const rows = filteredTracks.map((track) => [
      track.title || track.file_name || '',
      track.artist || '',
      track.bpm || '',
      track.sonic_dna_status || 'pending',
      getTrackGenre(track),
      getTrackKey(track),
      (getTrackEnergy(track) * 100).toFixed(0) + '%',
      (getTrackDanceability(track) * 100).toFixed(0) + '%',
      getTrackQualityScore(track) + '%',
      getTrackTags(track.id).join(', '),
      !!(track.sonic_dna?.description || track.sonic_dna?.intention) ? 'Yes' : 'No',
      !!(track.sonic_dna?.emotional?.primaryEmotions?.length > 0) ? 'Yes' : 'No',
      !!(track.sonic_dna?.historical?.historicalContext) ? 'Yes' : 'No',
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n')
    const dataBlob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sonic-dna-export-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${filteredTracks.length} tracks as CSV`, 'success')
  }

  // Statistics calculation
  function calculateStatistics(filteredTracks: any[]) {
    const stats = {
      total: filteredTracks.length,
      byStatus: {
        completed: filteredTracks.filter((t) => t.sonic_dna_status === 'completed').length,
        processing: filteredTracks.filter((t) => t.sonic_dna_status === 'processing').length,
        pending: filteredTracks.filter((t) => !t.sonic_dna_status || t.sonic_dna_status === 'pending').length,
      },
      byGenre: {} as Record<string, number>,
      byKey: {} as Record<string, number>,
      bpmRange: {
        min: Math.min(...filteredTracks.map((t) => t.bpm || 0).filter((b) => b > 0)),
        max: Math.max(...filteredTracks.map((t) => t.bpm || 0)),
        avg: 0,
      },
      energyRange: {
        min: 0,
        max: 0,
        avg: 0,
      },
      qualityScores: {
        high: 0, // 80-100
        medium: 0, // 50-79
        low: 0, // 0-49
      },
    }

    // Calculate averages
    const bpms = filteredTracks.map((t) => t.bpm || 0).filter((b) => b > 0)
    stats.bpmRange.avg = bpms.length > 0 ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : 0

    const energies = filteredTracks.map((t) => getTrackEnergy(t)).filter((e) => e > 0)
    stats.energyRange.min = energies.length > 0 ? Math.min(...energies) : 0
    stats.energyRange.max = energies.length > 0 ? Math.max(...energies) : 0
    stats.energyRange.avg = energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 0

    // Genre distribution
    filteredTracks.forEach((track) => {
      const genre = getTrackGenre(track)
      if (genre) {
        stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1
      }
    })

    // Key distribution
    filteredTracks.forEach((track) => {
      const key = getTrackKey(track)
      if (key) {
        stats.byKey[key] = (stats.byKey[key] || 0) + 1
      }
    })

    // Quality scores
    filteredTracks.forEach((track) => {
      const score = getTrackQualityScore(track)
      if (score >= 80) stats.qualityScores.high++
      else if (score >= 50) stats.qualityScores.medium++
      else stats.qualityScores.low++
    })

    return stats
  }

  // Compute filtered tracks (moved before useEffect to fix scope issue)
  const filteredTracks = useMemo(() => {
    if (!tracks.length) return []
    
    let result = tracks.filter((track) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          track.title?.toLowerCase().includes(query) ||
          track.artist?.toLowerCase().includes(query) ||
          track.file_name?.toLowerCase().includes(query) ||
          track.file_path?.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // Status filter
      if (statusFilter !== 'all') {
        const status = track.sonic_dna_status || 'pending'
        if (statusFilter === 'completed' && status !== 'completed') return false
        if (statusFilter === 'processing' && status !== 'processing') return false
        if (statusFilter === 'pending' && status !== 'pending') return false
      }

      return true
    })

    // Apply advanced filters
    result = result.filter((track) => {
      // BPM range
      if (advancedFilters.bpmMin !== null && (track.bpm || 0) < advancedFilters.bpmMin) return false
      if (advancedFilters.bpmMax !== null && (track.bpm || 0) > advancedFilters.bpmMax) return false

      // Energy range
      const trackEnergy = getTrackEnergy(track)
      if (advancedFilters.energyMin !== null && trackEnergy < advancedFilters.energyMin) return false
      if (advancedFilters.energyMax !== null && trackEnergy > advancedFilters.energyMax) return false

      // Danceability range
      const trackDanceability = getTrackDanceability(track)
      if (advancedFilters.danceabilityMin !== null && trackDanceability < advancedFilters.danceabilityMin)
        return false
      if (advancedFilters.danceabilityMax !== null && trackDanceability > advancedFilters.danceabilityMax)
        return false

      // Genre filter
      if (advancedFilters.genres.length > 0) {
        const trackGenre = getTrackGenre(track)
        if (!advancedFilters.genres.some((g) => trackGenre.toLowerCase().includes(g.toLowerCase()))) return false
      }

      // Key filter
      if (advancedFilters.keys.length > 0) {
        const trackKey = getTrackKey(track)
        if (!advancedFilters.keys.some((k) => trackKey.toLowerCase().includes(k.toLowerCase()))) return false
      }

      // Has description
      if (advancedFilters.hasDescription !== null) {
        const hasDesc = !!(track.sonic_dna?.description || track.sonic_dna?.intention)
        if (advancedFilters.hasDescription !== hasDesc) return false
      }

      // Has emotional analysis
      if (advancedFilters.hasEmotional !== null) {
        const hasEmo = !!(track.sonic_dna?.emotional?.primaryEmotions?.length > 0)
        if (advancedFilters.hasEmotional !== hasEmo) return false
      }

      // Has historical analysis
      if (advancedFilters.hasHistorical !== null) {
        const hasHist = !!(track.sonic_dna?.historical?.historicalContext)
        if (advancedFilters.hasHistorical !== hasHist) return false
      }

      // Date range
      if (advancedFilters.dateFrom) {
        const trackDate = track.sonic_dna_analyzed_at || ''
        if (trackDate < advancedFilters.dateFrom) return false
      }
      if (advancedFilters.dateTo) {
        const trackDate = track.sonic_dna_analyzed_at || ''
        if (trackDate > advancedFilters.dateTo) return false
      }

      return true
    })

    // Apply advanced search
    if (advancedSearch) {
      try {
        // Simple query parser: "genre:techno energy:>0.7 bpm:120-140"
        const queries = advancedSearch.split(/\s+/)
        result = result.filter((track) => {
          return queries.every((query) => {
            if (query.includes(':')) {
              const [field, value] = query.split(':')
              switch (field.toLowerCase()) {
                case 'genre':
                  return getTrackGenre(track).toLowerCase().includes(value.toLowerCase())
                case 'key':
                  return getTrackKey(track).toLowerCase().includes(value.toLowerCase())
                case 'energy':
                  if (value.startsWith('>')) {
                    return getTrackEnergy(track) > parseFloat(value.slice(1))
                  } else if (value.startsWith('<')) {
                    return getTrackEnergy(track) < parseFloat(value.slice(1))
                  }
                  return Math.abs(getTrackEnergy(track) - parseFloat(value)) < 0.1
                case 'danceability':
                  if (value.startsWith('>')) {
                    return getTrackDanceability(track) > parseFloat(value.slice(1))
                  } else if (value.startsWith('<')) {
                    return getTrackDanceability(track) < parseFloat(value.slice(1))
                  }
                  return Math.abs(getTrackDanceability(track) - parseFloat(value)) < 0.1
                case 'bpm':
                  if (value.includes('-')) {
                    const [min, max] = value.split('-').map(Number)
                    const trackBpm = track.bpm || 0
                    return trackBpm >= min && trackBpm <= max
                  } else if (value.startsWith('>')) {
                    return (track.bpm || 0) > parseFloat(value.slice(1))
                  } else if (value.startsWith('<')) {
                    return (track.bpm || 0) < parseFloat(value.slice(1))
                  }
                  return Math.abs((track.bpm || 0) - parseFloat(value)) < 5
                default:
                  return true
              }
            } else {
              // Regular text search
              const searchQuery = query.toLowerCase()
              return (
                track.title?.toLowerCase().includes(searchQuery) ||
                track.artist?.toLowerCase().includes(searchQuery) ||
                track.file_name?.toLowerCase().includes(searchQuery) ||
                getTrackGenre(track).toLowerCase().includes(searchQuery)
              )
            }
          })
        })
      } catch (e) {
        // If advanced search parsing fails, fall back to regular search
        console.error('Advanced search error:', e)
      }
    }

    // Multi-level sorting
    result = [...result].sort((a, b) => {
      const sortLevels: Array<{ field: SortField | null; direction: SortDirection }> = [
        { field: sortConfig.primary, direction: sortConfig.direction },
        { field: sortConfig.secondary, direction: 'asc' },
        { field: sortConfig.tertiary, direction: 'asc' },
      ]

      for (const level of sortLevels) {
        if (!level.field || level.field === 'default') continue

        let comparison = 0

        switch (level.field) {
          case 'title':
            comparison = (a.title || a.file_name || '').localeCompare(b.title || b.file_name || '', undefined, {
              sensitivity: 'base',
            })
            break
          case 'artist':
            comparison = (a.artist || '').localeCompare(b.artist || '', undefined, { sensitivity: 'base' })
            break
          case 'bpm':
            comparison = (a.bpm || 0) - (b.bpm || 0)
            break
          case 'status':
            const aStatus = a.sonic_dna_status || 'pending'
            const bStatus = b.sonic_dna_status || 'pending'
            const statusOrder = { completed: 1, processing: 2, pending: 3 }
            comparison =
              (statusOrder[aStatus as keyof typeof statusOrder] || 99) -
              (statusOrder[bStatus as keyof typeof statusOrder] || 99)
            break
          case 'updated':
            const aDate = a.sonic_dna_analyzed_at || ''
            const bDate = b.sonic_dna_analyzed_at || ''
            if (aDate && bDate) {
              comparison = new Date(aDate).getTime() - new Date(bDate).getTime()
            } else if (aDate) {
              comparison = -1
            } else if (bDate) {
              comparison = 1
            }
            break
          case 'genre':
            comparison = getTrackGenre(a).localeCompare(getTrackGenre(b), undefined, { sensitivity: 'base' })
            break
          case 'key':
            comparison = getTrackKey(a).localeCompare(getTrackKey(b), undefined, { sensitivity: 'base' })
            break
          case 'energy':
            comparison = getTrackEnergy(a) - getTrackEnergy(b)
            break
          case 'danceability':
            comparison = getTrackDanceability(a) - getTrackDanceability(b)
            break
          default:
            break
        }

        if (comparison !== 0) {
          return level.direction === 'desc' ? -comparison : comparison
        }
      }

      return 0
    })

    return result
  }, [tracks, searchQuery, statusFilter, advancedFilters, advancedSearch, sortConfig])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      // Ctrl/Cmd + F: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // Ctrl/Cmd + S: Save (if editing)
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && selectedTrack) {
        e.preventDefault()
        handleSaveDNA()
        return
      }

      // Escape: Close menus
      if (e.key === 'Escape') {
        setIsSortMenuOpen(false)
        setIsColumnMenuOpen(false)
        setIsFilterMenuOpen(false)
        setIsPresetMenuOpen(false)
        setIsContextMenuOpen(false)
        setIsTextareaContextMenuOpen(false)
        return
      }

      // Arrow keys: Navigate tracks
      if (focusedTrackIndex !== null && filteredTracks.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const nextIndex = Math.min(focusedTrackIndex + 1, filteredTracks.length - 1)
          setFocusedTrackIndex(nextIndex)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          const prevIndex = Math.max(focusedTrackIndex - 1, 0)
          setFocusedTrackIndex(prevIndex)
          return
        }
        if (e.key === 'Enter' && focusedTrackIndex >= 0 && focusedTrackIndex < filteredTracks.length) {
          e.preventDefault()
          handleEditTrack(filteredTracks[focusedTrackIndex].id)
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedTrackIndex, filteredTracks, selectedTrack])

  // Context menu
  function handleContextMenu(e: React.MouseEvent, track: any) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuTrack(track)
    setIsContextMenuOpen(true)
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setIsContextMenuOpen(false)
    if (isContextMenuOpen) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [isContextMenuOpen])

  // Close textarea context menu when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (textareaContextMenuRef.current && !textareaContextMenuRef.current.contains(e.target as Node)) {
        setIsTextareaContextMenuOpen(false)
      }
    }
    if (isTextareaContextMenuOpen) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [isTextareaContextMenuOpen])

  // Handler for textarea context menu
  function handleTextareaContextMenu(e: React.MouseEvent<HTMLTextAreaElement>, fieldPath: string[]) {
    e.preventDefault()
    e.stopPropagation()
    setTextareaContextMenuPosition({ x: e.clientX, y: e.clientY })
    setTextareaContextMenuFieldPath(fieldPath)
    setIsTextareaContextMenuOpen(true)
  }

  // Smart autofill function that can work with any textarea
  async function handleSmartAutofill(fieldPath: string[] | null) {
    if (!selectedTrack) {
      showToast('No track selected', 'error')
      setIsTextareaContextMenuOpen(false)
      return
    }

    if (!fieldPath) {
      showToast('Field path is missing', 'error')
      setIsTextareaContextMenuOpen(false)
      return
    }

    if (!selectedTrack.id) {
      showToast('Track ID is missing', 'error')
      console.error('Selected track:', selectedTrack)
      setIsTextareaContextMenuOpen(false)
      return
    }

    const fieldKey = fieldPath.join('.')
    setAutofillingField(fieldKey)
    setIsTextareaContextMenuOpen(false)
    
    try {
      const response = await fetch(`/api/audio/sonic-dna-agents?trackId=${selectedTrack.id}&force=true`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`
        showToast(`Autofill failed: ${errorMessage}`, 'error')
        console.error('Autofill failed:', { status: response.status, error: errorData, trackId: selectedTrack.id })
        return
      }

      const data = await response.json()
      
      if (data.sonicDNA) {
        // Navigate to the field in the sonic DNA object
        let fieldValue: any = data.sonicDNA
        for (const key of fieldPath) {
          if (fieldValue && typeof fieldValue === 'object' && key in fieldValue) {
            fieldValue = fieldValue[key]
          } else {
            fieldValue = undefined
            break
          }
        }
        
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
          updateDNAField(fieldPath, fieldValue)
          const fieldName = fieldPath[fieldPath.length - 1]
          showToast(`${fieldName} autofilled successfully!`, 'success')
        } else {
          showToast(`Field "${fieldPath.join('.')}" not found in analysis`, 'error')
          console.warn('Field not found:', { fieldPath, sonicDNA: data.sonicDNA })
        }
      } else {
        showToast('No analysis data returned', 'error')
        console.error('No sonicDNA in response:', data)
      }
    } catch (error: any) {
      showToast(`Autofill error: ${error.message}`, 'error')
      console.error('Autofill error:', error, { trackId: selectedTrack.id, fieldPath })
    } finally {
      setAutofillingField(null)
    }
  }

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false)
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setIsColumnMenuOpen(false)
      }
    }
    
    if (isSortMenuOpen || isColumnMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSortMenuOpen, isColumnMenuOpen])

  if (loading || loadingTracks) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <FaSpinner className="text-4xl text-purple-500 animate-spin" />
          <div className="text-white text-xl">Loading Sonic DNA Analyzer...</div>
        </div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  // filteredTracks is now computed in useMemo above

  const tracksWithDNA = tracks.filter((t) => t.sonic_dna_status === 'completed')
  const tracksProcessing = tracks.filter((t) => t.sonic_dna_status === 'processing')
  const tracksPending = tracks.filter((t) => !t.sonic_dna_status || t.sonic_dna_status === 'pending')
  const totalTracks = tracks.length
  const completionRate = totalTracks > 0 ? ((tracksWithDNA.length / totalTracks) * 100).toFixed(1) : '0'

  // Extract DNA sections
  const dna = editingDNA || {}
  const description = dna.description || ''
  const intention = dna.intention || ''
  const emotional = dna.emotional || {}
  const musical = dna.musical || {}
  const historical = dna.historical || {}
  const regional = dna.regional || {}
  const genres = dna.genres || {}
  const technical = dna.technical || {}
  const drums = dna.drums || {}
  const musicology = dna.musicology || {}
  const cultural = dna.cultural || {}
  const summary = dna.summary || ''

  const tabs = [
    { id: 'read-report', label: 'Read Report', icon: FaMusic },
    { id: 'overview', label: 'Overview', icon: FaChartBar },
    { id: 'description', label: 'Description', icon: FaMusic },
    { id: 'emotional', label: 'Emotional', icon: FaHeart },
    { id: 'musical', label: 'Musical', icon: FaMusic },
    { id: 'technical', label: 'Technical', icon: FaCog },
    { id: 'drums', label: 'Drums', icon: FaMusic },
    { id: 'harmony', label: 'Harmony', icon: FaMusic },
    { id: 'genres', label: 'Genres', icon: FaTags },
    { id: 'historical', label: 'Historical', icon: FaHistory },
    { id: 'regional', label: 'Regional', icon: FaGlobe },
    { id: 'musicology', label: 'Musicology', icon: FaMusic },
    { id: 'cultural', label: 'Cultural', icon: FaGlobe },
    { id: 'summary', label: 'Summary', icon: FaMusic },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white p-4 md:p-8">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Sonic DNA Analyzer
          </h1>
          <p className="text-gray-400">Comprehensive musical analysis and intelligence management</p>
        </div>

        {/* Toast Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm border ${
                toast.type === 'success'
                  ? 'bg-green-900/80 border-green-500 text-green-100'
                  : toast.type === 'error'
                    ? 'bg-red-900/80 border-red-500 text-red-100'
                    : 'bg-blue-900/80 border-blue-500 text-blue-100'
              } animate-slide-in`}
            >
              {toast.message}
            </div>
          ))}
        </div>

        {/* Bulk Autofill Progress */}
        {bulkAutofillProgress?.isRunning && (
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 backdrop-blur-sm border border-purple-700/50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FaSpinner className="animate-spin" />
                Bulk Autofill in Progress
              </h3>
              <span className="text-sm text-gray-400">
                {bulkAutofillProgress.completed} completed, {bulkAutofillProgress.failed} failed
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 mb-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(bulkAutofillProgress.current / bulkAutofillProgress.total) * 100}%` }}
              />
            </div>
            <div className="text-sm text-gray-400">
              Processing track {bulkAutofillProgress.current} of {bulkAutofillProgress.total}
            </div>
          </div>
        )}

        {/* Bulk Autofill Progress */}
        {bulkAutofillProgress?.isRunning && (
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 backdrop-blur-sm border border-purple-700/50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FaSpinner className="animate-spin" />
                Bulk Autofill in Progress
              </h3>
              <span className="text-sm text-gray-400">
                {bulkAutofillProgress.completed} completed, {bulkAutofillProgress.failed} failed
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 mb-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(bulkAutofillProgress.current / bulkAutofillProgress.total) * 100}%` }}
              />
            </div>
            <div className="text-sm text-gray-400">
              Processing track {bulkAutofillProgress.current} of {bulkAutofillProgress.total}
            </div>
          </div>
        )}

        {/* Statistics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 backdrop-blur-sm border border-purple-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-sm font-medium">Total Tracks</div>
              <FaMusic className="text-purple-400" />
            </div>
            <div className="text-3xl font-bold">{totalTracks}</div>
            <div className="text-xs text-gray-500 mt-2">In library</div>
          </div>

          <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 backdrop-blur-sm border border-green-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-sm font-medium">Completed</div>
              <FaCheckCircle className="text-green-400" />
            </div>
            <div className="text-3xl font-bold text-green-400">{tracksWithDNA.length}</div>
            <div className="text-xs text-gray-500 mt-2">{completionRate}% complete</div>
          </div>

          <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 backdrop-blur-sm border border-yellow-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-sm font-medium">Processing</div>
              <FaSpinner className="text-yellow-400 animate-spin" />
            </div>
            <div className="text-3xl font-bold text-yellow-400">{tracksProcessing.length}</div>
            <div className="text-xs text-gray-500 mt-2">In progress</div>
          </div>

          <div className="bg-gradient-to-br from-red-900/50 to-red-800/30 backdrop-blur-sm border border-red-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-sm font-medium">Pending</div>
              <FaClock className="text-red-400" />
            </div>
            <div className="text-3xl font-bold text-red-400">{tracksPending.length}</div>
            <div className="text-xs text-gray-500 mt-2">Awaiting analysis</div>
          </div>
        </div>

        {/* Statistics Dashboard - Expandable */}
        {isStatsOpen && (
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <FaChartBar />
                Statistics Dashboard
              </h2>
              <button
                onClick={() => setIsStatsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <FaTimes />
              </button>
            </div>
            {(() => {
              const stats = calculateStatistics(filteredTracks)
              const topGenres = Object.entries(stats.byGenre)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
              const topKeys = Object.entries(stats.byKey)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Filtered Tracks</div>
                    <div className="text-2xl font-bold">{stats.total}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Avg BPM</div>
                    <div className="text-2xl font-bold text-blue-400">{stats.bpmRange.avg || 'N/A'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Range: {stats.bpmRange.min || 'N/A'} - {stats.bpmRange.max || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Avg Energy</div>
                    <div className="text-2xl font-bold text-yellow-400">
                      {(stats.energyRange.avg * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <div className="text-sm text-gray-400 mb-1">Quality Distribution</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-green-400">High (80-100%):</span>
                        <span>{stats.qualityScores.high}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-400">Medium (50-79%):</span>
                        <span>{stats.qualityScores.medium}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-400">Low (0-49%):</span>
                        <span>{stats.qualityScores.low}</span>
                      </div>
                    </div>
                  </div>
                  {topGenres.length > 0 && (
                    <div className="bg-gray-800/50 rounded-lg p-4 md:col-span-2">
                      <div className="text-sm text-gray-400 mb-2">Top Genres</div>
                      <div className="flex flex-wrap gap-2">
                        {topGenres.map(([genre, count]) => (
                          <div
                            key={genre}
                            className="px-3 py-1 bg-purple-900/30 border border-purple-700/50 rounded-full text-sm"
                          >
                            {genre} ({count})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {topKeys.length > 0 && (
                    <div className="bg-gray-800/50 rounded-lg p-4 md:col-span-2">
                      <div className="text-sm text-gray-400 mb-2">Top Keys</div>
                      <div className="flex flex-wrap gap-2">
                        {topKeys.map(([key, count]) => (
                          <div
                            key={key}
                            className="px-3 py-1 bg-blue-900/30 border border-blue-700/50 rounded-full text-sm"
                          >
                            {key} ({count})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Actions Bar */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleAnalyzeAll}
              disabled={analyzing}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
            >
              {analyzing ? <FaSpinner className="animate-spin" /> : <FaSync />}
              {analyzing ? 'Analyzing...' : 'Analyze All'}
            </button>
            <button
              onClick={handleRegenerateAll}
              disabled={regenerating}
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
            >
              {regenerating ? <FaSpinner className="animate-spin" /> : <FaSync />}
              {regenerating ? 'Regenerating...' : 'Regenerate All'}
            </button>
            {selectedTracks.size > 0 && (
              <>
                <button
                  onClick={handleBulkAutofill}
                  disabled={bulkAutofillProgress?.isRunning}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {bulkAutofillProgress?.isRunning ? (
                    <>
                      <FaSpinner className="animate-spin" />
                      Processing ({bulkAutofillProgress.current}/{bulkAutofillProgress.total})
                    </>
                  ) : (
                    <>
                      <FaSync />
                      Bulk Autofill ({selectedTracks.size})
                    </>
                  )}
                </button>
                <button
                  onClick={handleBulkRegenerate}
                  disabled={bulkAutofillProgress?.isRunning}
                  className="bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-semibold px-6 py-3 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  <FaSync />
                  Regenerate Selected ({selectedTracks.size})
                </button>
                <button
                  onClick={handleExportFiltered}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-6 py-3 rounded-lg transition flex items-center gap-2"
                >
                  <FaFileExport />
                  Export Selected ({selectedTracks.size})
                </button>
              </>
            )}
            {filteredTracks.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold px-6 py-3 rounded-lg transition flex items-center gap-2"
              >
                <FaFileExport />
                Export CSV ({filteredTracks.length})
              </button>
            )}
            <button
              onClick={() => {
                fetchTracks()
                fetchAgentStatus()
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition flex items-center gap-2"
            >
              <FaSync />
              Refresh
            </button>
            <button
              onClick={() => setIsStatsOpen(!isStatsOpen)}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition flex items-center gap-2"
            >
              <FaChartBar />
              {isStatsOpen ? 'Hide' : 'Show'} Stats
            </button>
            <label className="flex items-center gap-2 ml-auto cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded"
                aria-label="Enable auto-refresh"
              />
              <span className="text-sm text-gray-400">Auto-refresh</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tracks List */}
          <div className="lg:col-span-1 bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Tracks ({filteredTracks.length})</h2>
            </div>

            {/* Search and Filters */}
            <div className="space-y-3 mb-4">
              {/* Search Bar */}
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search tracks... (Ctrl+F)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  title="Advanced search"
                >
                  <FaSlidersH />
                </button>
              </div>

              {/* Advanced Search */}
              {showAdvancedSearch && (
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <div className="text-xs text-gray-400 mb-2">Advanced Search (e.g., genre:techno energy:&gt;0.7 bpm:120-140)</div>
                  <input
                    type="text"
                    placeholder="genre:techno energy:>0.7 bpm:120-140"
                    value={advancedSearch}
                    onChange={(e) => setAdvancedSearch(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="flex-1 min-w-[120px] px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  title="Filter by status"
                  aria-label="Filter tracks by status"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="pending">Pending</option>
                </select>
                
                {/* View Mode Toggle */}
                <div className="flex bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-2 text-sm transition ${
                      viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="List view"
                  >
                    <FaList />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-2 text-sm transition ${
                      viewMode === 'table' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Table view"
                  >
                    <FaTable />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-2 text-sm transition ${
                      viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Grid view"
                  >
                    <FaTh />
                  </button>
                </div>

                {/* Advanced Filters Menu */}
                <div className="relative" ref={filterMenuRef}>
                  <button
                    onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm hover:bg-gray-700 transition flex items-center gap-1"
                    title="Advanced filters"
                  >
                    <FaFilter />
                    {(advancedFilters.bpmMin !== null ||
                      advancedFilters.bpmMax !== null ||
                      advancedFilters.genres.length > 0 ||
                      advancedFilters.keys.length > 0) && (
                      <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    )}
                  </button>
                  {isFilterMenuOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-[600px] overflow-y-auto">
                      <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Advanced Filters</h3>
                          <button
                            onClick={() => {
                              setAdvancedFilters({
                                bpmMin: null,
                                bpmMax: null,
                                energyMin: null,
                                energyMax: null,
                                danceabilityMin: null,
                                danceabilityMax: null,
                                genres: [],
                                keys: [],
                                hasDescription: null,
                                hasEmotional: null,
                                hasHistorical: null,
                                dateFrom: '',
                                dateTo: '',
                              })
                            }}
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            Clear All
                          </button>
                        </div>

                        {/* BPM Range */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">BPM Range</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder="Min"
                              value={advancedFilters.bpmMin || ''}
                              onChange={(e) =>
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  bpmMin: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={advancedFilters.bpmMax || ''}
                              onChange={(e) =>
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  bpmMax: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                          </div>
                        </div>

                        {/* Energy Range */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Energy Level (0-1)</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="1"
                              placeholder="Min"
                              value={advancedFilters.energyMin || ''}
                              onChange={(e) =>
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  energyMin: e.target.value ? parseFloat(e.target.value) : null,
                                })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="1"
                              placeholder="Max"
                              value={advancedFilters.energyMax || ''}
                              onChange={(e) =>
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  energyMax: e.target.value ? parseFloat(e.target.value) : null,
                                })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                          </div>
                        </div>

                        {/* Danceability Range */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Danceability (0-1)</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              placeholder="Min"
                              value={advancedFilters.danceabilityMin || ''}
                              onChange={(e) =>
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  danceabilityMin: e.target.value ? parseFloat(e.target.value) : null,
                                })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              placeholder="Max"
                              value={advancedFilters.danceabilityMax || ''}
                              onChange={(e) =>
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  danceabilityMax: e.target.value ? parseFloat(e.target.value) : null,
                                })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                          </div>
                        </div>

                        {/* Genre Multi-select */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Genres</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {advancedFilters.genres.map((genre, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300 flex items-center gap-1"
                              >
                                {genre}
                                <button
                                  onClick={() =>
                                    setAdvancedFilters({
                                      ...advancedFilters,
                                      genres: advancedFilters.genres.filter((_, i) => i !== idx),
                                    })
                                  }
                                  className="hover:text-red-400"
                                >
                                  <FaTimes className="text-xs" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="Add genre..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value) {
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  genres: [...advancedFilters.genres, e.currentTarget.value],
                                })
                                e.currentTarget.value = ''
                              }
                            }}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                          />
                        </div>

                        {/* Key Multi-select */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Keys</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {advancedFilters.keys.map((key, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-300 flex items-center gap-1"
                              >
                                {key}
                                <button
                                  onClick={() =>
                                    setAdvancedFilters({
                                      ...advancedFilters,
                                      keys: advancedFilters.keys.filter((_, i) => i !== idx),
                                    })
                                  }
                                  className="hover:text-red-400"
                                >
                                  <FaTimes className="text-xs" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="Add key..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value) {
                                setAdvancedFilters({
                                  ...advancedFilters,
                                  keys: [...advancedFilters.keys, e.currentTarget.value],
                                })
                                e.currentTarget.value = ''
                              }
                            }}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                          />
                        </div>

                        {/* Boolean Filters */}
                        <div className="space-y-2">
                          <label className="block text-xs text-gray-400 mb-2">Has Analysis</label>
                          <div className="space-y-1">
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={advancedFilters.hasDescription === true}
                                onChange={(e) =>
                                  setAdvancedFilters({
                                    ...advancedFilters,
                                    hasDescription: e.target.checked ? true : null,
                                  })
                                }
                                className="w-3 h-3 rounded"
                              />
                              Has Description
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={advancedFilters.hasEmotional === true}
                                onChange={(e) =>
                                  setAdvancedFilters({
                                    ...advancedFilters,
                                    hasEmotional: e.target.checked ? true : null,
                                  })
                                }
                                className="w-3 h-3 rounded"
                              />
                              Has Emotional Analysis
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={advancedFilters.hasHistorical === true}
                                onChange={(e) =>
                                  setAdvancedFilters({
                                    ...advancedFilters,
                                    hasHistorical: e.target.checked ? true : null,
                                  })
                                }
                                className="w-3 h-3 rounded"
                              />
                              Has Historical Context
                            </label>
                          </div>
                        </div>

                        {/* Date Range */}
                        <div>
                          <label className="block text-xs text-gray-400 mb-2">Analysis Date Range</label>
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={advancedFilters.dateFrom}
                              onChange={(e) =>
                                setAdvancedFilters({ ...advancedFilters, dateFrom: e.target.value })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                            <input
                              type="date"
                              value={advancedFilters.dateTo}
                              onChange={(e) =>
                                setAdvancedFilters({ ...advancedFilters, dateTo: e.target.value })
                              }
                              className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Sort Menu */}
                <div className="relative" ref={sortMenuRef}>
                  <button
                    onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm hover:bg-gray-700 transition flex items-center gap-1"
                    title="Sort tracks"
                    aria-label="Sort tracks"
                  >
                    <FaSort />
                    {sortConfig.primary !== 'default' && (
                      <span className="text-xs text-purple-400">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                  {isSortMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-[500px] overflow-y-auto">
                      <div className="p-2">
                        <div className="text-xs text-gray-400 px-2 py-1 mb-1">Multi-Level Sort</div>
                        
                        {/* Primary Sort */}
                        <div className="mb-2">
                          <div className="text-xs text-gray-500 px-2 py-1">Primary</div>
                          {(['default', 'title', 'artist', 'bpm', 'status', 'updated', 'genre', 'key', 'energy', 'danceability'] as SortField[]).map((field) => (
                            <button
                              key={field}
                              onClick={() => handleSort(field, 'primary')}
                              className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-700 transition flex items-center justify-between ${
                                sortConfig.primary === field ? 'text-purple-400 bg-gray-700/50' : 'text-gray-300'
                              }`}
                            >
                              <span className="capitalize text-xs">{field === 'default' ? 'Default' : field}</span>
                              {sortConfig.primary === field && (
                                <span className="text-purple-400 text-xs">
                                  {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Secondary Sort */}
                        {sortConfig.primary !== 'default' && (
                          <>
                            <div className="border-t border-gray-700 my-2"></div>
                            <div className="mb-2">
                              <div className="flex items-center justify-between text-xs text-gray-500 px-2 py-1">
                                <span>Secondary</span>
                                {sortConfig.secondary && (
                                  <button
                                    onClick={() => clearSort('secondary')}
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    <FaTimes className="text-xs" />
                                  </button>
                                )}
                              </div>
                              {(['title', 'artist', 'bpm', 'genre', 'key'] as SortField[]).map((field) => (
                                <button
                                  key={field}
                                  onClick={() => handleSort(field, 'secondary')}
                                  className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-700 transition flex items-center justify-between ${
                                    sortConfig.secondary === field ? 'text-purple-400 bg-gray-700/50' : 'text-gray-300'
                                  }`}
                                >
                                  <span className="capitalize text-xs">{field}</span>
                                  {sortConfig.secondary === field && <span className="text-purple-400 text-xs">✓</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Tertiary Sort */}
                        {sortConfig.secondary && (
                          <>
                            <div className="border-t border-gray-700 my-2"></div>
                            <div>
                              <div className="flex items-center justify-between text-xs text-gray-500 px-2 py-1">
                                <span>Tertiary</span>
                                {sortConfig.tertiary && (
                                  <button
                                    onClick={() => clearSort('tertiary')}
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    <FaTimes className="text-xs" />
                                  </button>
                                )}
                              </div>
                              {(['title', 'artist', 'bpm'] as SortField[]).map((field) => (
                                <button
                                  key={field}
                                  onClick={() => handleSort(field, 'tertiary')}
                                  className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-700 transition flex items-center justify-between ${
                                    sortConfig.tertiary === field ? 'text-purple-400 bg-gray-700/50' : 'text-gray-300'
                                  }`}
                                >
                                  <span className="capitalize text-xs">{field}</span>
                                  {sortConfig.tertiary === field && <span className="text-purple-400 text-xs">✓</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {sortConfig.primary !== 'default' && (
                          <>
                            <div className="border-t border-gray-700 my-2"></div>
                            <button
                              onClick={() =>
                                setSortConfig((prev) => ({
                                  ...prev,
                                  direction: prev.direction === 'asc' ? 'desc' : 'asc',
                                }))
                              }
                              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-700 transition text-gray-300"
                            >
                              {sortConfig.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Presets Menu */}
                <div className="relative" ref={presetMenuRef}>
                  <button
                    onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm hover:bg-gray-700 transition"
                    title="Saved presets"
                  >
                    <FaBookmark />
                  </button>
                  {isPresetMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
                      <div className="p-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-gray-400 px-2 py-1">Saved Presets</div>
                          <button
                            onClick={() => {
                              const name = prompt('Preset name:')
                              if (name) saveCurrentAsPreset(name)
                            }}
                            className="text-xs text-purple-400 hover:text-purple-300"
                          >
                            Save Current
                          </button>
                        </div>
                        {filterPresets.length === 0 ? (
                          <div className="text-xs text-gray-500 px-2 py-4 text-center">No presets saved</div>
                        ) : (
                          filterPresets.map((preset) => (
                            <div
                              key={preset.id}
                              className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-700 rounded group"
                            >
                              <button
                                onClick={() => loadPreset(preset)}
                                className="flex-1 text-left text-sm text-gray-300 hover:text-white"
                              >
                                {preset.name}
                              </button>
                              <button
                                onClick={() => deletePreset(preset.id)}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition"
                              >
                                <FaTrash className="text-xs" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Column Visibility Menu */}
                <div className="relative" ref={columnMenuRef}>
                  <button
                    onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm hover:bg-gray-700 transition"
                    title="Toggle columns"
                    aria-label="Toggle column visibility"
                  >
                    <FaColumns />
                  </button>
                  {isColumnMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                      <div className="p-2">
                        <div className="text-xs text-gray-400 px-2 py-1 mb-1">Show Columns</div>
                        {Object.entries(visibleColumns).map(([key, visible]) => (
                          <label
                            key={key}
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-700 transition cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={(e) =>
                                setVisibleColumns((prev) => ({ ...prev, [key]: e.target.checked }))
                              }
                              className="w-4 h-4 rounded"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-gray-300 capitalize">{key}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Statistics Toggle */}
                <button
                  onClick={() => setIsStatsOpen(!isStatsOpen)}
                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm hover:bg-gray-700 transition"
                  title="Statistics dashboard"
                >
                  <FaChartBar />
                </button>
              </div>
            </div>

            {/* Status Summary */}
            <div className="text-xs text-gray-400 mb-4 space-y-1 p-2 bg-gray-800/50 rounded">
              <div className="flex justify-between">
                <span>✅ Completed:</span>
                <span className="text-green-400">{tracksWithDNA.length}</span>
              </div>
              <div className="flex justify-between">
                <span>⏳ Processing:</span>
                <span className="text-yellow-400">{tracksProcessing.length}</span>
              </div>
              <div className="flex justify-between">
                <span>⏸️ Pending:</span>
                <span className="text-red-400">{tracksPending.length}</span>
              </div>
            </div>

            {/* Bulk Selection */}
            {filteredTracks.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTracks.size === filteredTracks.length && filteredTracks.length > 0}
                          onChange={toggleAllTracks}
                          className="w-4 h-4 rounded"
                          aria-label="Select all tracks"
                        />
                <span className="text-sm text-gray-400">
                  Select all ({selectedTracks.size} selected)
                </span>
              </div>
            )}

            {/* Tracks List - Different Views */}
            {viewMode === 'table' ? (
              <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-800 z-10">
                    <tr className="border-b border-gray-700">
                      <th className="px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={selectedTracks.size === filteredTracks.length && filteredTracks.length > 0}
                          onChange={toggleAllTracks}
                          className="w-4 h-4 rounded"
                          aria-label="Select all tracks"
                        />
                      </th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Title</th>
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Artist</th>
                      {visibleColumns.bpm && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">BPM</th>
                      )}
                      {visibleColumns.genre && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Genre</th>
                      )}
                      {visibleColumns.key && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Key</th>
                      )}
                      {visibleColumns.energy && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Energy</th>
                      )}
                      {visibleColumns.danceability && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Dance</th>
                      )}
                      {visibleColumns.status && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Status</th>
                      )}
                      {visibleColumns.quality && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Quality</th>
                      )}
                      {visibleColumns.completeness && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Completeness</th>
                      )}
                      {visibleColumns.tags && (
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">Tags</th>
                      )}
                      <th className="px-3 py-2 text-left text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTracks.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                          No tracks found
                        </td>
                      </tr>
                    ) : (
                      filteredTracks.map((track) => {
                        const status = track.sonic_dna_status || 'pending'
                        const statusColor =
                          status === 'completed'
                            ? 'text-green-400'
                            : status === 'processing'
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        const isSelected = selectedTrack?.id === track.id
                        const isChecked = selectedTracks.has(track.id)
                        const qualityScore = getTrackQualityScore(track)
                        const completeness = getTrackCompleteness(track)
                        const warnings = getTrackValidationWarnings(track)

                        return (
                          <tr
                            key={track.id}
                            className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition ${
                              isSelected ? 'bg-purple-900/20' : ''
                            }`}
                            onClick={() => handleEditTrack(track.id)}
                            onContextMenu={(e) => handleContextMenu(e, track)}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  toggleTrackSelection(track.id)
                                }}
                                className="w-4 h-4 rounded"
                                aria-label={`Select ${track.title || track.file_name || 'track'}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{track.title || track.file_name || 'Untitled'}</div>
                            </td>
                            <td className="px-3 py-2 text-gray-400">{track.artist || 'Unknown'}</td>
                            {visibleColumns.bpm && (
                              <td className="px-3 py-2 text-gray-400">{track.bpm || '-'}</td>
                            )}
                            {visibleColumns.genre && (
                              <td className="px-3 py-2 text-gray-400">{getTrackGenre(track) || '-'}</td>
                            )}
                            {visibleColumns.key && (
                              <td className="px-3 py-2 text-gray-400">{getTrackKey(track) || '-'}</td>
                            )}
                            {visibleColumns.energy && (
                              <td className="px-3 py-2 text-gray-400">
                                {getTrackEnergy(track) > 0 ? (getTrackEnergy(track) * 100).toFixed(0) + '%' : '-'}
                              </td>
                            )}
                            {visibleColumns.danceability && (
                              <td className="px-3 py-2 text-gray-400">
                                {getTrackDanceability(track) > 0
                                  ? (getTrackDanceability(track) * 100).toFixed(0) + '%'
                                  : '-'}
                              </td>
                            )}
                            {visibleColumns.status && (
                              <td className="px-3 py-2">
                                <span className={`font-medium ${statusColor}`}>{status}</span>
                              </td>
                            )}
                            {visibleColumns.quality && (
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs ${
                                      qualityScore >= 80
                                        ? 'text-green-400'
                                        : qualityScore >= 50
                                          ? 'text-yellow-400'
                                          : 'text-red-400'
                                    }`}
                                  >
                                    {qualityScore}%
                                  </span>
                                  {warnings.length > 0 && (
                                    <FaExclamationTriangle className="text-yellow-400 text-xs" title={warnings.join(', ')} />
                                  )}
                                </div>
                              </td>
                            )}
                            {visibleColumns.completeness && status === 'completed' && (
                              <td className="px-3 py-2">
                                {(() => {
                                  const completeness = getTrackCompleteness(track)
                                  return (
                                    <span
                                      className={`text-xs ${
                                        completeness.percentage >= 80
                                          ? 'text-green-400'
                                          : completeness.percentage >= 50
                                            ? 'text-yellow-400'
                                            : 'text-orange-400'
                                      }`}
                                      title={`${completeness.filled}/${completeness.total} fields. Missing: ${completeness.missingFields.slice(0, 3).join(', ')}${completeness.missingFields.length > 3 ? '...' : ''}`}
                                    >
                                      {completeness.percentage}%
                                    </span>
                                  )
                                })()}
                              </td>
                            )}
                            {visibleColumns.completeness && status !== 'completed' && (
                              <td className="px-3 py-2 text-gray-500 text-xs">-</td>
                            )}
                            {visibleColumns.tags && (
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {getTrackTags(track.id).map((tag, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.5 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-300"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {status !== 'processing' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRegenerateTrack(track.id)
                                    }}
                                    className="text-purple-400 hover:text-purple-300 transition"
                                    title="Regenerate"
                                  >
                                    <FaSync className="text-xs" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleContextMenu(e, track)
                                  }}
                                  className="text-gray-400 hover:text-white transition"
                                  title="More options"
                                >
                                  <FaEllipsisV className="text-xs" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[700px] overflow-y-auto custom-scrollbar">
                {filteredTracks.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-gray-400">No tracks found</div>
                ) : (
                  filteredTracks.map((track) => {
                    const status = track.sonic_dna_status || 'pending'
                    const statusColor =
                      status === 'completed'
                        ? 'text-green-400'
                        : status === 'processing'
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    const isSelected = selectedTrack?.id === track.id
                    const isChecked = selectedTracks.has(track.id)
                    const qualityScore = getTrackQualityScore(track)
                    const completeness = getTrackCompleteness(track)

                    return (
                      <div
                        key={track.id}
                        className={`bg-gray-800/50 border rounded-lg p-4 cursor-pointer transition ${
                          isSelected
                            ? 'border-purple-500 bg-purple-900/20 shadow-lg shadow-purple-500/20'
                            : 'border-gray-700 hover:border-purple-500/50'
                        }`}
                        onClick={() => handleEditTrack(track.id)}
                        onContextMenu={(e) => handleContextMenu(e, track)}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleTrackSelection(track.id)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 w-4 h-4 rounded flex-shrink-0"
                            aria-label={`Select ${track.title || track.file_name || 'track'}`}
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold truncate mb-1">
                              {track.title || track.file_name || 'Untitled'}
                            </h3>
                            <p className="text-xs text-gray-400 truncate mb-2">{track.artist || 'Unknown'}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`font-medium ${statusColor}`}>{status}</span>
                              {visibleColumns.bpm && (
                                <span className="text-gray-500">BPM: {getTrackBpm(track)}</span>
                              )}
                              {visibleColumns.genre && getTrackGenre(track) && (
                                <span className="text-gray-500">{getTrackGenre(track)}</span>
                              )}
                              {visibleColumns.quality && (
                                <span
                                  className={
                                    qualityScore >= 80
                                      ? 'text-green-400'
                                      : qualityScore >= 50
                                        ? 'text-yellow-400'
                                        : 'text-red-400'
                                  }
                                  title="Quality Score"
                                >
                                  Q: {qualityScore}%
                                </span>
                              )}
                              {status === 'completed' && (
                                <span
                                  className={
                                    completeness.percentage >= 80
                                      ? 'text-green-400'
                                      : completeness.percentage >= 50
                                        ? 'text-yellow-400'
                                        : 'text-orange-400'
                                  }
                                  title={`Completeness: ${completeness.filled}/${completeness.total} fields filled. Missing: ${completeness.missingFields.slice(0, 3).join(', ')}${completeness.missingFields.length > 3 ? '...' : ''}`}
                                >
                                  {completeness.percentage}% complete
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[700px] overflow-y-auto custom-scrollbar">
                {filteredTracks.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No tracks found</div>
                ) : (
                  filteredTracks.map((track) => {
                  const status = track.sonic_dna_status || 'pending'
                  const statusColor =
                    status === 'completed'
                      ? 'text-green-400'
                      : status === 'processing'
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  const isSelected = selectedTrack?.id === track.id
                  const isChecked = selectedTracks.has(track.id)
                  const qualityScore = getTrackQualityScore(track)
                  const completeness = getTrackCompleteness(track)

                  return (
                    <div
                      key={track.id}
                      className={`bg-gray-800/50 border rounded-lg p-3 cursor-pointer transition ${
                        isSelected
                          ? 'border-purple-500 bg-purple-900/20 shadow-lg shadow-purple-500/20'
                          : 'border-gray-700 hover:border-purple-500/50'
                      }`}
                      onClick={() => handleEditTrack(track.id)}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation()
                            toggleTrackSelection(track.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 w-4 h-4 rounded flex-shrink-0"
                          aria-label={`Select ${track.title || track.file_name || 'track'}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold truncate">
                                {track.title || track.file_name || 'Untitled'}
                              </h3>
                              <p className="text-xs text-gray-400 truncate">{track.artist || 'Unknown'}</p>
                            </div>
                            {status !== 'processing' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRegenerateTrack(track.id)
                                }}
                                className="text-purple-400 hover:text-purple-300 transition flex-shrink-0"
                                title="Regenerate"
                              >
                                <FaSync className="text-xs" />
                              </button>
                            )}
                          </div>
                          
                          {/* Metadata Row */}
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                            <span className={`font-medium ${statusColor}`}>{status}</span>
                            
                            {visibleColumns.bpm && (
                              <span className="text-gray-500">BPM: {getTrackBpm(track)}</span>
                            )}
                            
                            {visibleColumns.genre && getTrackGenre(track) && (
                              <span className="text-gray-500">Genre: {getTrackGenre(track)}</span>
                            )}
                            
                            {visibleColumns.key && getTrackKey(track) && (
                              <span className="text-gray-500">Key: {getTrackKey(track)}</span>
                            )}
                            
                            {visibleColumns.energy && getTrackEnergy(track) > 0 && (
                              <span className="text-gray-500">
                                Energy: {(getTrackEnergy(track) * 100).toFixed(0)}%
                              </span>
                            )}

                            {visibleColumns.quality && status === 'completed' && (
                              <span
                                className={
                                  qualityScore >= 80
                                    ? 'text-green-400'
                                    : qualityScore >= 50
                                      ? 'text-yellow-400'
                                      : 'text-red-400'
                                }
                                title="Quality Score"
                              >
                                Q: {qualityScore}%
                              </span>
                            )}

                            {status === 'completed' && (
                              <span
                                className={
                                  completeness.percentage >= 80
                                    ? 'text-green-400'
                                    : completeness.percentage >= 50
                                      ? 'text-yellow-400'
                                      : 'text-orange-400'
                                }
                                title={`Completeness: ${completeness.filled}/${completeness.total} fields filled. Missing: ${completeness.missingFields.slice(0, 3).join(', ')}${completeness.missingFields.length > 3 ? '...' : ''}`}
                              >
                                {completeness.percentage}% complete
                              </span>
                            )}
                            
                            {visibleColumns.danceability && getTrackDanceability(track) > 0 && (
                              <span className="text-gray-500">
                                Dance: {(getTrackDanceability(track) * 100).toFixed(0)}%
                              </span>
                            )}
                            
                            {visibleColumns.status && track.sonic_dna_analyzed_at && (
                              <span className="text-gray-500 text-[10px]">
                                {new Date(track.sonic_dna_analyzed_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            )}

            {/* Textarea Context Menu */}
            {isTextareaContextMenuOpen && textareaContextMenuFieldPath && selectedTrack && (
              <div
                ref={textareaContextMenuRef}
                className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 min-w-[200px]"
                style={{
                  left: `${textareaContextMenuPosition.x}px`,
                  top: `${textareaContextMenuPosition.y}px`,
                  zIndex: 99999,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => handleSmartAutofill(textareaContextMenuFieldPath)}
                  disabled={autofillingField === textareaContextMenuFieldPath.join('.')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {autofillingField === textareaContextMenuFieldPath.join('.') ? (
                    <>
                      <FaSpinner className="animate-spin" /> Autofilling...
                    </>
                  ) : (
                    <>
                      <FaSync /> Autofill with AI
                    </>
                  )}
                </button>
                <div className="border-t border-gray-700 my-1"></div>
                <button
                  onClick={() => {
                    const textarea = document.querySelector(`textarea[data-field-path="${JSON.stringify(textareaContextMenuFieldPath)}"]`) as HTMLTextAreaElement
                    if (textarea) {
                      textarea.select()
                      document.execCommand('copy')
                      showToast('Field path copied to clipboard', 'success')
                    }
                    setIsTextareaContextMenuOpen(false)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
                >
                  <FaCopy /> Copy Field Path
                </button>
              </div>
            )}

            {/* Context Menu */}
            {isContextMenuOpen && contextMenuTrack && (
              <div
                ref={contextMenuRef}
                className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 min-w-[200px]"
                style={{
                  left: `${contextMenuPosition.x}px`,
                  top: `${contextMenuPosition.y}px`,
                  zIndex: 99999,
                }}
              >
                <button
                  onClick={() => {
                    handleEditTrack(contextMenuTrack.id)
                    setIsContextMenuOpen(false)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
                >
                  <FaEdit />
                  Edit Track
                </button>
                <button
                  onClick={() => {
                    handleRegenerateTrack(contextMenuTrack.id)
                    setIsContextMenuOpen(false)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
                >
                  <FaSync />
                  Regenerate
                </button>
                <button
                  onClick={() => {
                    const tag = prompt('Enter tag name:')
                    if (tag) {
                      addTagToTrack(contextMenuTrack.id, tag)
                      setIsContextMenuOpen(false)
                    }
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
                >
                  <FaTags />
                  Add Tag
                </button>
                <div className="border-t border-gray-700 my-1"></div>
                <button
                  onClick={() => {
                    toggleTrackSelection(contextMenuTrack.id)
                    setIsContextMenuOpen(false)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
                >
                  {selectedTracks.has(contextMenuTrack.id) ? <FaCheckSquare /> : <FaSquare />}
                  {selectedTracks.has(contextMenuTrack.id) ? 'Deselect' : 'Select'}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenuTrack.id)
                    showToast('Track ID copied to clipboard', 'success')
                    setIsContextMenuOpen(false)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition flex items-center gap-2"
                >
                  <FaCopy />
                  Copy Track ID
                </button>
              </div>
            )}
          </div>

          {/* Editor Panel */}
          <div className="lg:col-span-2">
            {selectedTrack && editingDNA ? (
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedTrack.title}</h2>
                    <p className="text-gray-400 text-sm mb-3">{selectedTrack.artist}</p>
                    
                    {/* Enriched Data Badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <BpmBadge bpm={getTrackBpm(selectedTrack)} size="sm" />
                      <KeyBadge keySignature={getTrackKey(selectedTrack)} size="sm" />
                      <EnergyBadge energy={getTrackEnergy(selectedTrack)} size="sm" />
                      <GenreBadge genre={getTrackGenre(selectedTrack)} size="sm" />
                      {getTrackDnaMatchScore(selectedTrack) && (
                        <DnaMatchScoreBadge score={getTrackDnaMatchScore(selectedTrack)} size="sm" />
                      )}
                    </div>
                    
                    {/* Secondary Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {getTrackSubgenre(selectedTrack) && (
                        <SubgenreBadge subgenre={getTrackSubgenre(selectedTrack)} size="xs" />
                      )}
                      {getTrackMood(selectedTrack) && (
                        <MoodBadge mood={getTrackMood(selectedTrack)} size="xs" />
                      )}
                      {getTrackDrumStyle(selectedTrack) && (
                        <DrumStyleBadge drumStyle={getTrackDrumStyle(selectedTrack)} size="xs" />
                      )}
                      {getTrackProductionEra(selectedTrack) && (
                        <ProductionEraBadge era={getTrackProductionEra(selectedTrack)} size="xs" />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAnalyzeAndAutofill}
                      disabled={analyzing}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
                      title="Analyze and autofill all fields using Sonic DNA AI"
                    >
                      {analyzing ? (
                        <>
                          <FaSpinner className="animate-spin" /> Analyzing...
                        </>
                      ) : (
                        <>
                          <FaSync /> Analyze & Autofill
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleExport}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
                      title="Export JSON"
                    >
                      <FaDownload /> Export JSON
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
                      title="Export PDF Report"
                    >
                      <FaFileExport /> Export PDF
                    </button>
                    <button
                      onClick={handleSaveDNA}
                      disabled={saving}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
                    >
                      <FaSave /> {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTrack(null)
                        setEditingDNA(null)
                        setSelectedTracks(new Set())
                        setIsPlaying(false)
                        setAudioUrl(null)
                      }}
                      className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition"
                      title="Close editor"
                      aria-label="Close editor"
                    >
                      <FaTimes />
                    </button>
                  </div>
                </div>

                {/* Audio Player */}
                {selectedTrack && (
                  <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-sm border border-purple-700/50 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-4">
                      {/* Play/Pause Button */}
                      <button
                        onClick={togglePlay}
                        disabled={!audioUrl || isLoadingAudio}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:opacity-50 text-white w-12 h-12 rounded-full flex items-center justify-center transition flex-shrink-0"
                        title={isPlaying ? 'Pause' : 'Play'}
                        aria-label={isPlaying ? 'Pause track' : 'Play track'}
                      >
                        {isLoadingAudio ? (
                          <FaSpinner className="animate-spin" />
                        ) : isPlaying ? (
                          <FaPause />
                        ) : (
                          <FaPlay className="ml-1" />
                        )}
                      </button>

                      {/* Track Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {selectedTrack.title || 'Unknown Track'}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {selectedTrack.artist || 'Unknown Artist'}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="flex-1 min-w-0 max-w-md">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-400 tabular-nums">
                            {formatTime(currentTime)}
                          </span>
                          <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            value={currentTime}
                            onChange={handleSeek}
                            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            style={{
                              background: `linear-gradient(to right, rgb(147, 51, 234) 0%, rgb(147, 51, 234) ${
                                duration ? (currentTime / duration) * 100 : 0
                              }%, rgb(55, 65, 81) ${
                                duration ? (currentTime / duration) * 100 : 0
                              }%, rgb(55, 65, 81) 100%)`,
                            }}
                            aria-label="Seek track"
                          />
                          <span className="text-xs text-gray-400 tabular-nums">
                            {formatTime(duration)}
                          </span>
                        </div>
                      </div>

                      {/* Volume Control */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleMute}
                          className="text-gray-400 hover:text-white transition"
                          title={isMuted ? 'Unmute' : 'Mute'}
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                          style={{
                            background: `linear-gradient(to right, rgb(147, 51, 234) 0%, rgb(147, 51, 234) ${
                              (isMuted ? 0 : volume) * 100
                            }%, rgb(55, 65, 81) ${
                              (isMuted ? 0 : volume) * 100
                            }%, rgb(55, 65, 81) 100%)`,
                          }}
                          aria-label="Volume control"
                        />
                      </div>
                    </div>

                    {/* Hidden Audio Element */}
                    {audioUrl && (
                      <audio
                        ref={audioElementRef}
                        src={audioUrl}
                        preload="metadata"
                        onLoadedMetadata={() => {
                          const audio = audioElementRef.current
                          if (audio) {
                            setDuration(audio.duration || 0)
                          }
                        }}
                      />
                    )}

                    {!audioUrl && !isLoadingAudio && (
                      <div className="text-xs text-yellow-400 mt-2 text-center">
                        Audio file not available for this track
                      </div>
                    )}
                  </div>
                )}

                {/* Enriched Track Info Panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Track Description */}
                  {getTrackDescription(selectedTrack) && (
                    <div className="bg-gray-800/30 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Description
                      </h4>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {getTrackDescription(selectedTrack)}
                      </p>
                    </div>
                  )}
                  
                  {/* Mixing Recommendations */}
                  {getTrackMixingRecommendations(selectedTrack) && (
                    <MixingRecommendations
                      bpmRange={getTrackMixingRecommendations(selectedTrack)?.bpmRange}
                      compatibleKeys={getTrackMixingRecommendations(selectedTrack)?.compatibleKeys}
                      mixableGenres={getTrackMixingRecommendations(selectedTrack)?.mixableGenres}
                    />
                  )}
                  
                  {/* Instrument Signatures */}
                  {getTrackInstruments(selectedTrack) && getTrackInstruments(selectedTrack)!.length > 0 && (
                    <div className="bg-gray-800/30 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span>🎹</span> Instrument Signatures
                      </h4>
                      <InstrumentSignatures instruments={getTrackInstruments(selectedTrack)} size="sm" max={6} />
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700 pb-2">
                  {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id)
                          if (!expandedSections.has(tab.id)) {
                            setExpandedSections((prev) => new Set([...Array.from(prev), tab.id]))
                          }
                        }}
                        className={`px-4 py-2 rounded-lg transition flex items-center gap-2 text-sm ${
                          activeTab === tab.id
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        <Icon className="text-xs" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {/* Tab Content */}
                <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
                  {/* Read Report Tab - Full Analysis Report */}
                  {activeTab === 'read-report' && (
                    <div className="space-y-6 prose prose-invert max-w-none">
                      {/* Track Description */}
                      {description && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-3 text-purple-400 flex items-center gap-2">
                            <FaMusic className="text-sm" />
                            Track Description
                          </h3>
                          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{description}</p>
                        </div>
                      )}

                      {/* Intention */}
                      {intention && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-3 text-purple-400 flex items-center gap-2">
                            <FaMusic className="text-sm" />
                            Intention
                          </h3>
                          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{intention}</p>
                        </div>
                      )}

                      {/* Emotional Analysis */}
                      {(emotional.emotionalJourney || emotional.psychologicalProfile || emotional.primaryEmotions?.length > 0) && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-4 text-pink-400 flex items-center gap-2">
                            <FaHeart className="text-sm" />
                            Emotional Analysis
                          </h3>
                          {emotional.primaryEmotions && emotional.primaryEmotions.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Primary Emotions</h4>
                              <div className="flex flex-wrap gap-2">
                                {emotional.primaryEmotions.map((emotion: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-pink-900/30 border border-pink-700/50 rounded-full text-sm text-pink-300"
                                  >
                                    {emotion}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {emotional.emotionalJourney && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Emotional Journey</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {emotional.emotionalJourney}
                              </p>
                            </div>
                          )}
                          {emotional.psychologicalProfile && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Psychological Profile</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {emotional.psychologicalProfile}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Musical Analysis */}
                      {(musical.harmonicComplexity || musical.rhythmicPatterns || musical.instrumentation?.length > 0) && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-4 text-blue-400 flex items-center gap-2">
                            <FaMusic className="text-sm" />
                            Musical Analysis
                          </h3>
                          {musical.keySignature && (
                            <div className="mb-4">
                              <span className="text-sm text-gray-400">Key: </span>
                              <span className="text-sm text-gray-300 font-medium">{musical.keySignature}</span>
                              {musical.timeSignature && (
                                <>
                                  <span className="text-sm text-gray-400 mx-2">•</span>
                                  <span className="text-sm text-gray-400">Time: </span>
                                  <span className="text-sm text-gray-300 font-medium">{musical.timeSignature}</span>
                                </>
                              )}
                              {musical.scale && (
                                <>
                                  <span className="text-sm text-gray-400 mx-2">•</span>
                                  <span className="text-sm text-gray-400">Scale: </span>
                                  <span className="text-sm text-gray-300 font-medium">{musical.scale}</span>
                                </>
                              )}
                            </div>
                          )}
                          {musical.harmonicComplexity && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Harmonic Complexity</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {musical.harmonicComplexity}
                              </p>
                            </div>
                          )}
                          {musical.rhythmicPatterns && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Rhythmic Patterns</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {musical.rhythmicPatterns}
                              </p>
                            </div>
                          )}
                          {musical.instrumentation && musical.instrumentation.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Instrumentation</h4>
                              <ul className="list-disc list-inside text-gray-300 space-y-1">
                                {musical.instrumentation.map((instrument: string, idx: number) => (
                                  <li key={idx}>{instrument}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Technical Analysis */}
                      {technical.technicalDescription && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-3 text-yellow-400 flex items-center gap-2">
                            <FaCog className="text-sm" />
                            Technical Analysis
                          </h3>
                          <div className="mb-4 flex flex-wrap gap-4 text-sm">
                            {technical.bpm && (
                              <div>
                                <span className="text-gray-400">BPM: </span>
                                <span className="text-gray-300 font-medium">{technical.bpm}</span>
                              </div>
                            )}
                            {technical.energyLevel !== undefined && (
                              <div>
                                <span className="text-gray-400">Energy: </span>
                                <span className="text-gray-300 font-medium">
                                  {(technical.energyLevel * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                            {technical.danceability !== undefined && (
                              <div>
                                <span className="text-gray-400">Danceability: </span>
                                <span className="text-gray-300 font-medium">
                                  {(technical.danceability * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {technical.technicalDescription}
                          </p>
                        </div>
                      )}

                      {/* Drum Pattern Analysis */}
                      {(drums.patternRecognition || drums.patternType) && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-4 text-orange-400 flex items-center gap-2">
                            <FaMusic className="text-sm" />
                            Drum Pattern Analysis
                          </h3>
                          {drums.patternType && (
                            <div className="mb-4">
                              <span className="text-sm text-gray-400">Pattern Type: </span>
                              <span className="text-sm text-gray-300 font-medium">{drums.patternType}</span>
                            </div>
                          )}
                          {drums.patternRecognition && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Pattern Recognition</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {drums.patternRecognition}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Genre Analysis */}
                      {(genres.genreFusion || genres.genreEvolution || genres.primaryGenres?.length > 0) && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-4 text-green-400 flex items-center gap-2">
                            <FaTags className="text-sm" />
                            Genre Analysis
                          </h3>
                          {genres.primaryGenres && genres.primaryGenres.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Primary Genres</h4>
                              <div className="flex flex-wrap gap-2">
                                {genres.primaryGenres.map((genre: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-green-900/30 border border-green-700/50 rounded-full text-sm text-green-300"
                                  >
                                    {genre}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {genres.genreFusion && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Genre Fusion</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{genres.genreFusion}</p>
                            </div>
                          )}
                          {genres.genreEvolution && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Genre Evolution</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {genres.genreEvolution}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Historical Context */}
                      {historical.historicalContext && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-3 text-amber-400 flex items-center gap-2">
                            <FaHistory className="text-sm" />
                            Historical Context
                          </h3>
                          {historical.eraInfluences && historical.eraInfluences.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Era Influences</h4>
                              <ul className="list-disc list-inside text-gray-300 space-y-1">
                                {historical.eraInfluences.map((era: string, idx: number) => (
                                  <li key={idx}>{era}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {historical.historicalContext}
                          </p>
                        </div>
                      )}

                      {/* Regional & Cultural Analysis */}
                      {(regional.regionalCharacteristics || cultural.description) && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-4 text-cyan-400 flex items-center gap-2">
                            <FaGlobe className="text-sm" />
                            Regional & Cultural Analysis
                          </h3>
                          {regional.primaryRegions && regional.primaryRegions.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Primary Regions</h4>
                              <div className="flex flex-wrap gap-2">
                                {regional.primaryRegions.map((region: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1 bg-cyan-900/30 border border-cyan-700/50 rounded-full text-sm text-cyan-300"
                                  >
                                    {region}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {regional.regionalCharacteristics && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Regional Characteristics</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {regional.regionalCharacteristics}
                              </p>
                            </div>
                          )}
                          {cultural.description && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Cultural Description</h4>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {cultural.description}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Musicology */}
                      {musicology.description && (
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <h3 className="text-xl font-semibold mb-3 text-indigo-400 flex items-center gap-2">
                            <FaMusic className="text-sm" />
                            Musicology
                          </h3>
                          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {musicology.description}
                          </p>
                        </div>
                      )}

                      {/* Summary */}
                      {summary && (
                        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg p-6 border border-purple-700/50">
                          <h3 className="text-xl font-semibold mb-3 text-purple-300 flex items-center gap-2">
                            <FaMusic className="text-sm" />
                            Summary
                          </h3>
                          <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-lg">{summary}</p>
                        </div>
                      )}

                      {/* Empty State */}
                      {!description &&
                        !intention &&
                        !emotional.emotionalJourney &&
                        !musical.harmonicComplexity &&
                        !technical.technicalDescription &&
                        !drums.patternRecognition &&
                        !genres.genreFusion &&
                        !historical.historicalContext &&
                        !regional.regionalCharacteristics &&
                        !cultural.description &&
                        !musicology.description &&
                        !summary && (
                          <div className="text-center py-12 text-gray-400">
                            <FaMusic className="text-4xl mx-auto mb-4 opacity-50" />
                            <p>No analysis report available for this track.</p>
                            <p className="text-sm mt-2">Generate Sonic DNA to see the full analysis report.</p>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Overview Tab */}
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      <Section
                        title="Quick Stats"
                        expanded={expandedSections.has('overview-stats')}
                        onToggle={() => toggleSection('overview-stats')}
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <Field
                            label="BPM"
                            value={technical.bpm || ''}
                            onChange={(v) => updateDNAField(['technical', 'bpm'], parseFloat(v) || null)}
                            type="number"
                          />
                          <Field
                            label="Energy Level"
                            value={technical.energyLevel || ''}
                            onChange={(v) =>
                              updateDNAField(['technical', 'energyLevel'], parseFloat(v) || null)
                            }
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                          />
                          <Field
                            label="Danceability"
                            value={technical.danceability || ''}
                            onChange={(v) =>
                              updateDNAField(['technical', 'danceability'], parseFloat(v) || null)
                            }
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                          />
                          <Field
                            label="Key Signature"
                            value={musical.keySignature || ''}
                            onChange={(v) => updateDNAField(['musical', 'keySignature'], v)}
                          />
                          <Field
                            label="Time Signature"
                            value={musical.timeSignature || technical.timeSignature || ''}
                            onChange={(v) => {
                              updateDNAField(['musical', 'timeSignature'], v)
                              updateDNAField(['technical', 'timeSignature'], v)
                            }}
                          />
                        </div>
                      </Section>
                    </div>
                  )}

                  {/* Description Tab */}
                  {activeTab === 'description' && (
                    <div className="space-y-4">
                      <Field
                        label="Track Description"
                        value={description}
                        onChange={(v) => updateDNAField(['description'], v)}
                        type="textarea"
                        rows={8}
                        placeholder="Comprehensive track description..."
                        onAutofill={() => handleAutofillField(['description'])}
                        autofilling={autofillingField === 'description'}
                        fieldPath={['description']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Intention"
                        value={intention}
                        onChange={(v) => updateDNAField(['intention'], v)}
                        type="textarea"
                        rows={4}
                        placeholder="What is the intention/purpose of this music?"
                        onAutofill={() => handleAutofillField(['intention'])}
                        autofilling={autofillingField === 'intention'}
                        fieldPath={['intention']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                    </div>
                  )}

                  {/* Emotional Tab */}
                  {activeTab === 'emotional' && (
                    <div className="space-y-4">
                      <ArrayField
                        label="Primary Emotions"
                        values={emotional.primaryEmotions || []}
                        onAdd={() => addToDNAArray(['emotional', 'primaryEmotions'])}
                        onRemove={(i) => removeFromDNAArray(['emotional', 'primaryEmotions'], i)}
                        onUpdate={(i, v) => updateDNAArray(['emotional', 'primaryEmotions'], i, v)}
                      />
                      <Field
                        label="Emotional Journey"
                        value={emotional.emotionalJourney || ''}
                        onChange={(v) => updateDNAField(['emotional', 'emotionalJourney'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['emotional', 'emotionalJourney'])}
                        autofilling={autofillingField === 'emotional.emotionalJourney'}
                        fieldPath={['emotional', 'emotionalJourney']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Psychological Profile"
                        value={emotional.psychologicalProfile || ''}
                        onChange={(v) => updateDNAField(['emotional', 'psychologicalProfile'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['emotional', 'psychologicalProfile'])}
                        autofilling={autofillingField === 'emotional.psychologicalProfile'}
                        fieldPath={['emotional', 'psychologicalProfile']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Mood Transitions"
                        values={emotional.moodTransitions || []}
                        onAdd={() =>
                          addToDNAArray(['emotional', 'moodTransitions'], {
                            time: 0,
                            emotion: '',
                            intensity: 0.5,
                          })
                        }
                        onRemove={(i) => removeFromDNAArray(['emotional', 'moodTransitions'], i)}
                        onUpdate={(i, v) => updateDNAArray(['emotional', 'moodTransitions'], i, v)}
                        isObject
                        objectFields={['time', 'emotion', 'intensity']}
                      />
                    </div>
                  )}

                  {/* Musical Tab */}
                  {activeTab === 'musical' && (
                    <div className="space-y-4">
                      <Field
                        label="Key Signature"
                        value={musical.keySignature || ''}
                        onChange={(v) => updateDNAField(['musical', 'keySignature'], v)}
                      />
                      <Field
                        label="Time Signature"
                        value={musical.timeSignature || ''}
                        onChange={(v) => updateDNAField(['musical', 'timeSignature'], v)}
                      />
                      <Field
                        label="Scale"
                        value={musical.scale || ''}
                        onChange={(v) => updateDNAField(['musical', 'scale'], v)}
                      />
                      <Field
                        label="Harmonic Complexity"
                        value={musical.harmonicComplexity || ''}
                        onChange={(v) => updateDNAField(['musical', 'harmonicComplexity'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['musical', 'harmonicComplexity'])}
                        autofilling={autofillingField === 'musical.harmonicComplexity'}
                        fieldPath={['musical', 'harmonicComplexity']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Rhythmic Patterns"
                        value={musical.rhythmicPatterns || ''}
                        onChange={(v) => updateDNAField(['musical', 'rhythmicPatterns'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['musical', 'rhythmicPatterns'])}
                        autofilling={autofillingField === 'musical.rhythmicPatterns'}
                        fieldPath={['musical', 'rhythmicPatterns']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Instrumentation"
                        values={musical.instrumentation || []}
                        onAdd={() => addToDNAArray(['musical', 'instrumentation'])}
                        onRemove={(i) => removeFromDNAArray(['musical', 'instrumentation'], i)}
                        onUpdate={(i, v) => updateDNAArray(['musical', 'instrumentation'], i, v)}
                      />
                      <ArrayField
                        label="Production Techniques"
                        values={musical.productionTechniques || []}
                        onAdd={() => addToDNAArray(['musical', 'productionTechniques'])}
                        onRemove={(i) => removeFromDNAArray(['musical', 'productionTechniques'], i)}
                        onUpdate={(i, v) => updateDNAArray(['musical', 'productionTechniques'], i, v)}
                      />
                      <ArrayField
                        label="Musical Influences"
                        values={musical.musicalInfluences || []}
                        onAdd={() => addToDNAArray(['musical', 'musicalInfluences'])}
                        onRemove={(i) => removeFromDNAArray(['musical', 'musicalInfluences'], i)}
                        onUpdate={(i, v) => updateDNAArray(['musical', 'musicalInfluences'], i, v)}
                      />
                    </div>
                  )}

                  {/* Technical Tab */}
                  {activeTab === 'technical' && (
                    <div className="space-y-4">
                      <Field
                        label="BPM"
                        value={technical.bpm || ''}
                        onChange={(v) => updateDNAField(['technical', 'bpm'], parseFloat(v) || null)}
                        type="number"
                      />
                      <Field
                        label="Energy Level"
                        value={technical.energyLevel || ''}
                        onChange={(v) =>
                          updateDNAField(['technical', 'energyLevel'], parseFloat(v) || null)
                        }
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                      />
                      <Field
                        label="Danceability"
                        value={technical.danceability || ''}
                        onChange={(v) =>
                          updateDNAField(['technical', 'danceability'], parseFloat(v) || null)
                        }
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                      />
                      <Field
                        label="Time Signature"
                        value={technical.timeSignature || ''}
                        onChange={(v) => updateDNAField(['technical', 'timeSignature'], v)}
                      />
                      <Field
                        label="Key"
                        value={technical.key?.key || ''}
                        onChange={(v) => {
                          if (!technical.key) updateDNAField(['technical', 'key'], {})
                          updateDNAField(['technical', 'key', 'key'], v)
                        }}
                      />
                      <Field
                        label="Mode"
                        value={technical.key?.mode || ''}
                        onChange={(v) => {
                          if (!technical.key) updateDNAField(['technical', 'key'], {})
                          updateDNAField(['technical', 'key', 'mode'], v || null)
                        }}
                        type="select"
                        options={['', 'major', 'minor']}
                      />
                      <Field
                        label="Scale"
                        value={technical.key?.scale || ''}
                        onChange={(v) => {
                          if (!technical.key) updateDNAField(['technical', 'key'], {})
                          updateDNAField(['technical', 'key', 'scale'], v)
                        }}
                      />
                      <Field
                        label="Technical Description"
                        value={technical.technicalDescription || ''}
                        onChange={(v) => updateDNAField(['technical', 'technicalDescription'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['technical', 'technicalDescription'])}
                        autofilling={autofillingField === 'technical.technicalDescription'}
                        fieldPath={['technical', 'technicalDescription']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      {technical.frequencyBands && (
                        <Section
                          title="Frequency Bands"
                          expanded={expandedSections.has('frequency-bands')}
                          onToggle={() => toggleSection('frequency-bands')}
                        >
                          <div className="grid grid-cols-2 gap-4">
                            <Field
                              label="Kicks"
                              value={technical.frequencyBands.kicks || ''}
                              onChange={(v) => {
                                if (!technical.frequencyBands)
                                  updateDNAField(['technical', 'frequencyBands'], {})
                                updateDNAField(['technical', 'frequencyBands', 'kicks'], parseFloat(v) || null)
                              }}
                              type="number"
                            />
                            <Field
                              label="Snares"
                              value={technical.frequencyBands.snares || ''}
                              onChange={(v) => {
                                if (!technical.frequencyBands)
                                  updateDNAField(['technical', 'frequencyBands'], {})
                                updateDNAField(['technical', 'frequencyBands', 'snares'], parseFloat(v) || null)
                              }}
                              type="number"
                            />
                            <Field
                              label="Hi-Hats"
                              value={technical.frequencyBands.hihats || ''}
                              onChange={(v) => {
                                if (!technical.frequencyBands)
                                  updateDNAField(['technical', 'frequencyBands'], {})
                                updateDNAField(['technical', 'frequencyBands', 'hihats'], parseFloat(v) || null)
                              }}
                              type="number"
                            />
                            <Field
                              label="Cymbals"
                              value={technical.frequencyBands.cymbals || ''}
                              onChange={(v) => {
                                if (!technical.frequencyBands)
                                  updateDNAField(['technical', 'frequencyBands'], {})
                                updateDNAField(['technical', 'frequencyBands', 'cymbals'], parseFloat(v) || null)
                              }}
                              type="number"
                            />
                          </div>
                        </Section>
                      )}
                    </div>
                  )}

                  {/* Drums Tab */}
                  {activeTab === 'drums' && (
                    <div className="space-y-4">
                      <Field
                        label="Pattern Type"
                        value={drums.patternType || ''}
                        onChange={(v) => updateDNAField(['drums', 'patternType'], v)}
                      />
                      <Field
                        label="Kick Pattern"
                        value={drums.kickPattern || ''}
                        onChange={(v) => updateDNAField(['drums', 'kickPattern'], v)}
                        type="textarea"
                        rows={3}
                        onAutofill={() => handleAutofillField(['drums', 'kickPattern'])}
                        autofilling={autofillingField === 'drums.kickPattern'}
                        fieldPath={['drums', 'kickPattern']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Snare Pattern"
                        value={drums.snarePattern || ''}
                        onChange={(v) => updateDNAField(['drums', 'snarePattern'], v)}
                        type="textarea"
                        rows={3}
                        onAutofill={() => handleAutofillField(['drums', 'snarePattern'])}
                        autofilling={autofillingField === 'drums.snarePattern'}
                        fieldPath={['drums', 'snarePattern']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Hi-Hat Pattern"
                        value={drums.hihatPattern || ''}
                        onChange={(v) => updateDNAField(['drums', 'hihatPattern'], v)}
                        type="textarea"
                        rows={3}
                        onAutofill={() => handleAutofillField(['drums', 'hihatPattern'])}
                        autofilling={autofillingField === 'drums.hihatPattern'}
                        fieldPath={['drums', 'hihatPattern']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Genre Styles"
                        values={drums.genreStyles || []}
                        onAdd={() => addToDNAArray(['drums', 'genreStyles'])}
                        onRemove={(i) => removeFromDNAArray(['drums', 'genreStyles'], i)}
                        onUpdate={(i, v) => updateDNAArray(['drums', 'genreStyles'], i, v)}
                      />
                      <Field
                        label="Pattern Recognition"
                        value={drums.patternRecognition || ''}
                        onChange={(v) => updateDNAField(['drums', 'patternRecognition'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['drums', 'patternRecognition'])}
                        autofilling={autofillingField === 'drums.patternRecognition'}
                        fieldPath={['drums', 'patternRecognition']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Complexity"
                        value={drums.complexity || ''}
                        onChange={(v) => updateDNAField(['drums', 'complexity'], v)}
                      />
                    </div>
                  )}

                  {/* Harmony Tab */}
                  {activeTab === 'harmony' && (
                    <div className="space-y-4">
                      <Field
                        label="Key Signature"
                        value={musical.keySignature || ''}
                        onChange={(v) => updateDNAField(['musical', 'keySignature'], v)}
                      />
                      <Field
                        label="Scale"
                        value={musical.scale || ''}
                        onChange={(v) => updateDNAField(['musical', 'scale'], v)}
                      />
                      <Field
                        label="Harmonic Complexity"
                        value={musical.harmonicComplexity || ''}
                        onChange={(v) => updateDNAField(['musical', 'harmonicComplexity'], v)}
                        type="textarea"
                        rows={8}
                        onAutofill={() => handleAutofillField(['musical', 'harmonicComplexity'])}
                        autofilling={autofillingField === 'musical.harmonicComplexity'}
                        fieldPath={['musical', 'harmonicComplexity']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                    </div>
                  )}

                  {/* Genres Tab */}
                  {activeTab === 'genres' && (
                    <div className="space-y-4">
                      <ArrayField
                        label="Primary Genres"
                        values={genres.primaryGenres || []}
                        onAdd={() => addToDNAArray(['genres', 'primaryGenres'])}
                        onRemove={(i) => removeFromDNAArray(['genres', 'primaryGenres'], i)}
                        onUpdate={(i, v) => updateDNAArray(['genres', 'primaryGenres'], i, v)}
                      />
                      <ArrayField
                        label="Subgenres"
                        values={genres.subgenres || []}
                        onAdd={() => addToDNAArray(['genres', 'subgenres'])}
                        onRemove={(i) => removeFromDNAArray(['genres', 'subgenres'], i)}
                        onUpdate={(i, v) => updateDNAArray(['genres', 'subgenres'], i, v)}
                      />
                      <Field
                        label="Genre Fusion"
                        value={genres.genreFusion || ''}
                        onChange={(v) => updateDNAField(['genres', 'genreFusion'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['genres', 'genreFusion'])}
                        autofilling={autofillingField === 'genres.genreFusion'}
                        fieldPath={['genres', 'genreFusion']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <Field
                        label="Genre Evolution"
                        value={genres.genreEvolution || ''}
                        onChange={(v) => updateDNAField(['genres', 'genreEvolution'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['genres', 'genreEvolution'])}
                        autofilling={autofillingField === 'genres.genreEvolution'}
                        fieldPath={['genres', 'genreEvolution']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Genre Characteristics"
                        values={genres.genreCharacteristics || []}
                        onAdd={() => addToDNAArray(['genres', 'genreCharacteristics'])}
                        onRemove={(i) => removeFromDNAArray(['genres', 'genreCharacteristics'], i)}
                        onUpdate={(i, v) => updateDNAArray(['genres', 'genreCharacteristics'], i, v)}
                      />
                      <ArrayField
                        label="Genre Influences"
                        values={genres.genreInfluences || []}
                        onAdd={() => addToDNAArray(['genres', 'genreInfluences'])}
                        onRemove={(i) => removeFromDNAArray(['genres', 'genreInfluences'], i)}
                        onUpdate={(i, v) => updateDNAArray(['genres', 'genreInfluences'], i, v)}
                      />
                    </div>
                  )}

                  {/* Historical Tab */}
                  {activeTab === 'historical' && (
                    <div className="space-y-4">
                      <ArrayField
                        label="Era Influences"
                        values={historical.eraInfluences || []}
                        onAdd={() => addToDNAArray(['historical', 'eraInfluences'])}
                        onRemove={(i) => removeFromDNAArray(['historical', 'eraInfluences'], i)}
                        onUpdate={(i, v) => updateDNAArray(['historical', 'eraInfluences'], i, v)}
                      />
                      <Field
                        label="Historical Context"
                        value={historical.historicalContext || ''}
                        onChange={(v) => updateDNAField(['historical', 'historicalContext'], v)}
                        type="textarea"
                        rows={8}
                        onAutofill={() => handleAutofillField(['historical', 'historicalContext'])}
                        autofilling={autofillingField === 'historical.historicalContext'}
                        fieldPath={['historical', 'historicalContext']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Evolution From"
                        values={historical.evolutionFrom || []}
                        onAdd={() => addToDNAArray(['historical', 'evolutionFrom'])}
                        onRemove={(i) => removeFromDNAArray(['historical', 'evolutionFrom'], i)}
                        onUpdate={(i, v) => updateDNAArray(['historical', 'evolutionFrom'], i, v)}
                      />
                      <ArrayField
                        label="Innovation Points"
                        values={historical.innovationPoints || []}
                        onAdd={() => addToDNAArray(['historical', 'innovationPoints'])}
                        onRemove={(i) => removeFromDNAArray(['historical', 'innovationPoints'], i)}
                        onUpdate={(i, v) => updateDNAArray(['historical', 'innovationPoints'], i, v)}
                      />
                    </div>
                  )}

                  {/* Regional Tab */}
                  {activeTab === 'regional' && (
                    <div className="space-y-4">
                      <ArrayField
                        label="Primary Regions"
                        values={regional.primaryRegions || []}
                        onAdd={() => addToDNAArray(['regional', 'primaryRegions'])}
                        onRemove={(i) => removeFromDNAArray(['regional', 'primaryRegions'], i)}
                        onUpdate={(i, v) => updateDNAArray(['regional', 'primaryRegions'], i, v)}
                      />
                      <ArrayField
                        label="Cultural Influences"
                        values={regional.culturalInfluences || []}
                        onAdd={() => addToDNAArray(['regional', 'culturalInfluences'])}
                        onRemove={(i) => removeFromDNAArray(['regional', 'culturalInfluences'], i)}
                        onUpdate={(i, v) => updateDNAArray(['regional', 'culturalInfluences'], i, v)}
                      />
                      <Field
                        label="Regional Characteristics"
                        value={regional.regionalCharacteristics || ''}
                        onChange={(v) => updateDNAField(['regional', 'regionalCharacteristics'], v)}
                        type="textarea"
                        rows={8}
                        onAutofill={() => handleAutofillField(['regional', 'regionalCharacteristics'])}
                        autofilling={autofillingField === 'regional.regionalCharacteristics'}
                        fieldPath={['regional', 'regionalCharacteristics']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Cross-Cultural Elements"
                        values={regional.crossCulturalElements || []}
                        onAdd={() => addToDNAArray(['regional', 'crossCulturalElements'])}
                        onRemove={(i) => removeFromDNAArray(['regional', 'crossCulturalElements'], i)}
                        onUpdate={(i, v) => updateDNAArray(['regional', 'crossCulturalElements'], i, v)}
                      />
                    </div>
                  )}

                  {/* Musicology Tab */}
                  {activeTab === 'musicology' && (
                    <div className="space-y-4">
                      <Field
                        label="Description"
                        value={musicology.description || ''}
                        onChange={(v) => updateDNAField(['musicology', 'description'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['musicology', 'description'])}
                        autofilling={autofillingField === 'musicology.description'}
                        fieldPath={['musicology', 'description']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      {musicology.era && (
                        <Section
                          title="Era"
                          expanded={expandedSections.has('musicology-era')}
                          onToggle={() => toggleSection('musicology-era')}
                        >
                          <Field
                            label="Decade"
                            value={musicology.era.decade || ''}
                            onChange={(v) => {
                              if (!musicology.era) updateDNAField(['musicology', 'era'], {})
                              updateDNAField(['musicology', 'era', 'decade'], v)
                            }}
                          />
                          <Field
                            label="Description"
                            value={musicology.era.description || ''}
                            onChange={(v) => {
                              if (!musicology.era) updateDNAField(['musicology', 'era'], {})
                              updateDNAField(['musicology', 'era', 'description'], v)
                            }}
                            type="textarea"
                            rows={4}
                            onAutofill={() => handleAutofillField(['musicology', 'era', 'description'])}
                            autofilling={autofillingField === 'musicology.era.description'}
                            fieldPath={['musicology', 'era', 'description']}
                            onTextareaContextMenu={handleTextareaContextMenu}
                          />
                        </Section>
                      )}
                      {musicology.style && (
                        <Section
                          title="Style"
                          expanded={expandedSections.has('musicology-style')}
                          onToggle={() => toggleSection('musicology-style')}
                        >
                          <Field
                            label="Primary Style"
                            value={musicology.style.primaryStyle || ''}
                            onChange={(v) => {
                              if (!musicology.style) updateDNAField(['musicology', 'style'], {})
                              updateDNAField(['musicology', 'style', 'primaryStyle'], v)
                            }}
                          />
                          <Field
                            label="Description"
                            value={musicology.style.description || ''}
                            onChange={(v) => {
                              if (!musicology.style) updateDNAField(['musicology', 'style'], {})
                              updateDNAField(['musicology', 'style', 'description'], v)
                            }}
                            type="textarea"
                            rows={4}
                            onAutofill={() => handleAutofillField(['musicology', 'style', 'description'])}
                            autofilling={autofillingField === 'musicology.style.description'}
                            fieldPath={['musicology', 'style', 'description']}
                            onTextareaContextMenu={handleTextareaContextMenu}
                          />
                        </Section>
                      )}
                      {musicology.production && (
                        <Section
                          title="Production"
                          expanded={expandedSections.has('musicology-production')}
                          onToggle={() => toggleSection('musicology-production')}
                        >
                          <ArrayField
                            label="Techniques"
                            values={musicology.production.techniques || []}
                            onAdd={() => {
                              if (!musicology.production) updateDNAField(['musicology', 'production'], {})
                              addToDNAArray(['musicology', 'production', 'techniques'])
                            }}
                            onRemove={(i) => removeFromDNAArray(['musicology', 'production', 'techniques'], i)}
                            onUpdate={(i, v) =>
                              updateDNAArray(['musicology', 'production', 'techniques'], i, v)
                            }
                          />
                          <Field
                            label="Description"
                            value={musicology.production.description || ''}
                            onChange={(v) => {
                              if (!musicology.production) updateDNAField(['musicology', 'production'], {})
                              updateDNAField(['musicology', 'production', 'description'], v)
                            }}
                            type="textarea"
                            rows={4}
                            onAutofill={() => handleAutofillField(['musicology', 'production', 'description'])}
                            autofilling={autofillingField === 'musicology.production.description'}
                            fieldPath={['musicology', 'production', 'description']}
                            onTextareaContextMenu={handleTextareaContextMenu}
                          />
                        </Section>
                      )}
                    </div>
                  )}

                  {/* Cultural Tab */}
                  {activeTab === 'cultural' && (
                    <div className="space-y-4">
                      <Field
                        label="Description"
                        value={cultural.description || ''}
                        onChange={(v) => updateDNAField(['cultural', 'description'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['cultural', 'description'])}
                        autofilling={autofillingField === 'cultural.description'}
                        fieldPath={['cultural', 'description']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                      <ArrayField
                        label="Regions"
                        values={cultural.regions || []}
                        onAdd={() => addToDNAArray(['cultural', 'regions'])}
                        onRemove={(i) => removeFromDNAArray(['cultural', 'regions'], i)}
                        onUpdate={(i, v) => updateDNAArray(['cultural', 'regions'], i, v)}
                      />
                      <ArrayField
                        label="Cultural Influences"
                        values={cultural.culturalInfluences || []}
                        onAdd={() => addToDNAArray(['cultural', 'culturalInfluences'])}
                        onRemove={(i) => removeFromDNAArray(['cultural', 'culturalInfluences'], i)}
                        onUpdate={(i, v) => updateDNAArray(['cultural', 'culturalInfluences'], i, v)}
                      />
                      <Field
                        label="Regional Characteristics"
                        value={cultural.regionalCharacteristics || ''}
                        onChange={(v) => updateDNAField(['cultural', 'regionalCharacteristics'], v)}
                        type="textarea"
                        rows={6}
                        onAutofill={() => handleAutofillField(['cultural', 'regionalCharacteristics'])}
                        autofilling={autofillingField === 'cultural.regionalCharacteristics'}
                        fieldPath={['cultural', 'regionalCharacteristics']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                    </div>
                  )}

                  {/* Summary Tab */}
                  {activeTab === 'summary' && (
                    <div className="space-y-4">
                      <Field
                        label="Summary"
                        value={summary}
                        onChange={(v) => updateDNAField(['summary'], v)}
                        type="textarea"
                        rows={12}
                        placeholder="Synthesis of track's unique sonic identity..."
                        onAutofill={() => handleAutofillField(['summary'])}
                        autofilling={autofillingField === 'summary'}
                        fieldPath={['summary']}
                        onTextareaContextMenu={handleTextareaContextMenu}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-12 text-center">
                <FaMusic className="text-6xl text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">Select a track to view and edit its Sonic DNA</p>
                <p className="text-gray-500 text-sm mt-2">
                  Use the search and filters to find tracks, then click on one to begin editing
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(147, 51, 234, 0.5);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(147, 51, 234, 0.7);
        }
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

// Helper Components
function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  rows = 1,
  min,
  max,
  step,
  options,
  onAutofill,
  autofilling,
  fieldPath,
  onTextareaContextMenu,
}: {
  label: string
  value: any
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'textarea' | 'select'
  placeholder?: string
  rows?: number
  min?: string | number
  max?: string | number
  step?: string | number
  options?: string[]
  onAutofill?: () => Promise<void>
  autofilling?: boolean
  fieldPath?: string[]
  onTextareaContextMenu?: (e: React.MouseEvent<HTMLTextAreaElement>, fieldPath: string[]) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        {type === 'textarea' && onAutofill && (
          <button
            onClick={onAutofill}
            disabled={autofilling}
            className="text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-purple-200 px-2 py-1 rounded transition disabled:opacity-50 flex items-center gap-1"
            title="Autofill using Sonic DNA AI"
          >
            {autofilling ? (
              <>
                <FaSpinner className="animate-spin text-xs" /> Filling...
              </>
            ) : (
              <>
                <FaSync className="text-xs" /> Autofill
              </>
            )}
          </button>
        )}
      </div>
      {type === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label={label}
          data-field-path={fieldPath ? JSON.stringify(fieldPath) : undefined}
          onContextMenu={fieldPath && onTextareaContextMenu ? (e) => onTextareaContextMenu(e, fieldPath) : undefined}
        />
      ) : type === 'select' ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label={label}
        >
          {options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt || 'Select...'}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label={label}
        />
      )}
    </div>
  )
}

function ArrayField({
  label,
  values,
  onAdd,
  onRemove,
  onUpdate,
  isObject = false,
  objectFields = [],
}: {
  label: string
  values: any[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, value: any) => void
  isObject?: boolean
  objectFields?: string[]
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        <button
          onClick={onAdd}
          className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
        >
          <FaPlus className="text-xs" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {values.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            {isObject && typeof item === 'object' ? (
              <div className="flex-1 space-y-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                {objectFields.map((field) => (
                  <input
                    key={field}
                    type={field === 'time' || field === 'intensity' ? 'number' : 'text'}
                    value={item[field] || ''}
                    onChange={(e) => {
                      const newItem = { ...item }
                      newItem[field] =
                        field === 'time' || field === 'intensity'
                          ? parseFloat(e.target.value) || 0
                          : e.target.value
                      onUpdate(idx, newItem)
                    }}
                    placeholder={field}
                    className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    aria-label={`${label} - ${field}`}
                  />
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={item || ''}
                onChange={(e) => onUpdate(idx, e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label={`${label} item ${idx + 1}`}
              />
            )}
            <button
              onClick={() => onRemove(idx)}
              className="text-red-400 hover:text-red-300 px-3 py-2 transition"
              title="Remove"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        {values.length === 0 && (
          <div className="text-sm text-gray-500 italic py-2">No items. Click "Add" to add one.</div>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  children,
  expanded = true,
  onToggle,
}: {
  title: string
  children: React.ReactNode
  expanded?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {onToggle ? (
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 bg-gray-800/50 hover:bg-gray-800 flex items-center justify-between transition"
        >
          <span className="font-semibold text-gray-300">{title}</span>
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      ) : (
        <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
          <span className="font-semibold text-gray-300">{title}</span>
        </div>
      )}
      {expanded && <div className="p-4">{children}</div>}
    </div>
  )
}
