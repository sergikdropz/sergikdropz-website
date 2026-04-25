'use client'

import { useRef, useState } from 'react'
import ThreeBandEQ from './ThreeBandEQ'

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  album?: string
  folder?: string
  bpm?: number
}

interface PlayerSettings {
  volume: number
  isMuted: boolean
  isShuffled: boolean
  repeatMode: 'off' | 'all' | 'one'
  playbackRate: number
  crossfadeDuration: number
  eqPreset: 'flat' | 'bass' | 'treble' | 'vocal'
  bufferSize: 'small' | 'medium' | 'large' | 'auto'
  streamQuality?: 'standard' | 'HD' | 'UHD' | 'auto'
  prioritizeBackgroundPlayback?: boolean
}

interface ExpandedPlayerControlsProps {
  currentTrack: Track | null
  settings: PlayerSettings
  detectedBPM: number | null
  isDetectingBPM: boolean
  tapTempoTaps: number[]
  tapTempoBPM: number | null
  audioContext: AudioContext | null
  sourceNode: MediaElementAudioSourceNode | null
  analyserNode: AnalyserNode | null
  audioContextReady?: boolean
  connectionQuality: 'slow' | 'medium' | 'fast'
  networkEffectiveType: string | null
  onTapTempo: () => void
  onTempoChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onChangePlaybackRate: (rate: number) => void
  onSaveSettings: (newSettings: Partial<PlayerSettings>) => void
  getTempoPercentage: (rate: number) => number
  getAdjustedBPM: (originalBPM: number | null, rate: number) => number | null
  rateToTempoValue: (rate: number) => number
  onBPMUpdate?: (bpm: number) => void
}

