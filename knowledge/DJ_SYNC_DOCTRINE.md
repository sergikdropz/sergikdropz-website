# DJ Sync Doctrine (Auto DJ + MixEngine)

Stable rules for beatmatching. Do not re-invent mid-feature.

## Phrase Mix Doctrine (unified Auto DJ model)

One contract drives cues, fire, tempo, and EQ:

| Field | Rule |
| --- | --- |
| Phrase cell | Always **8 bars** from **file t=0** (`n × 8 × barSec`) |
| Beat phase | `beat_grid_offset` is **within-beat only** `[0, beatSec)` — never first-kick absolute time |
| OUT | Last `outPhraseBars` (8/16/24/32) on outgoing 8-bar lines |
| IN | **Phrase 1** = track start + phase nudge (not mid-intro kick) |
| Blend | Exact **8 or 16** bars on the **master (outgoing)** bar clock |
| Tempo Master | Outgoing for 100% of the overlap |
| BeatSync | Only when both decks have a locked grid **or** persisted `beat_grid_offset` |
| EQ / gains | Share one progress 0→1, phrase-quantized knees |
| Residual | Media seek capped to ±½ beat; larger → micro-rate / TempoSync only |
| Freeze | No replan within `PLAN_FREEZE_SEC` (4s) of OUT |
| Pre-arm | Cue idle ≥1 phrase before OUT (silent, beatmatched) |
| Quality gate | Fair/poor last mix → next mix TempoSync + 8-bar blend |
| Sections | Intro / build / drop / breakdown / outro on the same file-start lattice |

Code: `web/lib/audio/mix-engine/phrase-mix-doctrine.ts` → `resolvePhraseMixSettings`.
Helpers: `phrase-lattice.ts` (dual clock), `phrase-sections.ts` (structure map).

Settings UI: primary = Phrase depth / Blend / Style / Sync; advanced knobs do not override the doctrine path when Auto DJ is on.

## Master tempo handoff

During the blend both decks follow one **master BPM** clock:

```
masterBpm(p) = hold(outEffective) → smootherstep → incomingNative
outRate(p)   = masterBpm / outBaseBpm
inRate(p)    = masterBpm / inBaseBpm
```

- Hold beatmatch through the first ~50% (phrase knee at 0.5 / 0.75).
- Glide both decks together so kicks stay locked while the set lands on incoming original BPM.
- Cap large ΔBPM (~8%+): shorter glide / later knee.
- Key-lock (`preservesPitch`) stays on for both decks during the glide.
- `bpmStrategy` **Handoff** / **Native** → end target 1.0; **Manual** → slider.

## Phrase-1 at OUT

- At the OUT marker, incoming media time is phrase 1 (grid) ±½ beat only (`phrase1Lock`).
- Audible blend starts immediately (`blendFromOut`, `incomingDelay = 0`).
- Fire, markers, and fader progress share one clock.

## Separation of concerns

1. **Analysis (offline)** — BPM, grid anchor, onset/kick times, phrase sections, confidence. Stored on the track / Sonic DNA.
2. **Performance (live)** — Master deck sets tempo + phase; slave locks to master. Do not re-guess BPM during a crossfade.

Industry parallels: Serato/Rekordbox locked beatgrids, Traktor Tempo Master + BeatSync vs TempoSync, Mixxx beat grid vs beat map.

## Clocks

- **Media time** (`HTMLMediaElement.currentTime`) is the timeline for phase and cues.
- **Base BPM** (catalog / DNA) defines the beat period on that timeline. Never pass `bpm × playbackRate` into `beatPhaseSec` / `beatPhaseErrorSec`.
- **playbackRate** only: (a) beatmatch so effective tempos match, (b) convert media lead-in to wall-clock fire delay via `mediaDelayToWallMs`.
- **AudioContext.currentTime** may drive fade progress; it must not redefine beat phase.

## Auto DJ phrase cues (canonical)

