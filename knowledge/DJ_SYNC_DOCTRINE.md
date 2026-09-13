# DJ Sync Doctrine (Auto DJ + MixEngine)

Stable rules for beatmatching. Do not re-invent mid-feature.

## Phrase Mix Doctrine (unified Auto DJ model)

One contract drives cues, fire, tempo, and EQ:

| Field | Rule |
| --- | --- |
| Phrase cell | Always **8 bars** from **file t=0** (`n × 8 × barSec`) |
| Beat phase | `beat_grid_offset` is **within-beat only** `[0, beatSec)` — never first-kick absolute time |
| OUT | Last `outPhraseBars` (8/16/24/32) on outgoing 8-bar lines |
| IN | **Phrase 1** matched to outgoing’s current bar (not mid-intro kick, not always t=0) |
| Blend | Exact **8 or 16** bars on the **master (outgoing)** bar clock. Stretch to **16** when \|ΔBPM\| / master > 4% or outgoing is still a drop (quality gate still forces 8) |
| Tempo Master | Outgoing for 100% of the overlap |
| BeatSync | Only when both decks have a locked grid **or** persisted `beat_grid_offset` |
| EQ / gains | One overlap clock (`overlap-clock.ts`). Tempo = continuous lattice 0–1. Faders/EQ = bar-aligned slices (turns on outgoing bars). Complementary bass (−24 dB, incoming held until mid-blend knee). Complementary mid when vocals are present. Smooth incoming delay ~0.04–0.08 |
| Residual | Incoming-only PI vinyl bend ±1.8% for the **whole overlap** (fused grid/kick + walk I-term); never copy onto master |
| Freeze | No replan within `PLAN_FREEZE_SEC` (4s) of OUT |
| Pre-arm | Cue idle ≥1 phrase before OUT (silent, beatmatched) |
| Quality gate | First fair/poor → 8-bar blend + stronger bend (keep BeatSync). 2 consecutive → TempoSync |
| Sections | Intro / build / drop / breakdown / outro on the same file-start lattice |

Code: `web/lib/audio/mix-engine/phrase-mix-doctrine.ts` → `resolvePhraseMixSettings`.
Helpers: `phrase-lattice.ts` (dual clock), `phrase-sections.ts` (structure map).

Settings UI: primary = Phrase depth / Blend / Style / Sync / Techniques. Styles and techniques drive MixIntelligence (handoff delay, echo, vinyl-bend strength, filters). DJ cues stay phrase-1 IN + exact 8/16 overlap.

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

- At the OUT marker, incoming media time is **phrase 1 matched to outgoing’s current bar/beat** (`phrase1Lock`). If fire is 2 bars late, incoming is 2 bars into phrase 1 — not file t=0.
- Smooth keeps a small incoming delay (~½–1 bar of mix progress) so mids don’t slap on frame 0. Cut still zeros delay.
- Faders and EQ share `sampleOverlapClock` (bar-aligned slices). Tempo uses the same continuous lattice 0–1. Fire, markers, and media elapsed share that clock.
- Echo send dies over the last beat of the mix. Filter/EQ settle is **one beat** of master tempo, not a fixed 280 ms.

## Separation of concerns

1. **Analysis (offline)** — BPM, grid anchor, onset/kick times, phrase sections, confidence. Stored on the track / Sonic DNA.
2. **Performance (live)** — Master deck sets tempo + phase; slave locks to master. Do not re-guess BPM during a crossfade.
3. **Orchestration** — `auto-dj-controller.ts` owns the tick/fire loop; `auto-dj-plan.ts` / `auto-dj-cue-idle.ts` are pure/host helpers. `transitionMode` is legacy-only (`mixStyle` + `mixTechniques` are canonical).

Industry parallels: Serato/Rekordbox locked beatgrids, Traktor Tempo Master + BeatSync vs TempoSync, Mixxx beat grid vs beat map.

## Clocks