export default function ExpandedPlayerControls({
  currentTrack,
  settings,
  detectedBPM,
  isDetectingBPM,
  tapTempoTaps,
  tapTempoBPM,
  audioContext,
  sourceNode,
  analyserNode,
  audioContextReady,
  connectionQuality,
  networkEffectiveType,
  onTapTempo,
  onTempoChange,
  onChangePlaybackRate,
  onSaveSettings,
  getTempoPercentage,
  getAdjustedBPM,
  rateToTempoValue,
  onBPMUpdate,
}: ExpandedPlayerControlsProps) {
  const [isEditingBPM, setIsEditingBPM] = useState(false)
  const [editingBPM, setEditingBPM] = useState<string>('')
  const [isSavingBPM, setIsSavingBPM] = useState(false)

  const handleBPMEdit = () => {
    setIsEditingBPM(true)
    setEditingBPM(detectedBPM?.toString() || '')
  }

  const handleBPMCancel = () => {
    setIsEditingBPM(false)
    setEditingBPM('')
  }

  const handleBPMSave = async () => {
    const bpmValue = parseInt(editingBPM)
    if (isNaN(bpmValue) || bpmValue < 30 || bpmValue > 300) {
      alert('BPM must be between 30 and 300')
      return
    }

    setIsSavingBPM(true)
    try {
      if (onBPMUpdate) {
        await onBPMUpdate(bpmValue)
        setIsEditingBPM(false)
        setEditingBPM('')
      }
    } catch (error: any) {
      console.error('Error updating BPM:', error)
      const errorMessage = error?.message || 'Failed to update BPM. Please try again.'
      alert(errorMessage)
      // Keep editing mode open so user can retry
    } finally {
      setIsSavingBPM(false)
    }
  }

  const handleBPMKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBPMSave()
    } else if (e.key === 'Escape') {
      handleBPMCancel()
    }
  }

  return (
    <div className="container mx-auto px-4 pb-3 border-t border-gray-800 pt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tempo + EQ Combined Column */}
        <div className="flex flex-col gap-3">
          {/* Tempo + EQ Row */}
          <div className="flex gap-3">
            {/* CDJ-Style Tempo Control */}
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-2 block">Tempo</label>
              <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                {/* BPM Display */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Original</div>
                    {isEditingBPM ? (
                      <div className="flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          min="30"
                          max="300"
                          value={editingBPM}
                          onChange={(e) => setEditingBPM(e.target.value)}
                          onKeyDown={handleBPMKeyPress}
                          className="w-16 px-2 py-1 text-lg font-mono font-bold text-white bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-center"
                          autoFocus
                          disabled={isSavingBPM}
                        />
                        <button
                          onClick={handleBPMSave}
                          disabled={isSavingBPM}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          title="Save BPM"
                        >
                          {isSavingBPM ? '...' : '✓'}
                        </button>
                        <button
                          onClick={handleBPMCancel}
                          disabled={isSavingBPM}
                          className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div 
                        className="text-lg font-mono font-bold text-white cursor-pointer hover:text-blue-400 transition-colors group relative"
                        onClick={handleBPMEdit}
                        title="Click to edit BPM"
                      >
                        {isDetectingBPM ? (
                          <span className="text-xs text-gray-400">...</span>
                        ) : (
                          <>
                            {detectedBPM?.toFixed(0) || '---'}
                            <span className="ml-1 text-xs text-gray-500 opacity-0 group-hover:opacity-100">✎</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-500">BPM</div>
                  </div>
                  <div className="text-center flex-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Adjusted</div>
                    <div className={`text-lg font-mono font-bold ${
                      Math.abs(getTempoPercentage(settings.playbackRate)) > 0.1 
                        ? 'text-yellow-400' 
                        : 'text-white'
                    }`}>
                      {getAdjustedBPM(detectedBPM, settings.playbackRate)?.toFixed(1) || '---'}
                    </div>
                    <div className="text-[10px] text-gray-500">BPM</div>
                  </div>
                </div>
                
                {/* Tap Tempo Button */}
                <div className="flex items-center justify-center mb-2">
                  <button
                    onClick={onTapTempo}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                      tapTempoTaps.length > 0
                        ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:scale-95'
                    }`}
                    title="Tap to detect BPM"
                  >
                    {tapTempoTaps.length === 0 ? (
                      '🎵 Tap Tempo'
                    ) : tapTempoTaps.length === 1 ? (
                      'Tap again...'
                    ) : tapTempoBPM ? (
                      `✓ ${tapTempoBPM} BPM`
                    ) : (
                      `Tapping... (${tapTempoTaps.length})`
                    )}
                  </button>
                </div>
                
                {tapTempoTaps.length > 0 && (
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500">
                      {tapTempoTaps.length >= 2 
                        ? `Tap ${tapTempoTaps.length} - ${tapTempoBPM ? 'Detected!' : 'Keep tapping...'}`
                        : 'Tap at least 2 times'}
                    </div>
                  </div>
                )}
                
                {/* Tempo Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">-50%</span>
                    <div className="flex-1 mx-2">
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="0.1"
                        value={rateToTempoValue(settings.playbackRate)}
                        onChange={onTempoChange}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        title="Adjust tempo"
                        aria-label="Adjust tempo"
                      />
                    </div>
                    <span className="text-[10px] text-gray-500">+50%</span>
                  </div>
                  
                  {/* Percentage and BPM Display */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`text-sm font-mono font-bold ${
                        Math.abs(getTempoPercentage(settings.playbackRate)) > 0.1 
                          ? 'text-yellow-400' 
                          : 'text-gray-400'
                      }`}>
                        {getTempoPercentage(settings.playbackRate) >= 0 ? '+' : ''}
                        {getTempoPercentage(settings.playbackRate).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-wide">Tempo</div>
                    </div>
                    {detectedBPM && (
                      <div className="flex flex-col items-center">
                        <div className={`text-sm font-mono font-bold ${
                          Math.abs(getTempoPercentage(settings.playbackRate)) > 0.1 
                            ? 'text-yellow-400' 
                            : 'text-white'
                        }`}>
                          {getAdjustedBPM(detectedBPM, settings.playbackRate)?.toFixed(0) || '---'}
                        </div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wide">BPM</div>
                      </div>
                    )}
                    <button
                      onClick={() => onChangePlaybackRate(1)}
                      className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded transition-colors"
                      title="Reset to 0%"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Crossfade - Below Tempo, matching width */}
              <div className="mt-2">
                <label className="text-xs text-gray-400 mb-2 block">
                  Crossfade: {settings.crossfadeDuration}s
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  value={settings.crossfadeDuration}
                  onChange={(e) => onSaveSettings({ crossfadeDuration: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  title="Adjust crossfade duration"
                  aria-label="Adjust crossfade duration"
                />
              </div>
            </div>
            
            {/* 3-Band EQ - Vertical, next to Tempo */}
            <div className="flex-shrink-0">
              <ThreeBandEQ
                audioContext={audioContext}
                sourceNode={sourceNode}
                analyserNode={analyserNode}
                audioContextReady={audioContextReady}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

