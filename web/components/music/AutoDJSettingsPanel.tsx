'use client'

import { useState } from 'react'
import {
  MIX_STYLE_PRESETS,
  MIX_TECHNIQUES,
  DJ_OVERLAP_OPTIONS,
  doctrineSummaryLine,
  type MixStylePreset,
  type OutPhraseBars,
  type InPhraseBars,
  type PhraseBars,
  type MixQualitySnapshot,
  type MixQualityHistoryEntry,
  clearMixQualityHistory,
} from '@/lib/audio/mix-engine'
import {
  HARMONIC_MATCH_OPTIONS,
  ENERGY_CURVE_OPTIONS,
  BPM_STRATEGY_OPTIONS,
  SYNC_MODE_OPTIONS,
  CUE_PRIORITY_OPTIONS,
  MIX_LENGTH_BIAS_OPTIONS,
  LOOKAHEAD_OPTIONS,
  legacyTransitionFromMixStyle,
  toggleMixTechnique,
  isTechniqueCompatible,
  type AutoDJConfig,
} from '@/lib/audio/auto-dj-preferences'
import MixQualityHud from '@/components/music/MixQualityHud'

const OUT_PHRASE_OPTIONS: OutPhraseBars[] = [32, 24, 16, 8]
const IN_PHRASE_OPTIONS: InPhraseBars[] = [8, 0]

export type AutoDJSettingsPanelProps = {
  config: AutoDJConfig
  leadIn: number
  suggestedLeadIn: number
  fanUserId: string | null
  saving: boolean
  dirty: boolean
  statusMessage?: string
  lastMixQuality?: MixQualitySnapshot | null
  mixQualityHistory?: MixQualityHistoryEntry[]
  onMixQualityHistoryChange?: (next: MixQualityHistoryEntry[]) => void
  onPatch: (patch: Partial<AutoDJConfig>) => void
  onLeadIn: (value: number) => void
  onSave: () => void
  onReset: () => void
}