- **OUT** = last `outPhraseBars` on the outgoing **mathematical 8-bar** grid from file start, then ±½-beat kick nudge only.
- **IN** = phrase 1 ≈ media t≈0 + beat phase (not DNA mid-intro / first kick seconds).
- **Overlap** = exact `overlapBars × barSec` on master (no energy/bias stretch in DJ mode).
- Ignore creative `outroStartRatio` / intro ratios unless `canonicalPhraseCues: false`.
- **Lead-in is prepare-only** (`prepareLeadInSec`) — never moves `startAtOutgoingSec` or OUT markers.
- Freeze the plan within ~4s of OUT; fire re-checks media time vs OUT (±1 beat).
- Prefer locked / persisted **phase** `beat_grid_offset` (fold legacy absolute offsets).
- Kick onset series drive residual BeatSync + section labels — **not** phrase-1 origin.

## AlignmentState

Produce **one** `AlignmentState` per mix start (`solveAlignmentState`):

- Inputs: planned cue, media times, base BPMs, offsets, DNA, peaks, confidence.
- Outputs: `incomingCueSec`, `phaseErrSec`, `confidence`, `phraseLock`, `snareLock`, sources.
- Consumers (`cueIdle`, `prepareAndTransition`, `startTransition`, lead-in chase) **prefer `resolvedIncomingSec`** — do not reset to raw `incomingStartSec` and undo pocket work.

## Confidence honesty

- Missing `measured.bpmConfidence` → **low** default (`MISSING_BPM_CONFIDENCE` ≈ 0.35), not 0.7.
- `phraseLock` only when conf ≥ 0.45 and Bar in ≠ 0.
- Snare pocket only when **both** decks are four-on-the-floor and conf ≥ 0.5 (breakbeats must not snare-pull).

## BeatSync vs TempoSync

- **BeatSync** (default `syncMode: 'beat-sync'`): keep phase lock through most of the audible overlap (`beatSyncLockProgress` / `holdBeatmatch`), then glide.
- **TempoSync** (`syncMode: 'tempo-sync'`): match rate; unlock phase earlier for freer blends.
- Missing grids / low conf / octave / half-time → force TempoSync (`assessBeatSyncSafety`).
- Large residual (> ~18 ms, < half-beat): one media seek; else micro-rate (±0.6%). Never seek beyond ±½ beat.
- Prefer **kick onset series** (`measured.kickOnsetSec` or derived) over envelope-max for residual align.
- Do not arm Auto DJ fire until incoming ghost peaks are ready (≥64 samples), unless late (<0.4s media).

## Grid lock

- Admin/user **Lock Grid** stamps `sonic_dna.gridLocked` + optional `kickOnsetSec` and persists `beat_grid_offset`.
- While locked, Auto DJ must not overwrite grid offset from peak re-align.
- Persisted `beat_grid_offset` alone is enough for BeatSync readiness (`bothGridsReady`).

## Failure taxonomy (check in order)

1. Wrong / unlocked beatgrid or half-time BPM
2. Wall-clock fire ignoring outgoing rate
3. prepare undoing resolved cue
4. Rate-scaled BPM in phase math
5. Mid-mix unlock too early
6. Snare lock on non-FoF grooves
7. Missing incoming peaks at cue time
8. Energy/bias stretching overlap off the 8-bar grid

## Related code

- `web/lib/audio/mix-engine/phrase-mix-doctrine.ts`
- `web/lib/audio/mix-engine/alignment.ts`
- `web/lib/audio/mix-engine/sync.ts`
- `web/lib/audio/mix-engine/MixEngine.ts`
- `web/lib/audio/mix-engine/plan-from-dna.ts`
- `web/components/MusicPlayer.tsx` (Auto DJ tick)

## Future (not yet)

- Optional beat-map (per-beat timing) for non-constant tempo
- Full DSP remeasure for true librosa kick onsets (`backfill-kick-onsets.mjs --remeasure`)
- Cloud-synced mix-quality history (today: localStorage last 20)

## Ops

- Dev: `cd web && npm run dev:ensure && npm run dev:verify`
- Mix-engine unit: `cd web && npx vitest run lib/audio/mix-engine`
