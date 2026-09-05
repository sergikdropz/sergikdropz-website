# Waveform Rendering Model (CDJ-Style)

This document describes the time-based rendering model used for the enlarged waveform, beat grid, and markers.

## Core concept
Playback time is continuous and drives all visuals. The UI never drives playback.

## Data sources
- **Waveform**: precomputed amplitude/energy metadata (downsampled peaks), not PCM audio.
- **Beatgrid**: a list of beat timestamps derived from BPM + first downbeat + tempo changes (if any).
- **Cues/loops**: stored timestamps (cue/loop in/out times).

## Display pipeline
Runtime engine: `WaveformStage` (canvas) + cached densified tape (`waveform-tape-cache`).
MusicPlayer only owns settings/state; it does **not** re-render at 60fps for the playhead.

1) **Define a time window** around the current playback time `t_now`:
   - `window = [t_now - pastWindow, t_now + futureWindow]`
   - Zoom changes the window size (bars → seconds).

2) **Cache the tape once** (peaks + color mode), then slice the visible window each frame.

3) **Paint on canvas** (draw budget scales with zoom — see `waveformDrawBudget`).

4) **Overlay beatgrid** in the same time → x mapping as the envelope.

5) **RAF clock** inside `WaveformStage` reads `audio.currentTime` and paints playhead + tape without updating parent React state every frame.

## Visual language (unified)
Professional DSP tape (MiniMeters / DAW / CDJ practice):
- Solid **black** bed
- **Peak** columns (transients) over **RMS** body (Ableton-style dual envelope)
- **Low/Mid/High** filterbank (or crest/flux proxy for legacy peaks) → Multi-Band RGB
- **Sonic DNA remesure** at tape-cache time (phrase grids, onsets, instruments, energy)
- **Vertical lane stack** (optional) for Drums/Elements: fixed height bands + mixed RGB body
- Single **Scaled** dB display path (Mineiro fasterlog2)
- Peak-hold densify + column max (never soft-lerp away hits)

| Mode | Color source |
| --- | --- |
| `energy` (default) | MiniMeters L/M/H remesured from Sonic DNA (phrase grid + spectral mix) |
| `drums` | Kick / clap / hat pocket from DNA phrase steps + onsets |
| `elements` | Unified DNA instrument lanes (kicks, bass, synths, vocals…) |
| `spectrum` | Spectral rainbow biased by DNA centroid / mix |
| `rekordbox` | CDJ blue/amber/white from remesured pocket labels |
| `channel` | Solid teal (Ableton lane); brightness follows DNA energy |
| `mono` | Solid orange |

### Layer display (Drums & Elements)
- **Classic merged** (default): one mirrored envelope; per-sample color from `resolveWaveformColor` blends all active lanes.
- **Overlay merged**: same single silhouette as classic, plus contrast-boosted instrument layers; softer/brighter bands (hats, claps, vocals, air) paint forward on top.
- **Separated lanes**: fixed vertical instrument bands (Settings → Layer display, or waveform context menu).

Tape cache (`buildWaveformTapeCache`) remesures every timed sample via `remesureTimedSamples` before resolving color. Factors: kick/snare/clap/hat phrase grids, onset times, drum family, spectral relative bands, instrument usage, genre, energy/danceability, live beat-grid offset.

When audio is decoded client-side, envelopes are extracted with a 1-pole filterbank (250 Hz / 2.5 kHz). Legacy DB `number[]` peaks are lifted via crest/flux proxies until re-analyzed.

Beat grid is off unless the user enables it.

## Fixed playhead, moving tape
When follow + zoomed, the playhead stays centered and the tape/grid scroll under it.

## Natural motion with tempo
The waveform moves at a natural speed based on the current playback rate.
This avoids arbitrary time stretching of the display.

## Why alignment works
Because every layer (waveform, beatgrid, cues, loops) is rendered in the same time coordinate system, correct beatgrids will line up with transients.

## When it looks wrong
- Bad beatgrid analysis (wrong downbeat/BPM).
- VBR metadata delays in track length/time detection.
- UI refresh/stutter (visual jitter only).

## Beat grid calculation (current)
- Shared math: `web/lib/audio/beat-grid.ts`
- `offsetSec` = absolute downbeat time (beat 0). Lines at `offset + n × (60/BPM)`.
- Phrase hierarchy from that downbeat: beat → bar → 8-bar phrase → 16-bar section.
- Waveform peak bins use **bin-center** times so the envelope lines up with the playhead/grid.
- **Align to Waveform** scores peak energy on the grid (with a small BPM nudge) and rotates so a strong hit is bar 1.
- **Set Downbeat Here** anchors phrasing at the playhead.