export default function AutoDJSettingsPanel({
  config,
  leadIn,
  suggestedLeadIn,
  fanUserId,
  saving,
  dirty,
  statusMessage,
  lastMixQuality = null,
  mixQualityHistory = [],
  onMixQualityHistoryChange,
  onPatch,
  onLeadIn,
  onSave,
  onReset,
}: AutoDJSettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const summary = doctrineSummaryLine({
    outPhraseBars: config.outPhraseBars,
    overlapBars: config.overlapBars === 16 ? 16 : 8,
    syncMode: config.syncMode,
    bpmStrategy: config.bpmStrategy,
  })

  return (
    <div className="space-y-2 text-[11px] text-gray-300">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Phrase depth</span>
          <select
            value={config.outPhraseBars}
            onChange={(e) =>
              onPatch({ outPhraseBars: Number(e.target.value) as OutPhraseBars })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            title="How deep into the outro (always snaps on 8-bar lines)"
          >
            {OUT_PHRASE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Last {n} bars
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Blend</span>
          <select
            value={config.overlapBars === 16 ? 16 : 8}
            onChange={(e) =>
              onPatch({ overlapBars: Number(e.target.value) as PhraseBars })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            title="Exact 8-bar phrase overlap on the master deck"
          >
            {DJ_OVERLAP_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} bars
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Mix style</span>
          <select
            value={config.mixStyle}
            onChange={(e) => {
              const mixStyle = e.target.value as MixStylePreset
              onPatch({
                mixStyle,
                transitionMode: legacyTransitionFromMixStyle(mixStyle),
              })
            }}
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {MIX_STYLE_PRESETS.map((p) => (
              <option key={p.id} value={p.id} title={p.hint}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Sync</span>
          <select
            value={config.syncMode}
            onChange={(e) =>
              onPatch({ syncMode: e.target.value as AutoDJConfig['syncMode'] })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
            title={SYNC_MODE_OPTIONS.find((o) => o.id === config.syncMode)?.hint}
          >
            {SYNC_MODE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.hint}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 items-end">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Harmonic</span>
          <select
            value={config.harmonicMatch}
            onChange={(e) =>
              onPatch({ harmonicMatch: e.target.value as AutoDJConfig['harmonicMatch'] })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
          >
            {HARMONIC_MATCH_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.hint}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Lookahead</span>
          <select
            value={config.lookahead}
            onChange={(e) =>
              onPatch({ lookahead: Number(e.target.value) as AutoDJConfig['lookahead'] })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
          >
            {LOOKAHEAD_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="rounded-md border border-emerald-900/50 bg-emerald-950/20 px-2 py-1.5 text-[9px] text-emerald-300/95 leading-tight"
        title="Phrase Mix Doctrine — single DJ phrasing contract"
      >
        {summary}
        <span className="text-emerald-500/70"> · IN always phrase 1 · grids preferred</span>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        {showAdvanced ? 'Hide advanced' : 'Advanced'}
      </button>

      {showAdvanced ? (
        <div className="space-y-2 rounded-md border border-gray-800/80 bg-black/20 p-2">
          <div className="space-y-1.5">
            <span className="text-[10px] text-gray-500">Techniques</span>
            <div className="flex flex-wrap gap-1">
              {MIX_TECHNIQUES.map((t) => {
                const active = config.mixTechniques.includes(t.id)
                const compatible = isTechniqueCompatible(config.mixTechniques, t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.hint}
                    disabled={!compatible && !active}
                    onClick={() =>
                      onPatch({
                        mixTechniques: toggleMixTechnique(config.mixTechniques, t.id),
                      })
                    }
                    className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                      active
                        ? 'bg-violet-600/40 border-violet-500/60 text-violet-100'
                        : compatible
                          ? 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                          : 'border-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-gray-500 shrink-0">Lead-in</span>
              <input
                type="range"
                min="0"
                max="3"
                step="0.25"
                value={leadIn}
                onChange={(e) => onLeadIn(Number(e.target.value))}
                className="min-w-0 flex-1 accent-blue-500"
                aria-label="Lead-in offset"
              />
              <span className="text-[10px] text-gray-300 tabular-nums w-9 text-right shrink-0">
                {Math.max(leadIn, suggestedLeadIn).toFixed(2)}s
              </span>
              {suggestedLeadIn > leadIn + 0.04 && (
                <span
                  className="text-[9px] text-blue-400/90 shrink-0"
                  title="Phrase-grid lead-in applied automatically"
                >
                  +auto
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-gray-500">Bar in (legacy)</span>
              <select
                value={config.inPhraseBars}
                onChange={(e) =>
                  onPatch({ inPhraseBars: Number(e.target.value) as InPhraseBars })
                }
                className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
                title="DJ mode always uses phrase 1; kept for creative overrides"
              >
                {IN_PHRASE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? '0' : '8 bars'}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-gray-500">Energy curve</span>
              <select
                value={config.energyCurve}
                onChange={(e) =>
                  onPatch({ energyCurve: e.target.value as AutoDJConfig['energyCurve'] })
                }
                className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
              >
                {ENERGY_CURVE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-gray-500">BPM strategy</span>
              <select
                value={config.bpmStrategy}
                onChange={(e) =>
                  onPatch({ bpmStrategy: e.target.value as AutoDJConfig['bpmStrategy'] })
                }
                className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
              >
                {BPM_STRATEGY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-gray-500">Cue priority</span>
              <select
                value={config.cuePriority}
                onChange={(e) =>
                  onPatch({ cuePriority: e.target.value as AutoDJConfig['cuePriority'] })
                }
                className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
                title="DJ mode forces first downbeat / phrase 1"
              >
                {CUE_PRIORITY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-gray-500">Mix length</span>
              <select
                value={config.mixLengthBias}
                onChange={(e) =>
                  onPatch({ mixLengthBias: e.target.value as AutoDJConfig['mixLengthBias'] })
                }
                className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
                title="Ignored in DJ phrase mode (exact N×8 bars)"
              >
                {MIX_LENGTH_BIAS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <MixQualityHud quality={lastMixQuality} />

      {mixQualityHistory.length > 0 ? (
        <div className="rounded-md border border-gray-800/80 bg-black/20 px-2 py-1.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-[0.14em] text-gray-500">
              Mix history
            </span>
            <button
              type="button"
              className="text-[9px] text-gray-500 hover:text-gray-300"
              onClick={() => {
                clearMixQualityHistory()
                onMixQualityHistoryChange?.([])
              }}
            >
              Clear
            </button>
          </div>
          <ul className="max-h-28 overflow-y-auto space-y-0.5">
            {mixQualityHistory.slice(0, 8).map((e) => (
              <li
                key={`${e.at}-${e.grade}`}
                className="text-[9px] text-gray-400 tabular-nums flex justify-between gap-2"
                title={e.reason || undefined}
              >
                <span className="truncate min-w-0">
                  <span className="text-gray-300 font-medium">{e.label}</span>
                  {e.outgoingTitle || e.incomingTitle
                    ? ` · ${(e.outgoingTitle || '?').slice(0, 18)} → ${(e.incomingTitle || '?').slice(0, 18)}`
                    : ''}
                </span>
                <span className="shrink-0 opacity-80">
                  {(e.phaseRmsSec * 1000).toFixed(0)}/{e.kickResidualRmsMs.toFixed(0)}ms
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {statusMessage ? (
        <p className="text-[10px] text-emerald-300">{statusMessage}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={`h-8 rounded-md text-[11px] font-semibold transition-colors ${
            fanUserId
              ? dirty
                ? 'bg-emerald-700 text-white hover:bg-emerald-600'
                : 'bg-emerald-900/50 text-emerald-300 border border-emerald-800'
              : 'bg-gray-800 text-gray-400 border border-gray-700'
          }`}
          title={
            fanUserId
              ? 'Save Auto DJ settings to your account'
              : 'Sign in to sync settings across devices'
          }
        >
          {saving ? 'Saving…' : fanUserId ? (dirty ? 'Save settings' : 'Saved') : 'Save local'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-8 rounded-md text-[11px] font-semibold border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          title="Reset Auto DJ to default settings"
        >
          Defaults
        </button>
      </div>
    </div>
  )
}
