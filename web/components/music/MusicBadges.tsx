'use client'

import { memo } from 'react'
import { CAMELOT_KEYS, getBpmZone, calculateDnaMatch, KEY_TRANSITIONS } from '@/types/sergik-data'

/**
 * BPM Badge - Shows tempo with zone color coding
 */
export const BpmBadge = memo(function BpmBadge({ 
  bpm, 
  showZone = false,
  size = 'sm' 
}: { 
  bpm: number | undefined | null
  showZone?: boolean
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!bpm) return null
  
  const zone = getBpmZone(bpm)
  
  // Color based on BPM zone - SERGIK sweet spots are green
  const getColor = () => {
    if (bpm >= 120 && bpm <= 129) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' // House
    if (bpm < 90) return 'bg-purple-500/20 text-purple-400 border-purple-500/30' // Hip-hop
    if (bpm >= 90 && bpm < 100) return 'bg-violet-500/20 text-violet-400 border-violet-500/30' // Funk
    if (bpm >= 100 && bpm < 120) return 'bg-blue-500/20 text-blue-400 border-blue-500/30' // Transitional
    if (bpm >= 130 && bpm < 140) return 'bg-orange-500/20 text-orange-400 border-orange-500/30' // Techno
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium ${getColor()} ${sizeClasses[size]}`}
      title={`${Math.round(bpm)} BPM - ${zone}`}
    >
      <span className="font-mono">{Math.round(bpm)}</span>
      {showZone && <span className="opacity-75">BPM</span>}
    </span>
  )
})

/**
 * Key Badge - Shows musical key in Camelot notation with color
 */
export const KeyBadge = memo(function KeyBadge({ 
  keySignature, 
  showMusical = false,
  size = 'sm'
}: { 
  keySignature: string | undefined | null
  showMusical?: boolean
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!keySignature) return null
  
  // Try to match Camelot notation
  const camelotMatch = keySignature.match(/(\d{1,2}[AB])/i)
  const camelotKey = camelotMatch ? camelotMatch[1].toUpperCase() : null
  const keyInfo = camelotKey ? CAMELOT_KEYS[camelotKey] : null
  
  // Major keys (B) are green, minor keys (A) are purple
  const isMajor = keySignature.includes('B') || keySignature.toLowerCase().includes('major')
  const color = isMajor 
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
    : 'bg-violet-500/20 text-violet-400 border-violet-500/30'
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  const displayKey = camelotKey || keySignature
  const musicalKey = keyInfo?.name || keySignature
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium ${color} ${sizeClasses[size]}`}
      title={`Key: ${musicalKey}${camelotKey ? ` (${camelotKey})` : ''}`}
    >
      <span className="font-mono">{displayKey}</span>
      {showMusical && keyInfo && <span className="opacity-75">{keyInfo.name}</span>}
    </span>
  )
})

/**
 * Energy Badge - Shows energy level with gradient
 */
export const EnergyBadge = memo(function EnergyBadge({ 
  energy,
  size = 'sm'
}: { 
  energy: number | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (energy === undefined || energy === null) return null
  
  // Normalize energy to 1-10 scale
  const normalizedEnergy = Math.min(10, Math.max(1, Math.round(energy)))
  
  // Color gradient based on energy
  const getColor = () => {
    if (normalizedEnergy <= 3) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    if (normalizedEnergy <= 5) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    if (normalizedEnergy <= 7) return 'bg-green-500/20 text-green-400 border-green-500/30' // SERGIK sweet spot
    if (normalizedEnergy <= 8) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  }
  
  const getLabel = () => {
    if (normalizedEnergy <= 3) return 'Low'
    if (normalizedEnergy <= 5) return 'Chill'
    if (normalizedEnergy <= 7) return 'Groove'
    if (normalizedEnergy <= 8) return 'High'
    return 'Peak'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium ${getColor()} ${sizeClasses[size]}`}
      title={`Energy: ${normalizedEnergy}/10 (${getLabel()})`}
    >
      <span className="font-mono">⚡{normalizedEnergy}</span>
    </span>
  )
})

/**
 * Genre Badge - Shows genre tag
 */
export const GenreBadge = memo(function GenreBadge({ 
  genre,
  size = 'sm'
}: { 
  genre: string | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!genre) return null
  
  // Color based on genre
  const getColor = () => {
    const g = genre.toLowerCase()
    if (g.includes('house')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (g.includes('hip') || g.includes('hop')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    if (g.includes('funk')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    if (g.includes('soul')) return 'bg-pink-500/20 text-pink-400 border-pink-500/30'
    if (g.includes('techno')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    if (g.includes('disco')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center rounded border font-medium ${getColor()} ${sizeClasses[size]}`}
      title={genre}
    >
      {genre}
    </span>
  )
})