- **Media time** is the timeline for phase and cues. Incoming during Auto DJ uses a per-deck `AudioBufferSourceNode` on the shared `AudioContext` clock (decode on pre-arm). Do **not** stop that buffer and `play()` HTMLAudio at handoff — that is the mix-end click.
- Outgoing stays on `HTMLAudioElement` for the live track. After handoff the incoming buffer **becomes** the live deck until `loadIdle` / `loadActive` on that deck.
- Snapshot buffer media time (`mediaSec += elapsed × rate`) before any vinyl-bend rate change.
- **Base BPM** (catalog / DNA) defines the beat period on that timeline. Never pass `bpm × playbackRate` into `beatPhaseSec` / `beatPhaseErrorSec`.
- **playbackRate** only: (a) beatmatch so effective tempos match, (b) convert media lead-in to wall-clock fire delay via `mediaDelayToWallMs`.
- **AudioContext.currentTime** integrates the outgoing virtual clock and incoming BufferSource. Fade / EQ / tempo / phase all sample `overlap-clock.ts` from that media elapsed — HTMLAudio `currentTime` is only a soft follow, never the fade lattice.
- Fader/EQ turns sit on outgoing **bar lines**. Tempo glide stays continuous on the same 0–1 (never 70/30 quarter-steps).

## Auto DJ phrase cues (canonical)

- **OUT** = last `outPhraseBars` on the outgoing **mathematical 8-bar** grid from file start, then ±½-beat kick nudge only.
- **IN** = phrase 1 **matched to outgoing’s current bar** on the file-start lattice (not DNA mid-intro / first kick, not always t=0).
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
- **Pre-audible nudge:** while incoming fader is 0 (pre-arm + first 2%), seek up to ±½ beat and vinyl-bend up to ±3.5%. Do not `parkIdleAtCue` after `warmIdle` — park pauses and throws the lock away.
- Audible residual: incoming-only PI vinyl bend (±1.8%) for the whole overlap. Fuse filtered grid phase with **kick on the downbeat and clap/snare on the backbeat** when they agree with the grid; I-term trims incoming rate on a detected walk (`de/dt`). Filter `currentTime` jitter (~80 ms) before chasing. Never copy the bend onto the outgoing/master deck. Never seek after faders open. Code: `drift-align.ts`.
- Apply both deck rates **instantly** from the same `masterBpm` — per-deck slew splits effective BPM and creates drift.
- Do not abandon BeatSync mid-blend unless half-beat error persists ~600ms *and* is not closing. Keep lock until mix end (not 0.92).
- Prefer **kick + clap/snare onset series** (`measured.kickOnsetSec` / `snareClapOnsetSec`) over envelope-max for residual align. During the audible blend, chase kick on the downbeat and clap on the backbeat (FoF×FoF); do not average them into one diluted nudge.
- Do not arm Auto DJ fire until incoming ghost peaks are ready (≥64 samples), unless late (<0.4s media).

## Grid lock

- Admin/user **Lock Grid** stamps `sonic_dna.gridLocked` + optional `kickOnsetSec` and persists `beat_grid_offset`.
- While locked, Auto DJ must not overwrite grid offset from peak re-align.
- Persisted `beat_grid_offset` alone is enough for BeatSync readiness (`bothGridsReady`).
- **CDJ catalog contract:** stored `beat_grid_offset` (including explicit **0 ms** = downbeat at file t=0) is source of truth for paint + mix. Peak re-align fills **unset** grids only; UI **Reset Grid** / unset defaults stamp `0` + `gridManual`. Bulk: `web/scripts/reset-all-beat-grids-to-zero.mjs`.
- Phrase / section waveform markers paint on the **file-start** lattice; beat/bar lines follow within-beat phase.

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
- `web/lib/audio/mix-engine/overlap-clock.ts`
- `web/lib/audio/mix-engine/blend-smooth.ts`
- `web/lib/audio/mix-engine/alignment.ts`
- `web/lib/audio/mix-engine/sync.ts`
- `web/lib/audio/mix-engine/drift-align.ts`
- `web/lib/audio/mix-engine/MixEngine.ts`
- `web/lib/audio/mix-engine/plan-from-dna.ts`
- `web/components/MusicPlayer.tsx` (Auto DJ host + MixEngine)
- `web/lib/audio/auto-dj-controller.ts` (tick / fire runtime)
- `web/lib/audio/auto-dj-plan.ts` (pure plan + fire builders)

## Future (not yet)

- Optional beat-map (per-beat timing) for non-constant tempo
- Full DSP remeasure for true librosa kick onsets (`backfill-kick-onsets.mjs --remeasure`)

## Cloud mix-quality history

- Fan API packs `_mixQualityHistory` with Auto DJ settings (`/api/fan/auto-dj-settings`).
- Local fallback remains `localStorage` (last 20) when unsigned.

## Ops

- Dev: `cd web && npm run dev:ensure && npm run dev:verify`
- Mix-engine unit: `cd web && npx vitest run lib/audio/mix-engine`
