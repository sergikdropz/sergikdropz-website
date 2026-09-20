'use client'

import type { IDJConfig, IDJDeckId } from '@/lib/audio/idj-preferences'

export default function IDJSettingsPanel({
  config,
  onPatch,
  onCenterCrossfader,
  onResetEq,
  onResetDjModes,
}: {
  config: IDJConfig
  onPatch: (patch: Partial<IDJConfig>) => void
  onCenterCrossfader: () => void
  onResetEq: () => void
  onResetDjModes?: () => void
}) {
  const setContinuous = (deck: IDJDeckId, on: boolean) => {
    onPatch({
      continuousPlay: {
        ...config.continuousPlay,
        [deck]: on,
      },
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-snug text-gray-500">
        Left-click the iDJ button to turn the mixer on or off. These options stay with the
        session.
      </p>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Continuous play
        </p>
        <p className="text-[10px] leading-snug text-gray-500">
          When a deck ends, load the next track on that deck and keep going. Also on each
          play button (right-click).
        </p>
        <div className="flex gap-3">
          {(['a', 'b'] as const).map((deck) => (
            <label key={deck} className="flex items-center gap-1.5 text-[11px] text-gray-300">
              <input
                type="checkbox"
                checked={config.continuousPlay[deck]}
                onChange={(e) => setContinuous(deck, e.target.checked)}
                className="accent-violet-500"
              />
              Deck {deck.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={config.cueJumpPlay}
          onChange={(e) => onPatch({ cueJumpPlay: e.target.checked })}
          className="mt-0.5 accent-violet-500"
        />
        <span>
          <span className="font-medium text-white">Cue play</span>
          <span className="mt-0.5 block text-[10px] text-gray-500">
            On: CUE seeks and plays. Off: Cue stop — seek and pause (CDJ-style). Also on the
            CUE button menu.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={config.cueMenuLaunch}
          onChange={(e) => onPatch({ cueMenuLaunch: e.target.checked })}
          className="mt-0.5 accent-violet-500"
        />
        <span>
          <span className="font-medium text-white">Cue launch from menu</span>
          <span className="mt-0.5 block text-[10px] text-gray-500">
            On: picking a cue in the CUE menu jumps there now. Off: arm only — tap CUE later
            to fire.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={config.startOnCue}
          onChange={(e) => onPatch({ startOnCue: e.target.checked })}
          className="mt-0.5 accent-violet-500"
        />
        <span>
          <span className="font-medium text-white">Start new tracks on cue</span>
          <span className="mt-0.5 block text-[10px] text-gray-500">
            Skip / load parks at that deck’s memory cue when one exists. Otherwise starts at
            0:00.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={config.snapToGrid}
          onChange={(e) => onPatch({ snapToGrid: e.target.checked })}
          className="mt-0.5 accent-violet-500"
        />
        <span>
          <span className="font-medium text-white">Snap pointer to grid</span>
          <span className="mt-0.5 block text-[10px] text-gray-500">
            Click, SET, and hot cues land on the nearest beat, bar, or phrase for the current
            zoom.
          </span>
        </span>
      </label>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onCenterCrossfader}
          className="h-8 rounded-md border border-violet-800 bg-violet-950/40 text-[10px] font-semibold text-violet-200 hover:bg-violet-900/50"
          title="Set the crossfader to center (same as double-click)"
        >
          Center XF
        </button>
        <button
          type="button"
          onClick={onResetEq}
          className="h-8 rounded-md border border-gray-700 bg-gray-900/80 text-[10px] font-semibold text-gray-200 hover:bg-gray-800"
          title="Reset LOW / MID / HIGH on both decks"
        >
          Reset EQ
        </button>
      </div>

      {onResetDjModes && (
        <button
          type="button"
          onClick={onResetDjModes}
          className="h-8 w-full rounded-md border border-amber-800/60 bg-amber-950/30 text-[10px] font-semibold text-amber-100 hover:bg-amber-900/40"
          title="Turn off iDJ and Auto DJ so the queue plays continuously"
        >
          Reset DJ modes (library continuous)
        </button>
      )}
    </div>
  )
}