/**
 * DNA Match Badge - Shows how well a track matches SERGIK DNA
 */
export const DnaMatchBadge = memo(function DnaMatchBadge({ 
  bpm,
  keySignature,
  energy,
  size = 'sm'
}: { 
  bpm: number | undefined | null
  keySignature: string | undefined | null
  energy: number | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!bpm && !keySignature && !energy) return null
  
  // Calculate match score
  const score = calculateDnaMatch(
    bpm || 100,
    keySignature || '',
    energy || 5
  )
  
  const getColor = () => {
    if (score >= 80) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (score >= 60) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    if (score >= 40) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
  
  const getLabel = () => {
    if (score >= 80) return 'Excellent Match'
    if (score >= 60) return 'Good Match'
    if (score >= 40) return 'Moderate Match'
    return 'Low Match'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium ${getColor()} ${sizeClasses[size]}`}
      title={`SERGIK DNA Match: ${score}% (${getLabel()})`}
    >
      <span>🧬</span>
      <span className="font-mono">{score}%</span>
    </span>
  )
})

/**
 * Collaborator Badge - Shows collaborator credit
 */
export const CollaboratorBadge = memo(function CollaboratorBadge({ 
  name,
  size = 'sm'
}: { 
  name: string
  size?: 'xs' | 'sm' | 'md'
}) {
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-medium ${sizeClasses[size]}`}
      title={`Featuring ${name}`}
    >
      <span>ft.</span>
      <span>{name}</span>
    </span>
  )
})

/**
 * Mood Badge - Shows track mood/emotional profile
 */
