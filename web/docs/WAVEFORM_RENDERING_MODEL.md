# Waveform Rendering Model (CDJ-Style)

This document describes the time-based rendering model used for the enlarged waveform, beat grid, and markers.

## Core concept
Playback time is continuous and drives all visuals. The UI never drives playback.

## Data sources
- **Waveform**: precomputed amplitude/energy metadata (downsampled peaks), not PCM audio.
- **Beatgrid**: a list of beat timestamps derived from BPM + first downbeat + tempo changes (if any).
- **Cues/loops**: stored timestamps (cue/loop in/out times).

## Display pipeline
1) **Define a time window** around the current playback time `t_now`:
   - `window = [t_now - pastWindow, t_now + futureWindow]`
   - Zoom changes the window size (seconds per screen).

2) **Draw waveform envelope**:
   - For every stored waveform data point in the window:
     - map `time -> x` and `amplitude -> y`
     - draw bars/shape.

3) **Overlay beatgrid**:
   - find beat timestamps inside the window.
   - map `beat time -> x` using the same mapping as the waveform.

4) **Overlay cues/loops**:
   - map cue/loop timestamps to `x` using the same mapping.

5) **Scroll**:
   - `t_now` increases.
   - the window shifts forward.
   - visuals redraw slightly left each frame.

## Fixed playhead, moving tape
The playhead is visually fixed (center line). The waveform and beatgrid move under it.

## Natural motion with tempo
The waveform moves at a natural speed based on the current playback rate.
This avoids arbitrary time stretching of the display.

## Why alignment works
Because every layer (waveform, beatgrid, cues, loops) is rendered in the same time coordinate system, correct beatgrids will line up with transients.

## When it looks wrong
- Bad beatgrid analysis (wrong downbeat/BPM).
- VBR metadata delays in track length/time detection.
- UI refresh/stutter (visual jitter only).
