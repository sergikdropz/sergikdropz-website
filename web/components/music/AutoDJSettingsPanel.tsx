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
  BLEND_QUANTIZE_OPTIONS,
  BEAT_CORRECT_OPTIONS,
  CUE_PRIORITY_OPTIONS,
  MIX_LENGTH_BIAS_OPTIONS,
  LOOKAHEAD_OPTIONS,
  toggleMixTechnique,
  isTechniqueCompatible,
  type AutoDJConfig,
} from '@/lib/audio/auto-dj-preferences'
import MixQualityHud from '@/components/music/MixQualityHud'

const MIX_HISTORY_OPEN_KEY = 'sergik-autodj-mix-history-open'

function readMixHistoryOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(MIX_HISTORY_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeMixHistoryOpen(open: boolean) {
  try {
    sessionStorage.setItem(MIX_HISTORY_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore quota */
  }
}

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
  pairWhy?: string | null
  beatSyncUnsafe?: string | null
  pickStall?: {
    rejectReason: string
    topRejectedWhy: string | null
    needsLockGrids: boolean
    needsRemeasureKicks: boolean
    suggestTempoSync: boolean
  } | null
  onMixNow?: () => void
  onPreviewBlend?: () => void
  onLockQueuedGrids?: () => void
  onRemeasureKicks?: () => void
  onTempoSyncPair?: () => void
  mixActionsDisabled?: boolean
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
  pairWhy = null,
  beatSyncUnsafe = null,
  pickStall = null,
  onMixNow,
  onPreviewBlend,
  onLockQueuedGrids,
  onRemeasureKicks,
  onTempoSyncPair,
  mixActionsDisabled = false,
}: AutoDJSettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(readMixHistoryOpen)
  const creative = config.creativeMode === true
  const styleLabel =
    MIX_STYLE_PRESETS.find((p) => p.id === config.mixStyle)?.label ?? 'Smooth'
  const techniquesLabel = config.mixTechniques
    .map((id) => MIX_TECHNIQUES.find((t) => t.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .join(' + ')
  const summary = doctrineSummaryLine({
    outPhraseBars: config.outPhraseBars,
    overlapBars: config.overlapBars === 16 ? 16 : 8,
    syncMode: config.syncMode,
    bpmStrategy: config.bpmStrategy,
    mixStyleLabel: styleLabel,
    techniquesLabel,
  })

  return (
    <div className="space-y-2 text-[11px] text-gray-300">
      <label className="flex items-center gap-2 text-[10px] text-gray-400">
        <input
          type="checkbox"
          checked={creative}
          onChange={(e) => onPatch({ creativeMode: e.target.checked })}
          className="accent-amber-500"
        />
        Creative mode (exit phrase-1 / exact overlap doctrine)
      </label>

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
              // transitionMode is deprecated — mixStyle + techniques drive the engine.
              onPatch({ mixStyle })
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
          <span className="text-[10px] text-gray-500">Quantize</span>
          <select
            value={config.blendQuantize}
            onChange={(e) =>
              onPatch({ blendQuantize: e.target.value as AutoDJConfig['blendQuantize'] })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            title={BLEND_QUANTIZE_OPTIONS.find((o) => o.id === config.blendQuantize)?.hint}
          >
            {BLEND_QUANTIZE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.hint}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-gray-500">Beat correct</span>
          <select
            value={config.beatCorrect}
            onChange={(e) =>
              onPatch({ beatCorrect: e.target.value as AutoDJConfig['beatCorrect'] })
            }
            className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            title={BEAT_CORRECT_OPTIONS.find((o) => o.id === config.beatCorrect)?.hint}
          >
            {BEAT_CORRECT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.hint}>
                {o.label}
              </option>
            ))}
          </select>
          {config.syncMode === 'beat-sync' ? (
            <span className="text-[9px] leading-snug text-gray-500">
              BeatSync lattice follows the waveform phase-meter window (beat / bar / phrase).
            </span>
          ) : null}
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
      </div>

      <div
        className="rounded-md border border-emerald-900/50 bg-emerald-950/20 px-2 py-1.5 text-[9px] text-emerald-300/95 leading-tight"
        title="Phrase Mix Doctrine — cues, handoff curve, and BeatSync vinyl bend"
      >
        {creative ? `Creative · ${summary}` : summary}
        <span className="text-emerald-500/70">
          {creative
            ? ' · memory / DNA cues allowed'
            : ' · incoming bass killed · phrase-1 IN · grids preferred'}
        </span>
      </div>

      {pickStall ? (
        <div
          className="rounded-md border border-rose-800/70 bg-rose-950/40 px-2 py-1.5 space-y-1.5"
          role="status"
        >
          <p className="text-[10px] text-rose-100 leading-tight">
            Why no next track: {pickStall.rejectReason}
            {pickStall.topRejectedWhy ? (
              <span className="text-rose-200/70"> · {pickStall.topRejectedWhy}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-1">
            {pickStall.needsLockGrids ? (
              <button
                type="button"
                onClick={onLockQueuedGrids}
                className="h-7 rounded-md border border-rose-700/80 bg-rose-900/40 px-2 text-[10px] font-semibold text-rose-100 hover:bg-rose-900/60"
              >
                Lock grids
              </button>
            ) : null}
            {pickStall.needsRemeasureKicks ? (
              <button
                type="button"
                onClick={onRemeasureKicks}
                className="h-7 rounded-md border border-rose-700/80 bg-rose-900/40 px-2 text-[10px] font-semibold text-rose-100 hover:bg-rose-900/60"
              >
                Remeasure
              </button>
            ) : null}
            {pickStall.suggestTempoSync ? (
              <button
                type="button"
                onClick={onTempoSyncPair}
                className="h-7 rounded-md border border-amber-700/80 bg-amber-950/50 px-2 text-[10px] font-semibold text-amber-100 hover:bg-amber-900/50"
              >
                TempoSync this pair
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pairWhy ? (
        <p className="text-[10px] text-gray-400 leading-tight" title="Why Auto DJ picked this pair">
          Next: {pairWhy}
        </p>
      ) : null}

      {beatSyncUnsafe ? (
        <p
          className="rounded-md border border-amber-800/70 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200"
          role="status"
        >
          BeatSync unsafe — {beatSyncUnsafe}
        </p>
      ) : null}

      <label className="flex items-center gap-2 text-[10px] text-gray-400">
        <input
          type="checkbox"
          checked={config.sectionStyle}
          onChange={(e) => onPatch({ sectionStyle: e.target.checked })}
          className="accent-violet-500"
        />
        Auto style from section (Smooth is the cap)
      </label>

      <label className="flex items-center gap-2 text-[10px] text-gray-400">
        <input
          type="checkbox"
          checked={config.autoCorrectWeakMixes}
          onChange={(e) => onPatch({ autoCorrectWeakMixes: e.target.checked })}
          className="accent-emerald-500"
        />
        Auto-correct weak mixes (shorter blend · TempoSync after 2)
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={mixActionsDisabled}
          onClick={onMixNow}
          className="h-8 rounded-md border border-emerald-800 bg-emerald-950/40 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-40"
          title="Start the blend from the current bar"
        >
          Mix now
        </button>
        <button
          type="button"
          disabled={mixActionsDisabled}
          onClick={onPreviewBlend}
          className="h-8 rounded-md border border-gray-700 text-[10px] font-semibold text-gray-300 hover:bg-gray-800 disabled:opacity-40"
          title="Audition the incoming deck for 4 bars"
        >
          Preview 4 bars
        </button>
        <button
          type="button"
          onClick={onLockQueuedGrids}
          className="h-8 rounded-md border border-gray-700 text-[10px] font-semibold text-gray-300 hover:bg-gray-800"
          title="Lock beat grids on the current track and queued successors"
        >
          Lock queued grids
        </button>
        <button
          type="button"
          onClick={onRemeasureKicks}
          className="h-8 rounded-md border border-gray-700 text-[10px] font-semibold text-gray-300 hover:bg-gray-800"
          title="Rebuild kick onsets from the waveform and persist them"
        >
          Remeasure kicks
        </button>
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
            {creative ? (
              <>
                <label className="flex flex-col gap-1 min-w-0">
                  <span className="text-[10px] text-gray-500">Bar in</span>
                  <select
                    value={config.inPhraseBars}
                    onChange={(e) =>
                      onPatch({ inPhraseBars: Number(e.target.value) as InPhraseBars })
                    }
                    className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
                    title="Creative override for phrase-1 IN"
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
                  <span className="text-[10px] text-gray-500">Cue priority</span>
                  <select
                    value={config.cuePriority}
                    onChange={(e) =>
                      onPatch({ cuePriority: e.target.value as AutoDJConfig['cuePriority'] })
                    }
                    className="h-8 w-full rounded-md border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200"
                    title={CUE_PRIORITY_OPTIONS.find((o) => o.id === config.cuePriority)?.hint}
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
                  >
                    {MIX_LENGTH_BIAS_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id} title={o.hint}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p className="col-span-full text-[9px] text-gray-500 leading-snug">
                Canonical Auto DJ holds energy / bar-in / length / cue priority at phrase-1.
                Enable Creative mode to edit them.
              </p>
            )}
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
          </div>
        </div>
      ) : null}

      <MixQualityHud quality={lastMixQuality} />

      {mixQualityHistory.length > 0 ? (
        <div className="rounded-md border border-gray-800/80 bg-black/20 px-2 py-1.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 text-left text-[9px] uppercase tracking-[0.14em] text-gray-500 hover:text-gray-300"
              aria-expanded={historyOpen}
              onClick={() => {
                const next = !historyOpen
                setHistoryOpen(next)
                writeMixHistoryOpen(next)
              }}
            >
              <span aria-hidden="true">{historyOpen ? '▾' : '▸'}</span>
              <span>Mix history</span>
              <span className="normal-case tracking-normal text-gray-600">
                {mixQualityHistory.length}
              </span>
            </button>
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
          {historyOpen ? (
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
          ) : null}
        </div>
      ) : null}

      {statusMessage ? (
        <p data-testid="autodj-status" className="text-[10px] text-emerald-300">
          {statusMessage}
        </p>
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