export const MoodBadge = memo(function MoodBadge({ 
  mood,
  size = 'sm'
}: { 
  mood: string | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!mood) return null
  
  // Color based on mood keywords
  const getColor = () => {
    const m = mood.toLowerCase()
    if (m.includes('euphoric') || m.includes('uplifting')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    if (m.includes('groovy') || m.includes('funky')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    if (m.includes('dark') || m.includes('moody')) return 'bg-violet-500/20 text-violet-400 border-violet-500/30'
    if (m.includes('mellow') || m.includes('chill')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    if (m.includes('energetic') || m.includes('driving')) return 'bg-red-500/20 text-red-400 border-red-500/30'
    if (m.includes('warm') || m.includes('soulful')) return 'bg-pink-500/20 text-pink-400 border-pink-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
  
  const getEmoji = () => {
    const m = mood.toLowerCase()
    if (m.includes('euphoric') || m.includes('uplifting')) return '✨'
    if (m.includes('groovy') || m.includes('funky')) return '🎸'
    if (m.includes('dark') || m.includes('moody')) return '🌙'
    if (m.includes('mellow') || m.includes('chill')) return '😌'
    if (m.includes('energetic') || m.includes('driving')) return '🔥'
    if (m.includes('warm') || m.includes('soulful')) return '💫'
    return '🎵'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium ${getColor()} ${sizeClasses[size]}`}
      title={`Mood: ${mood}`}
    >
      <span>{getEmoji()}</span>
      <span className="capitalize">{mood.split(' ')[0]}</span>
    </span>
  )
})

/**
 * Subgenre Badge - Shows subgenre tag
 */
export const SubgenreBadge = memo(function SubgenreBadge({ 
  subgenre,
  size = 'sm'
}: { 
  subgenre: string | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!subgenre) return null
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center rounded bg-slate-500/20 text-slate-400 border border-slate-500/30 font-medium ${sizeClasses[size]}`}
      title={`Subgenre: ${subgenre}`}
    >
      {subgenre}
    </span>
  )
})

/**
 * Drum Style Badge - Shows drum pattern style
 */
export const DrumStyleBadge = memo(function DrumStyleBadge({ 
  drumStyle,
  size = 'sm'
}: { 
  drumStyle: string | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!drumStyle) return null
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium ${sizeClasses[size]}`}
      title={`Drum Style: ${drumStyle}`}
    >
      <span>🥁</span>
      <span>{drumStyle}</span>
    </span>
  )
})

/**
 * DNA Match Score Badge - Shows pre-calculated DNA match from enriched data
 */
export const DnaMatchScoreBadge = memo(function DnaMatchScoreBadge({ 
  score,
  size = 'sm'
}: { 
  score: number | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (score === undefined || score === null) return null
  
  const getColor = () => {
    if (score >= 80) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (score >= 60) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    if (score >= 40) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
  
  const getLabel = () => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Moderate'
    return 'Low'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium ${getColor()} ${sizeClasses[size]}`}
      title={`SERGIK DNA Match: ${score}% (${getLabel()})`}
    >
      <span>🧬</span>
      <span className="font-mono">{score}%</span>
    </span>
  )
})

/**
 * Compatible Keys Display - Shows Camelot wheel compatible keys
 */
export const CompatibleKeysBadge = memo(function CompatibleKeysBadge({ 
  currentKey,
  compatibleKeys,
  size = 'sm'
}: { 
  currentKey?: string | null
  compatibleKeys?: string[] | null
  size?: 'xs' | 'sm' | 'md'
}) {
  // If no compatible keys provided, calculate from current key
  const keys = compatibleKeys || (currentKey ? KEY_TRANSITIONS[currentKey] || [] : [])
  
  if (!keys || keys.length === 0) return null
  
  const sizeClasses = {
    xs: 'px-1 py-0.5 text-[9px]',
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs'
  }
  
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-gray-500">Mix with:</span>
      {keys.slice(0, 4).map(key => {
        const isMajor = key.includes('B')
        const color = isMajor 
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
          : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
        return (
          <span 
            key={key}
            className={`inline-flex items-center rounded border font-mono ${color} ${sizeClasses[size]}`}
          >
            {key}
          </span>
        )
      })}
    </div>
  )
})

/**
 * Mixing Recommendations Card - Full mixing info display
 */
export const MixingRecommendations = memo(function MixingRecommendations({
  bpmRange,
  compatibleKeys,
  mixableGenres,
  className = ''
}: {
  bpmRange?: { min: number; max: number } | null
  compatibleKeys?: string[] | null
  mixableGenres?: string[] | null
  className?: string
}) {
  if (!bpmRange && !compatibleKeys?.length && !mixableGenres?.length) return null
  
  return (
    <div className={`bg-gray-800/50 rounded-lg p-3 space-y-2 ${className}`}>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
        <span>🎧</span> Mixing Recommendations
      </h4>
      
      {bpmRange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">BPM Range:</span>
          <span className="text-sm font-mono text-emerald-400">
            {bpmRange.min} - {bpmRange.max} BPM
          </span>
        </div>
      )}
      
      {compatibleKeys && compatibleKeys.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Keys:</span>
          {compatibleKeys.map(key => {
            const isMajor = key.includes('B')
            return (
              <span 
                key={key}
                className={`px-1.5 py-0.5 text-[10px] rounded font-mono border ${
                  isMajor 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                }`}
              >
                {key}
              </span>
            )
          })}
        </div>
      )}
      
      {mixableGenres && mixableGenres.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Genres:</span>
          {mixableGenres.map(genre => (
            <span 
              key={genre}
              className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700/50 text-gray-300 border border-gray-600/30"
            >
              {genre}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

/**
 * Track Description Card - Shows track description
 */
export const TrackDescription = memo(function TrackDescription({
  description,
  className = ''
}: {
  description: string | undefined | null
  className?: string
}) {
  if (!description) return null
  
  return (
    <div className={`bg-gray-800/30 rounded-lg p-3 ${className}`}>
      <p className="text-sm text-gray-300 leading-relaxed">
        {description}
      </p>
    </div>
  )
})

/**
 * Production Era Badge - Shows production style era
 */
export const ProductionEraBadge = memo(function ProductionEraBadge({ 
  era,
  size = 'sm'
}: { 
  era: string | undefined | null
  size?: 'xs' | 'sm' | 'md'
}) {
  if (!era) return null
  
  const getColor = () => {
    const e = era.toLowerCase()
    if (e === 'vintage') return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    if (e === 'modern') return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    if (e === 'lofi') return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
  
  const getEmoji = () => {
    const e = era.toLowerCase()
    if (e === 'vintage') return '📻'
    if (e === 'modern') return '🎛️'
    if (e === 'lofi') return '📼'
    return '🎚️'
  }
  
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  }
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded border font-medium capitalize ${getColor()} ${sizeClasses[size]}`}
      title={`Production Era: ${era}`}
    >
      <span>{getEmoji()}</span>
      <span>{era}</span>
    </span>
  )
})

/**
 * Instrument Signatures - Shows key instruments
 */
export const InstrumentSignatures = memo(function InstrumentSignatures({ 
  instruments,
  size = 'sm',
  max = 4
}: { 
  instruments: string[] | undefined | null
  size?: 'xs' | 'sm' | 'md'
  max?: number
}) {
  if (!instruments || instruments.length === 0) return null
  
  const sizeClasses = {
    xs: 'px-1 py-0.5 text-[9px]',
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs'
  }
  
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {instruments.slice(0, max).map(instrument => (
        <span 
          key={instrument}
          className={`inline-flex items-center rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 ${sizeClasses[size]}`}
        >
          {instrument}
        </span>
      ))}
      {instruments.length > max && (
        <span className="text-xs text-gray-500">+{instruments.length - max}</span>
      )}
    </div>
  )
})

/**
 * Track Badges Row - Combines all badges for a track
 */
export function TrackBadgesRow({
  bpm,
  keySignature,
  energy,
  genre,
  showDnaMatch = false,
  size = 'sm',
  className = ''
}: {
  bpm?: number | null
  keySignature?: string | null
  energy?: number | null
  genre?: string | null
  showDnaMatch?: boolean
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <BpmBadge bpm={bpm} size={size} />
      <KeyBadge keySignature={keySignature} size={size} />
      <EnergyBadge energy={energy} size={size} />
      {genre && <GenreBadge genre={genre} size={size} />}
      {showDnaMatch && (
        <DnaMatchBadge bpm={bpm} keySignature={keySignature} energy={energy} size={size} />
      )}
    </div>
  )
}

/**
 * Enhanced Track Badges Row - With all enriched data
 */
export function EnhancedTrackBadgesRow({
  bpm,
  keySignature,
  energy,
  genre,
  subgenre,
  mood,
  drumStyle,
  dnaMatchScore,
  productionEra,
  size = 'sm',
  className = ''
}: {
  bpm?: number | null
  keySignature?: string | null
  energy?: number | null
  genre?: string | null
  subgenre?: string | null
  mood?: string | null
  drumStyle?: string | null
  dnaMatchScore?: number | null
  productionEra?: string | null
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <BpmBadge bpm={bpm} size={size} />
      <KeyBadge keySignature={keySignature} size={size} />
      <EnergyBadge energy={energy} size={size} />
      {genre && <GenreBadge genre={genre} size={size} />}
      {subgenre && subgenre !== genre && <SubgenreBadge subgenre={subgenre} size={size} />}
      {mood && <MoodBadge mood={mood} size={size} />}
      {drumStyle && <DrumStyleBadge drumStyle={drumStyle} size={size} />}
      {productionEra && <ProductionEraBadge era={productionEra} size={size} />}
      {dnaMatchScore !== undefined && dnaMatchScore !== null && (
        <DnaMatchScoreBadge score={dnaMatchScore} size={size} />
      )}
    </div>
  )
}

export default TrackBadgesRow
