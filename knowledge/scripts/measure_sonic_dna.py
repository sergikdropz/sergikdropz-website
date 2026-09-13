#!/usr/bin/env python3
"""
Measure Sonic DNA from audio: BPM, 16-step/bar × 8-bar phrase drum grid,
bass lock, root/key.

Does not invent genre from titles or folders. Classification is drum → tempo → bass.

Usage:
  pip install -r knowledge/scripts/requirements-audio.txt
  knowledge/scripts/.venv/bin/python knowledge/scripts/measure_sonic_dna.py --limit 5
  knowledge/scripts/.venv/bin/python knowledge/scripts/measure_sonic_dna.py --id 1e0ff658-2b69-4685-aef9-337a82dea765
  knowledge/scripts/.venv/bin/python knowledge/scripts/measure_sonic_dna.py --wav /path/to/track.wav --out /tmp/measured.json

Audio roots (first existing wins, or pass --audio-root):
  $SERGIK_AUDIO_ROOT
  /Volumes/SERGIK/Exports SERGIK
  ./audio
"""
from __future__ import annotations

import os
import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

CAMELOT = {
    "Ab minor": "1A", "G# minor": "1A", "B major": "1B",
    "Eb minor": "2A", "D# minor": "2A", "F# major": "2B", "Gb major": "2B",
    "Bb minor": "3A", "A# minor": "3A", "Db major": "3B", "C# major": "3B",
    "F minor": "4A", "Ab major": "4B", "G# major": "4B",
    "C minor": "5A", "Eb major": "5B", "D# major": "5B",
    "G minor": "6A", "Bb major": "6B", "A# major": "6B",
    "D minor": "7A", "F major": "7B",
    "A minor": "8A", "C major": "8B",
    "E minor": "9A", "G major": "9B",
    "B minor": "10A", "D major": "10B",
    "F# minor": "11A", "Gb minor": "11A", "A major": "11B",
    "C# minor": "12A", "Db minor": "12A", "E major": "12B",
}

TITLE_BPM_RE = re.compile(r"(?<!\d)(\d{2,3})\s*bpm", re.I)
TITLE_KEY_RE = re.compile(r"\b([A-G](?:#|b)?)\s*(maj|min|major|minor)\b", re.I)


def check_deps():
    missing = []
    for name in ("librosa", "numpy", "scipy"):
        try:
            __import__(name)
        except ImportError:
            missing.append(name)
    if missing:
        print(f"Missing: {missing}. Run: pip install -r knowledge/scripts/requirements-audio.txt", file=sys.stderr)
        sys.exit(1)


def parse_title_bpm(title: str | None) -> float | None:
    if not title:
        return None
    match = TITLE_BPM_RE.search(title)
    if not match:
        return None
    bpm = int(match.group(1))
    if 60 <= bpm <= 200:
        return float(bpm)
    return None


def bandpass(y, sr, fmin, fmax):
    from scipy.signal import butter, sosfilt
    nyq = sr / 2
    low = max(fmin / nyq, 1e-4)
    high = min(fmax / nyq, 0.999)
    if high <= low:
        return y
    sos = butter(2, [low, high], btype="bandpass", output="sos")
    return sosfilt(sos, y)


def onset_times(y, sr, fmin, fmax):
    import librosa
    import numpy as np

    yb = bandpass(y, sr, fmin, fmax)
    env = librosa.onset.onset_strength(y=yb, sr=sr)
    if env.size == 0 or float(env.max()) <= 0:
        return np.array([])
    times = librosa.onset.onset_detect(
        onset_envelope=env,
        sr=sr,
        units="time",
        backtrack=False,
        pre_max=3,
        post_max=3,
        pre_avg=3,
        post_avg=5,
        delta=0.08,
        wait=3,
    )
    return times


def build_kick_onset_sec(y_kick, sr, start, end, bpm, phase_steps, kick_phrase_steps, kick_steps):
    """
    Absolute kick onset times (seconds) for Auto DJ BeatSync.
    Prefer librosa kick-band onsets snapped to the phrase grid; fill gaps from steps.
    """
    import numpy as np

    bpm = float(max(bpm, 1e-6))
    step_sec = (60.0 / bpm) / 4.0
    grid_offset = float(start) + float(phase_steps) * step_sec
    phrase_sec = step_sec * STEPS_PER_PHRASE

    steps = list(kick_phrase_steps or [])
    if not steps and kick_steps:
        steps = [
            b * STEPS_PER_BAR + int(s)
            for b in range(BARS_PER_PHRASE)
            for s in kick_steps
            if 0 <= int(s) < STEPS_PER_BAR
        ]
    steps = sorted({int(s) for s in steps if 0 <= int(s) < STEPS_PER_PHRASE})

    projected = []
    if steps and phrase_sec > 0:
        # Cover analysis window with tiled phrases
        t_lo = float(start) - phrase_sec
        t_hi = float(end) + phrase_sec
        phrase_i = int(math.floor((t_lo - grid_offset) / phrase_sec)) - 1
        phrase_end = int(math.ceil((t_hi - grid_offset) / phrase_sec)) + 1
        for p in range(phrase_i, phrase_end + 1):
            base = grid_offset + p * phrase_sec
            for s in steps:
                t = base + s * step_sec
                if start - 0.02 <= t <= end + 0.02:
                    projected.append(float(t))

    raw = onset_times(y_kick, sr, 30, 110) + float(start)
    if isinstance(raw, np.ndarray) and raw.size:
        raw = raw[(raw >= start - 0.02) & (raw <= end + 0.02)]
    else:
        raw = np.array([])

    snapped = []
    snap_win = min(0.04, step_sec * 0.9)
    for t in raw.tolist() if hasattr(raw, "tolist") else list(raw):
        t = float(t)
        if projected:
            nearest = min(projected, key=lambda g: abs(g - t))
            if abs(nearest - t) <= snap_win:
                snapped.append(nearest)
            else:
                snapped.append(t)
        else:
            snapped.append(t)

    merged = sorted(set([round(x, 4) for x in (snapped + projected)]))
    # Cap density: keep strongest spacing (~half beat)
    min_gap = (60.0 / bpm) * 0.4
    out = []
    for t in merged:
        if not out or (t - out[-1]) >= min_gap * 0.85:
            out.append(t)
    return out, round(grid_offset, 4), int(phase_steps)


def band_envelope(y, sr, hop=256):
    import numpy as np

    frame = hop * 2
    if len(y) < frame:
        return np.array([float(np.sqrt(np.mean(y ** 2)))]), hop
    n = 1 + (len(y) - frame) // hop
    env = np.empty(n, dtype=float)
    for i in range(n):
        sl = y[i * hop : i * hop + frame]
        env[i] = float(np.sqrt(np.mean(sl ** 2)))
    return env, hop


# Groove model: 16 sixteenth-note steps per bar × 8-bar phrase (DJ phrase lock).
STEPS_PER_BAR = 16
BARS_PER_PHRASE = 8
STEPS_PER_PHRASE = STEPS_PER_BAR * BARS_PER_PHRASE  # 128


def fold_n(env, sr, hop, bpm, n_steps, phase_steps=0):
    """Fold envelope energy into an n-step circular grid (16th-note bins)."""
    import numpy as np

    step_frames = (60.0 / max(bpm, 1e-6) / 4.0) * sr / hop
    acc = np.zeros(int(n_steps), dtype=float)
    if step_frames <= 0 or n_steps <= 0:
        return acc
    n = int(n_steps)
    for i, v in enumerate(env):
        idx = int(round(i / step_frames - phase_steps)) % n
        acc[idx] += float(v)
    return acc


def fold_16(env, sr, hop, bpm, phase_steps=0):
    return fold_n(env, sr, hop, bpm, STEPS_PER_BAR, phase_steps)


def fold_phrase(env, sr, hop, bpm, phase_steps=0):
    """Fold into one 8-bar phrase (128 sixteenth-note steps)."""
    return fold_n(env, sr, hop, bpm, STEPS_PER_PHRASE, phase_steps)


def collapse_phrase_to_bar(phrase_acc):
    """Sum 8 bars of a phrase fold into a single 16-step bar pocket."""
    import numpy as np

    bar = np.zeros(STEPS_PER_BAR, dtype=float)
    n = len(phrase_acc)
    if n < STEPS_PER_BAR:
        bar[:n] = phrase_acc
        return bar
    bars = min(BARS_PER_PHRASE, n // STEPS_PER_BAR)
    for b in range(bars):
        lo = b * STEPS_PER_BAR
        bar += phrase_acc[lo : lo + STEPS_PER_BAR]
    return bar


def best_grid_phase(kick_env, sr, hop, bpm):
    """
    Lock phase on an 8-bar phrase grid (16 steps/bar).
    Returns (phase_steps, bar_acc_16, four_ratio, phrase_acc_128).
    """
    import numpy as np

    raw = fold_phrase(kick_env, sr, hop, bpm, 0)
    best_p = 0
    best_s = -1.0
    best_bar = collapse_phrase_to_bar(raw)
    best_phrase = raw
    # Rotate the phrase fold instead of re-folding — same O(frames) once, then O(128²).
    for phase in range(STEPS_PER_PHRASE):
        phrase = np.roll(raw, -phase)
        bar = collapse_phrase_to_bar(phrase)
        four = float(bar[0] + bar[4] + bar[8] + bar[12])
        total = float(phrase.sum()) + 1e-9
        four_ratio = four / total
        # Prefer phases where bar-1 of the phrase carries the kick (phrase downbeat).
        bar_starts = float(sum(phrase[b * STEPS_PER_BAR] for b in range(BARS_PER_PHRASE))) + 1e-9
        phrase_lock = float(phrase[0]) / (bar_starts / BARS_PER_PHRASE)
        score = four_ratio + 0.12 * min(2.0, phrase_lock)
        if score > best_s:
            best_s = score
            best_p = phase
            best_bar = bar
            best_phrase = phrase
    four_out = float(best_bar[0] + best_bar[4] + best_bar[8] + best_bar[12]) / (float(best_bar.sum()) + 1e-9)
    return best_p, best_bar, four_out, best_phrase


def steps_from_fold(acc, max_steps, rel=0.48):
    return pick_steps(list(acc), max_steps=max_steps, rel=rel)


def step_weights(times, bpm, start_sec, end_sec):
    beat = 60.0 / max(bpm, 1e-6)
    step = beat / 4.0
    weights = [0.0] * 16
    for t in times:
        if t < start_sec or t > end_sec:
            continue
        pos = (t - start_sec) / step
        nearest = round(pos)
        dist = abs(pos - nearest)
        if dist > 0.32:
            continue
        idx = int(nearest) % 16
        weights[idx] += 1.0 - dist
    return weights


def pick_steps(weights, max_steps, rel=0.55):
    peak = max(weights) if weights else 0.0
    if peak <= 0:
        return []
    n = len(weights)
    ranked = sorted(range(n), key=lambda i: weights[i], reverse=True)
    out = []
    for i in ranked:
        if weights[i] < peak * rel:
            break
        if len(out) >= max_steps:
            break
        out.append(i)
    return sorted(out)


def quantize_steps(times, bpm, start_sec, end_sec, max_steps=6):
    return pick_steps(step_weights(times, bpm, start_sec, end_sec), max_steps=max_steps)


def classify_drum_family(kick_steps, snare_steps, hat_steps, bpm, four_ratio=0.0):
    kicks = set(kick_steps)
    snares = set(snare_steps)
    hats = set(hat_steps or [])
    four = {0, 4, 8, 12}
    kick_on_beats = len(kicks & four)
    snare_24 = {4, 12} <= snares or ({4, 12} <= (snares | kicks) and 4 in snares)
    snare_3 = 8 in snares and 4 not in snares
    hat_evens = len(hats & {0, 2, 4, 6, 8, 10, 12, 14})
    hat_odds = len(hats & {1, 3, 5, 7, 9, 11, 13, 15})
    disco_hats = hat_odds > hat_evens and len(hats) >= 4
    sparse_enough = len(kicks) <= 5 and len(snares) <= 5
    dembow = sparse_enough and 0 in kicks and 6 in kicks and 3 in snares and kick_on_beats < 3
    one_drop = 4 in snares and 0 not in kicks and kick_on_beats <= 2
    half_time_pocket = snare_3 and ((bpm or 0) >= 132 or four_ratio < 0.32)
    house_pocket = bpm is not None and 118 <= bpm <= 132

    # Ghost snare on 8 must not veto 4/4 only when the pocket is actually house:
    # 2-and-4 clap and/or disco offbeat hats. Busy kicks at 123 with a trap/hip-hop
    # snare (no beat-2 clap, house-like eighth hats) stay half-time / broken.
    if kick_on_beats >= 3 and house_pocket and (snare_24 or disco_hats):
        return "four-on-the-floor", "full-time"
    if half_time_pocket:
        return "half-time", "half-time"
    if snare_3 and kick_on_beats <= 2:
        return "half-time", "half-time"
    if (four_ratio >= 0.42 or kick_on_beats >= 3) and not snare_3:
        feel = "full-time"
        return "four-on-the-floor", feel
    if dembow:
        return "dembow", "full-time"
    if one_drop and bpm and bpm < 110:
        return "one-drop", "full-time"
    if snare_24 and kick_on_beats <= 2:
        if bpm and 80 <= bpm <= 105:
            return "boom-bap", "full-time"
        return "breakbeat", "full-time"
    if not kicks and not snares:
        return "unknown", "unknown"
    if len(kicks) + len(snares) <= 2:
        return "sparse", "full-time"
    return "breakbeat", "full-time"


def scene_flags(percussion, spectral, four_ratio, snare_steps, instruments=None):
    perc = percussion or {}
    rel = (spectral or {}).get("relative") or {}
    snares = set(snare_steps or [])
    snare_role = perc.get("snareRole") or ""
    hats = perc.get("hatGrid") or ""
    half_snare = snare_role == "half-time-beat-3" or (8 in snares and 4 not in snares)
    sub_heavy = (rel.get("sub", 0) + rel.get("bass", 0)) >= 0.38
    mid_open = (rel.get("mid", 0) + rel.get("presence", 0)) >= 0.18
    sparse_hats = hats in ("sparse-accents", "open-or-minimal")
    busy_hats = hats in ("eighths", "16th-wash")
    offbeat_hats = hats == "offbeat-hats"
    broken_kick = perc.get("kickRole") == "syncopated-or-broken-kick"
    ids = {
        item.get("id")
        for item in (instruments or [])
        if (item.get("confidence") or 0) >= 0.4
    }
    # Instrument labels are spectral roles, not 808 proof — nearly every file is tagged Sub/808.
    has_808 = False
    has_pad = "harmonic-pad" in ids
    has_pluck = "plucked-mid" in ids
    has_lead = "mid-lead" in ids
    return {
        "halfSnare": half_snare,
        "subHeavy": sub_heavy,
        "midOpen": mid_open or has_pad or has_pluck or has_lead,
        "sparseHats": sparse_hats,
        "busyHats": busy_hats,
        "offbeatHats": offbeat_hats,
        "brokenKick": broken_kick,
        "fourRatio": float(four_ratio or 0),
        "has808": has_808,
        "hasPad": has_pad,
        "hasPluck": has_pluck,
        "hasLead": has_lead,
        "hatDensity": int(perc.get("hatDensity") or 0),
        "kickDensity": int(perc.get("kickDensity") or 0),
    }


def arrangement_usage(measured):
    """How percussion and instruments are used — the style effect, not just presence."""
    perc = measured.get("percussion") or {}
    bass = measured.get("bass") or {}
    inst = measured.get("instruments") or []
    hats = perc.get("hatGrid")
    drum = measured.get("drumFamily")
    hip_hop_drums = drum in ("half-time", "breakbeat", "boom-bap")
    eighth_hat_use = (
        "Hats are used as a house-like eighth-note ride over hip-hop/trap kick-snare (hats are color, not a house kick)."
        if hip_hop_drums
        else "Hats are used as an eighth-note ride that keeps house/tech time."
    )
    hat_use = {
        "16th-wash": "Hats are used as a continuous 16th ride (club/trance pressure).",
        "eighths": eighth_hat_use,
        "offbeat-hats": "Hats are used on the offbeat — disco/house ride, not a reggae one-drop skip.",
        "sparse-accents": "Hats are used as space and accents, leaving room for bass (dub/trap/experimental).",
        "open-or-minimal": "Cymbals are mostly open or absent — the groove is carried by kick and bass.",
    }.get(hats, None)
    snare_use = {
        "backbeat-2-and-4": "Snare/clap is used as a 2-and-4 backbeat (house, hip-hop, steppers).",
        "half-time-beat-3": "Snare is used on beat 3 — half-time feel (trap, dub, dubstep), not four-on-the-floor trance.",
        "dembow-or-syncopated-snare": "Snare is used in a syncopated/dembow cadence.",
        "broken-snare": "Snare is used in a broken pattern (breaks, hip-hop, experimental bass).",
        "no-clear-snare": "No stable snare role — percussion is kick/hat or texture-led.",
    }.get(perc.get("snareRole"), None)
    kick_use = {
        "four-on-the-floor": "Kick is used as a steady four-on-the-floor pulse.",
        "syncopated-or-broken-kick": "Kick is used syncopated/broken, not as a house pulse.",
    }.get(perc.get("kickRole"), None)
    bass_lock = bass.get("lock")
    bass_use = {
        "offbeat-syncopated": (
            "Bass is used off the kick (syncopated pocket under hip-hop/trap drums)."
            if hip_hop_drums
            else "Bass is used off the kick (funky/syncopated), which in a house pocket makes funky house; with sparse hats and sub it can still be reggae/bass."
        ),
        "sparse-808": "Bass is used as sparse 808/sub hits — trap and experimental bass language.",
        "follows-kick": "Bass is locked to the kick (techno/classic house).",
        "rolling": "Bass is used as a rolling ostinato (tech house/psy).",
        "pedal-root": "Bass is used as a pedal/root drone (dub, minimal).",
    }.get(bass_lock, None)
    named = [i.get("label") for i in inst if (i.get("confidence") or 0) >= 0.4]
    harmonic = "harmonic-pad" in {i.get("id") for i in inst}
    lines = [x for x in (kick_use, snare_use, hat_use, bass_use) if x]
    house_ride = hats in ("offbeat-hats", "eighths", "16th-wash")
    bass_led = hats in ("sparse-accents", "open-or-minimal") or perc.get("snareRole") == "half-time-beat-3" or perc.get("kickRole") == "syncopated-or-broken-kick"
    if harmonic:
        lines.append("Sustained mid harmonic (keys/pad) is used as a bed, which supports house/disco more than sparse bass music.")
    elif house_ride and hip_hop_drums:
        lines.append("House-like hats sit on top of a hip-hop/trap kick-snare; kick and snare decide genre, not the hat ride.")
    elif bass_led and any("808" in (n or "").lower() or "sub" in (n or "").lower() for n in named) and not harmonic:
        lines.append("Low end is used as sub/808 weight without a pad bed — bass-music, dub, or trap arrangement.")
    elif house_ride:
        lines.append("Hats/cymbals are used as a ride over 4/4, so the low-end label is a house/disco sub, not a trap 808 by itself.")
    return {
        "kickUse": kick_use,
        "snareUse": snare_use,
        "hatUse": hat_use,
        "bassUse": bass_use,
        "lines": lines,
    }


def classify_groove(drum_family, bpm, bass_lock, swing, timing_feel, percussion=None, spectral=None, four_ratio=0.0, snare_steps=None, instruments=None):
    flags = scene_flags(percussion, spectral, four_ratio, snare_steps, instruments)
    reasons = [f"drums: {drum_family}"]
    if bpm:
        reasons.append(f"tempo: {int(round(bpm))} BPM")
    if bass_lock != "unknown":
        reasons.append(f"bass: {bass_lock}")
    if flags["subHeavy"]:
        reasons.append("sub-heavy low end")
    if flags["halfSnare"]:
        reasons.append("snare used on beat 3 (half-time pocket)")
    if percussion and percussion.get("hatGrid"):
        reasons.append(f"hats used as {percussion.get('hatGrid')}")
    if flags["hasPad"]:
        reasons.append("keys/pad used as harmonic bed")
    if flags["has808"]:
        reasons.append("bass used as sub/808")

    def pack(family, primary, sub, conf, extra):
        return {
            "family": family,
            "primary": primary,
            "subgenre": sub,
            "confidence": conf,
            "reason": reasons + extra,
        }

    eight_oh_eight = bass_lock == "sparse-808" or flags["has808"] or (
        flags["subHeavy"] and (flags["sparseHats"] or flags["halfSnare"] or flags["brokenKick"])
    )
    sparse_or_broken = flags["sparseHats"] or flags["brokenKick"] or drum_family in ("breakbeat", "sparse", "half-time")
    house_hats = flags["offbeatHats"] or flags["busyHats"]

    # How snare is used at high BPM overrides a false trance 4/4.
    if flags["halfSnare"] and bpm and bpm >= 132:
        if eight_oh_eight and flags["sparseHats"]:
            return pack("Bass", "Experimental Bass", "Half-time Bass", 0.78, ["snare used half-time, hats used as space, sub carries the style"])
        if eight_oh_eight and bpm >= 138 and flags.get("busyHats") and percussion and percussion.get("hatGrid") == "16th-wash":
            return pack("Trap", "Trap", "Melodic Trap", 0.76, ["snare used on 3 with 808; hats used as a 16th trap ride"])
        if eight_oh_eight:
            return pack("Reggae", "Reggae", "Dub", 0.74, ["snare used half-time + sub; pulse is doubled dub, not trance"])
        return pack("Hip-Hop", "Hip-Hop", "Half-time", 0.62, ["snare used on 3 without 808 dominance"])

    if drum_family == "dembow":
        return pack("Reggaeton", "Reggaeton", "Dembow", 0.82, ["kick/snare used in dembow cadence"])
    if drum_family == "one-drop":
        sub = "Dub" if bass_lock == "pedal-root" or flags["subHeavy"] else "Steppers"
        return pack("Reggae", "Reggae", sub, 0.8, ["kick withheld on 1; snare/bass used as reggae weight"])
    if drum_family == "boom-bap":
        primary = "Lo-Fi" if bpm and bpm < 80 else "Hip-Hop"
        return pack("Hip-Hop", primary, "Boom Bap", 0.78, ["snare used on 2 and 4 in boom-bap"])
    if drum_family == "breakbeat":
        if bpm and bpm >= 160:
            sub = "Liquid DnB" if bass_lock == "rolling" else "Jungle"
            return pack("Drum & Bass", "Drum & Bass", sub, 0.8, ["broken drums used at DnB tempo"])
        if eight_oh_eight and sparse_or_broken and not flags["hasPad"]:
            if bpm and 118 <= bpm <= 136:
                return pack("Bass", "Experimental Bass", "Broken 808", 0.74, ["kick used broken, bass used as 808, no pad bed — not funky house"])
            if bpm and bpm >= 130:
                return pack("Trap", "Trap", "Broken Trap", 0.72, ["broken percussion with 808 usage"])
            return pack("Bass", "Experimental Bass", None, 0.68, ["broken drums + sub usage"])
        if bpm and 130 <= bpm < 160:
            return pack("Breaks", "Breaks", "UK Breaks", 0.7, ["breakbeat used at mid-tempo without 808 dominance"])
        return pack("Hip-Hop", "Hip-Hop", "Broken Beat", 0.58, ["broken drums used without sub-led arrangement"])
    if drum_family == "half-time":
        if house_hats and not flags["sparseHats"]:
            return pack(
                "Hip-Hop",
                "Hip-Hop",
                "Trap",
                0.78,
                ["hip-hop/trap kick-snare with house-like hats; not a house 4/4 kick"],
            )
        if eight_oh_eight and flags["sparseHats"] and bpm and bpm >= 130:
            return pack("Bass", "Experimental Bass", "Half-time Bass", 0.8, ["hats used as space; snare half-time; sub leads"])
        if bass_lock == "sparse-808" or (eight_oh_eight and bpm and 130 <= bpm <= 155):
            return pack("Trap", "Trap", "Melodic Trap", 0.8, ["808 used sparsely under a half-time snare"])
        if bpm and 135 <= bpm <= 150:
            return pack("Dubstep", "Dubstep", None, 0.68, ["half-time percussion at dubstep tempo"])
        if eight_oh_eight:
            return pack("Reggae", "Reggae", "Dub", 0.7, ["sub used as dub weight under half-time snare"])
        return pack("Hip-Hop", "Hip-Hop", "Half-time", 0.7, ["snare used on beat 3"])
    if drum_family == "four-on-the-floor":
        result = classify_four_on_the_floor(bpm, bass_lock, swing, flags, house_hats)
        result["reason"] = reasons + result.get("reason", [])
        return result
    if drum_family == "sparse":
        if eight_oh_eight and bpm and bpm >= 120:
            return pack("Bass", "Experimental Bass", "Sparse 808", 0.62, ["percussion used sparsely so 808/sub can lead"])
        if bpm and bpm < 100:
            return pack("Downtempo", "Downtempo", "Ambient", 0.55, ["sparse drums, slow pulse"])
        return pack("Minimal", "Minimal", None, 0.5, ["sparse drum grid"])
    if timing_feel == "half-time":
        return pack("Hip-Hop", "Hip-Hop", None, 0.45, ["half-time feel without a clear family"])
    if bpm and 118 <= bpm <= 132:
        return pack("House", "House", None, 0.35, ["tempo-only fallback; drums unknown"])
    if bpm and bpm < 90:
        return pack("Downtempo", "Downtempo", None, 0.35, ["tempo-only fallback; drums unknown"])
    return pack("Unclassified", "Unclassified", None, 0.2, ["insufficient groove evidence"])


def classify_four_on_the_floor(bpm, bass_lock, swing, flags, house_hats):
    funky = bass_lock == "offbeat-syncopated"
    rolling = bass_lock == "rolling"
    follows = bass_lock in ("follows-kick", "pedal-root")

    def pack(family, primary, sub, conf, extra):
        return {
            "family": family,
            "primary": primary,
            "subgenre": sub,
            "confidence": conf,
            "reason": extra,
        }

    # House/disco hat ride wins in the 118–128 pocket. Sparse hats + sub is reggae/dub usage.
    house_pocket = bpm is not None and 118 <= bpm <= 128
    if house_pocket and house_hats:
        pass
    elif flags["subHeavy"] and flags["fourRatio"] < 0.36 and flags["sparseHats"] and not flags["hasPad"] and not house_hats:
        if bpm and bpm >= 138:
            return pack("Reggae", "Reggae", "Dub", 0.7, ["kick used as 4/4 but hats used as space + sub — doubled dub, not trance"])
        if bpm and bpm >= 118:
            return pack("Reggae", "Reggae", "Steppers", 0.68, ["4/4 kick used with reggae-weight sub and sparse cymbals"])
    if bpm and bpm >= 160:
        if flags["busyHats"] and not flags["subHeavy"]:
            return pack("Trance", "Hard Dance", None, 0.55, ["hats used as a busy ride at high tempo"])
        return pack("Bass", "Experimental Bass", None, 0.5, ["high tempo 4/4 without trance hat usage"])
    if bpm and 138 <= bpm < 160:
        if flags["busyHats"] and not flags["halfSnare"] and flags["fourRatio"] >= 0.38 and flags["midOpen"]:
            return pack("Trance", "Trance", "Psytrance" if rolling else "Trance", 0.7, ["hats used busy, mid harmonic present, true 4/4"])
        if flags["subHeavy"] and not flags["hasPad"]:
            return pack("Bass", "Experimental Bass", "Halftime adjacent", 0.66, ["sub/808 used without a trance ride or pad bed"])
        return pack("House", "Tech House", None, 0.5, ["high house/tech tempo without trance hat+pad usage"])
    if bpm and 128 < bpm < 138:
        if flags["subHeavy"] and flags["sparseHats"] and not flags["hasPad"]:
            return pack("Reggae", "Reggae", "Steppers", 0.66, ["129–137: kick 4/4, hats used as space, sub leads"])
        if funky and house_hats:
            return pack("House", "Tech House", "Groovy Tech House", 0.74, ["kick 4/4, bass off-kick, hats used as a ride"])
        if follows and flags["busyHats"]:
            return pack("Techno", "Techno", "Peak Time Techno", 0.74, ["kick-locked bass and busy hats"])
        if funky:
            return pack("House", "Tech House", "Groovy Tech House", 0.7, ["4/4, 129–137, syncopated bass"])
        return pack("Techno", "Techno", "Techno", 0.7, ["straight 4/4 above house pocket"])
    if bpm and 118 <= bpm <= 128:
        if flags["brokenKick"] and flags["subHeavy"] and not house_hats:
            return pack("Bass", "Experimental Bass", None, 0.62, ["house tempo but kick used broken and hats not as a house ride"])
        if funky and (flags["offbeatHats"] or flags["hasPluck"] or swing >= 18):
            return pack("House", "Funky House", "Deep n Funky" if swing >= 20 else "Nu-Disco", 0.8, ["kick used 4/4, bass used off the kick, hats/pluck used for house/disco feel"])
        if funky and flags["busyHats"]:
            return pack("House", "Funky House", "Nu-Disco", 0.76, ["4/4 + offbeat bass + hat ride"])
        if rolling:
            return pack("House", "Tech House", "Rolling Tech House", 0.76, ["bass used as a rolling ostinato under 4/4"])
        if swing >= 25:
            return pack("House", "Deep House", None, 0.72, ["swung 4/4 house usage"])
        if follows:
            return pack("House", "House", "Classic House", 0.74, ["bass used locked to the kick"])
        return pack("House", "House", None, 0.68, ["four-on-the-floor in 118–128"])
    if bpm and 110 <= bpm < 118:
        return pack("Disco", "Disco", "Nu-Disco" if funky else "Disco", 0.68, ["4/4 just under house pocket; offbeat hats would confirm disco usage"])
    if bpm and bpm < 110:
        if flags["subHeavy"] and flags["sparseHats"]:
            return pack("Reggae", "Reggae", "Dub", 0.62, ["slow pulse, sub used as weight, hats used as space"])
        return pack("House", "Slow House", None, 0.5, ["4/4 below typical house tempo"])
    return pack("House", "House", None, 0.55, ["4/4 without a reliable tempo"])


_GOLD_BY_ID = None


def load_gold_by_id():
    global _GOLD_BY_ID
    if _GOLD_BY_ID is not None:
        return _GOLD_BY_ID
    path = Path(__file__).resolve().parents[1] / "library-analysis" / "gold-set.json"
    _GOLD_BY_ID = {}
    if path.exists():
        try:
            data = json.loads(path.read_text())
            for row in data.get("tracks") or []:
                tid = row.get("id")
                if tid:
                    _GOLD_BY_ID[str(tid)] = row
        except Exception:
            _GOLD_BY_ID = {}
    return _GOLD_BY_ID


def apply_gold_set(measured, drum, feel, genre, track_id=None):
    gold = load_gold_by_id().get(str(track_id or measured.get("id") or ""))
    if not gold:
        return drum, feel, genre
    if gold.get("drumFamily"):
        drum = gold["drumFamily"]
    if gold.get("timingFeel"):
        feel = gold["timingFeel"]
    elif drum == "half-time":
        feel = "half-time"
    if gold.get("primaryGenre"):
        genre = dict(genre or {})
        genre["primary"] = gold["primaryGenre"]
        if gold.get("family"):
            genre["family"] = gold["family"]
        elif gold["primaryGenre"] in ("Hip-Hop", "Trap"):
            genre["family"] = "Trap" if gold["primaryGenre"] == "Trap" else "Hip-Hop"
        if "subgenre" in gold:
            genre["subgenre"] = gold["subgenre"]
        notes = gold.get("notes") or gold["primaryGenre"]
        genre["reason"] = list(genre.get("reason") or []) + [f"ear gold-set: {notes}"]
        genre["confidence"] = max(float(genre.get("confidence") or 0), 0.9)
    return drum, feel, genre


def refine_measured(measured: dict, track_id=None) -> dict:
    """Recompute drum family + genre + report from stored grids (no audio)."""
    kicks = measured.get("kickSteps") or []
    snares = measured.get("snareSteps") or []
    hats = measured.get("hatSteps") or []
    bpm = measured.get("bpm")
    four_ratio = measured.get("fourRatio") or 0
    drum, feel = classify_drum_family(kicks, snares, hats, bpm, four_ratio)
    drum, feel, _ = apply_gold_set(measured, drum, feel, {}, track_id)
    perc = percussion_style(
        kicks,
        snares,
        hats,
        measured.get("swingPercent") or 0,
        drum,
        four_ratio,
        clap_steps=measured.get("clapSteps"),
    )
    measured["drumFamily"] = drum
    measured["timingFeel"] = feel
    measured["percussion"] = perc
    if feel == "half-time" and bpm and bpm >= 120:
        measured["effectiveBpm"] = round(bpm / 2)
    else:
        measured["effectiveBpm"] = round(bpm) if bpm else None
    genre = classify_groove(
        drum,
        bpm,
        (measured.get("bass") or {}).get("lock") or "unknown",
        measured.get("swingPercent") or 0,
        feel,
        perc,
        measured.get("spectral"),
        four_ratio,
        snares,
        measured.get("instruments"),
    )
    drum, feel, genre = apply_gold_set(measured, drum, feel, genre, track_id)
    measured["drumFamily"] = drum
    measured["timingFeel"] = feel
    measured["genre"] = genre
    measured["arrangement"] = arrangement_usage(measured)
    measured["instrumentUsage"] = detect_instrument_usage(measured, measured.get("spectral"))
    try:
        from sonic_dna_intelligence import compose_intelligence

        measured["intelligence"] = compose_intelligence(measured)
    except Exception as exc:
        measured["intelligence"] = {"error": str(exc)}
    measured["report"] = compose_audit(measured)
    return measured


def correlate_key(chroma):
    import numpy as np

    best = ("C", "major", 0.0)
    for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
        p = np.array(profile, dtype=float)
        p = (p - p.mean()) / (p.std() + 1e-9)
        for shift in range(12):
            rotated = np.roll(chroma, -shift)
            r = np.corrcoef(rotated, p)[0, 1]
            if not math.isfinite(r):
                continue
            if r > best[2]:
                best = (NOTE_NAMES[shift], mode, float(r))
    return best


def band_rms(y, sr, fmin, fmax):
    import numpy as np

    yb = bandpass(y, sr, fmin, fmax)
    return float(np.sqrt(np.mean(yb ** 2)))


def spectral_scene(y, sr):
    import numpy as np

    bands = {
        "sub": band_rms(y, sr, 20, 60),
        "kick": band_rms(y, sr, 40, 110),
        "bass": band_rms(y, sr, 60, 250),
        "lowMid": band_rms(y, sr, 250, 500),
        "mid": band_rms(y, sr, 500, 2000),
        "presence": band_rms(y, sr, 2000, 6000),
        "air": band_rms(y, sr, 6000, 12000),
    }
    total = sum(bands.values()) + 1e-9
    relative = {key: round(val / total, 3) for key, val in bands.items()}
    centroid = 0.0
    try:
        import librosa

        spec = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
        mag = spec.mean(axis=1)
        centroid = float(np.sum(freqs * mag) / (np.sum(mag) + 1e-9))
        flatness = float(np.exp(np.mean(np.log(mag + 1e-12))) / (np.mean(mag) + 1e-12))
        zcr = float(librosa.feature.zero_crossing_rate(y).mean())
        contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        contrast_mean = [round(float(v), 3) for v in contrast.mean(axis=1)]
    except Exception:
        flatness, zcr, contrast_mean = 0.0, 0.0, []
    return {
        "bands": {key: round(val, 5) for key, val in bands.items()},
        "relative": relative,
        "centroidHz": round(centroid, 1),
        "flatness": round(float(flatness), 4),
        "zeroCrossingRate": round(float(zcr), 4),
        "spectralContrast": contrast_mean,
    }


def detect_instruments(scene, bass_lock, chroma_peak, flux):
    rel = scene["relative"]
    instruments = []

    def add(ident, label, role, confidence, evidence):
        if confidence < 0.28:
            return
        instruments.append({
            "id": ident,
            "label": label,
            "role": role,
            "confidence": round(min(0.95, confidence), 3),
            "evidence": evidence,
        })

    add("kick-drum", "Kick drum", "percussion", 0.35 + rel["kick"] * 1.8, "low-band energy 40–110 Hz")
    add(
        "snare",
        "Snare",
        "percussion",
        0.18 + rel["lowMid"] * 1.2,
        "snare body energy 160–380 Hz",
    )
    add(
        "clap",
        "Clap",
        "percussion",
        0.15 + rel["presence"] * 1.5,
        "clap/transient energy 1.8–5.5 kHz",
    )
    # Legacy combined label for older UI that still keys on snare-clap
    add(
        "snare-clap",
        "Snare / clap",
        "percussion",
        0.2 + rel["presence"] * 1.2 + rel["lowMid"] * 0.5,
        "combined snare body + clap transient",
    )
    add("hats-cymbals", "Hats / cymbals", "percussion", 0.15 + rel["air"] * 2.2, "air-band energy 6–12 kHz")
    bass_conf = 0.25 + rel["bass"] * 1.6 + (0.15 if bass_lock not in ("unknown", None) else 0)
    bass_label = "Sub / 808 bass" if bass_lock in ("sparse-808",) or rel["sub"] > rel["mid"] else "Bass"
    add("bass", bass_label, "bass", bass_conf, f"60–250 Hz; lock={bass_lock}")
    harmonic = rel["mid"] + rel["lowMid"]
    pad_conf = 0.15 + harmonic * 1.1 - scene["flatness"] * 0.4
    if flux < 0.08:
        pad_conf += 0.12
    add("harmonic-pad", "Sustained harmonic (keys/pad)", "harmony", pad_conf, "stable mid energy, low chroma flux")
    pluck_conf = 0.1 + rel["presence"] * 0.8 + flux * 0.9
    if flux > 0.1 and rel["mid"] > 0.12:
        add("plucked-mid", "Plucked / percussive harmonic", "harmony", pluck_conf, "mid-band plus chroma motion (guitar/pluck-like)")
    lead_conf = 0.1 + rel["mid"] * 0.9 + rel["presence"] * 0.5
    if chroma_peak > 0.18:
        add("mid-lead", "Mid-range pitched lead", "lead", lead_conf, "focused chroma peak in mid/presence")
    if scene["flatness"] > 0.35 and rel["air"] > 0.12:
        add("texture-fx", "Noise / FX texture", "fx", 0.3 + scene["flatness"] * 0.5, "high spectral flatness")
    instruments.sort(key=lambda item: item["confidence"], reverse=True)
    return instruments[:8]


def detect_instrument_usage(measured, scene=None):
    """Technical instrument usage — bass type, keys, percussion families, synths."""
    rel = (scene or measured.get("spectral") or {}).get("relative") or {}
    bass = measured.get("bass") or {}
    perc = measured.get("percussion") or {}
    lock = bass.get("lock") or "unknown"
    inst = measured.get("instruments") or []
    ids = {i.get("id") for i in inst}
    flatness = float((scene or measured.get("spectral") or {}).get("flatness") or 0)
    flux = float((scene or measured.get("spectral") or {}).get("chromaFlux") or (scene or measured.get("spectral") or {}).get("flux") or 0)
    zcr = float((scene or measured.get("spectral") or {}).get("zeroCrossingRate") or 0)
    centroid = float((scene or measured.get("spectral") or {}).get("centroidHz") or 0)
    swing = float(measured.get("swingPercent") or perc.get("swingPercent") or 0)
    styles = perc.get("styles") or []
    hat_grid = perc.get("hatGrid") or ""

    def entry(type_, category, role, confidence, source, evidence, usage):
        if confidence < 0.28:
            return None
        return {
            "type": type_,
            "category": category,
            "role": role,
            "confidence": round(min(0.95, confidence), 3),
            "source": source,
            "evidence": evidence,
            "usage": usage,
        }

    entries = []
    bass_entry = None
    sub_heavy = rel.get("sub", 0) > 0.14 or rel.get("bass", 0) > 0.2
    has_808 = lock == "sparse-808" or any("808" in (i.get("label") or "") for i in inst if i.get("id") == "bass")

    if has_808:
        bass_entry = entry(
            "808-sub", "bass", "low-end", 0.78 if lock == "sparse-808" else 0.68,
            "measured", f"bass.lock={lock}",
            "Low end is carried by tuned 808/sub hits — electronic bass as kick and melody.",
        )
    elif flux > 0.16 and sub_heavy:
        bass_entry = entry(
            "reese-bass", "bass", "low-end", 0.55 + flux,
            "inferred", "high chroma flux + sub energy",
            "Reese-style modulated bass — detuned saw/sub stack as the low-end lead.",
        )
    elif lock == "pedal-root":
        bass_entry = entry(
            "pedal-bass", "bass", "harmonic-anchor", 0.62,
            "measured", "bass.lock=pedal-root",
            "Pedal/root bass drone — harmonic anchor more than melodic line.",
        )
    elif flatness > 0.32 and rel.get("bass", 0) > 0.12:
        bass_entry = entry(
            "sub-synth", "bass", "low-end", 0.48 + rel.get("bass", 0),
            "inferred", "spectral flatness + bass band",
            "Sub is a designed synth voice — modulated low end without acoustic body.",
        )
    elif rel.get("lowMid", 0) > 0.14 and rel.get("bass", 0) > 0.1 and flux < 0.12:
        upright = rel.get("mid", 0) < 0.12 and flatness < 0.28
        bass_entry = entry(
            "upright-bass" if upright else "electric-bass", "bass", "pocket", 0.42 + rel.get("lowMid", 0),
            "inferred", "warm low-mid, low flux" if upright else "low-mid body",
            "Upright/acoustic bass warmth — bow or pluck in the low register." if upright
            else "Electric bass guitar tone in the low-mid — fingered or picked pocket.",
        )
    elif "bass" in ids or sub_heavy:
        bass_entry = entry(
            "synth-bass", "bass", "pocket", 0.45 + rel.get("bass", 0),
            "measured" if "bass" in ids else "inferred", "bass spectral role",
            "Bass is a synth patch locked to the groove pocket.",
        )

    if bass_entry:
        entries.append(bass_entry)

    if "harmonic-pad" in ids or rel.get("mid", 0) + rel.get("lowMid", 0) > 0.22:
        if centroid > 1800 and flux < 0.1:
            entries.append(entry(
                "piano", "keys", "harmony", 0.44 + rel.get("mid", 0),
                "inferred", "bright centroid, stable chroma",
                "Piano or bright keys carry harmonic weight in the mid register.",
            ))
        elif rel.get("lowMid", 0) > 0.12 and flux < 0.11:
            entries.append(entry(
                "rhodes", "keys", "harmony", 0.46 + rel.get("lowMid", 0),
                "inferred", "warm low-mid harmonic bed",
                "Rhodes-like electric keys add warm harmonic padding.",
            ))
        elif flatness < 0.25 and rel.get("mid", 0) > 0.1:
            entries.append(entry(
                "organ", "keys", "harmony", 0.4 + rel.get("mid", 0),
                "inferred", "sustained mid harmonic",
                "Organ or sustained keys hold harmonic color behind the groove.",
            ))
        if "harmonic-pad" in ids:
            entries.append(entry(
                "pad", "keys", "harmony", 0.52 + rel.get("mid", 0),
                "measured", "sustained harmonic spectral role",
                "Sustained keys/pad bed supports the groove without dominating the kick.",
            ))

    if "hats-cymbals" in ids or hat_grid != "open-or-minimal":
        hat_usage = (
            "Offbeat hi-hats ride the pocket — disco/house timekeeping."
            if hat_grid == "offbeat-hats"
            else "16th-note hats create continuous rhythmic pressure."
            if hat_grid == "16th-wash"
            else "Hi-hats/cymbals mark subdivisions above the kick."
        )
        entries.append(entry(
            "offbeat-hats" if hat_grid == "offbeat-hats" else "hi-hats",
            "percussion", "timekeeping", 0.55 + rel.get("air", 0) * 0.5,
            "measured" if "hats-cymbals" in ids else "inferred",
            f"hatGrid={hat_grid}", hat_usage,
        ))
    if "snare-clap" in ids:
        entries.append(entry(
            "half-time-snare" if "half-time" in (perc.get("snareRole") or "") else "snare-clap",
            "percussion", "backbeat", 0.62, "measured", perc.get("snareRole") or "snare",
            "Snare/clap defines the backbeat cadence against the kick.",
        ))
    if "kick-drum" in ids:
        entries.append(entry(
            "kick-drum", "percussion", "pulse", 0.65, "measured", perc.get("kickRole") or "kick",
            "Kick drum anchors the pulse and body map of the track.",
        ))
    if zcr > 0.08 and rel.get("air", 0) > 0.1:
        entries.append(entry(
            "shaker", "percussion", "texture", 0.38 + zcr + rel.get("air", 0),
            "inferred", "high ZCR + air band",
            "Shaker or granular percussion adds high-frequency shuffle and lift.",
        ))
    if rel.get("lowMid", 0) > 0.13 and rel.get("presence", 0) > 0.09 and any(
        s in styles for s in ("swung", "syncopated-kick", "disco-offbeat-hats")
    ):
        entries.append(entry(
            "conga", "percussion", "groove", 0.4 + rel.get("lowMid", 0),
            "inferred", "low-mid hand-drum band + syncopated grid",
            "Conga or hand-drum hits add syncopated Latin/disco color.",
        ))
    if rel.get("lowMid", 0) > 0.11 and float(perc.get("kickSyncopation") or 0) > 0.35:
        entries.append(entry(
            "bongo", "percussion", "groove", 0.36 + rel.get("lowMid", 0),
            "inferred", "syncopated kick + mid percussion",
            "Bongo or tight hand percussion fills off-beat pockets.",
        ))
    if swing >= 22 or "swung" in styles:
        entries.append(entry(
            "percussion-layer", "percussion", "swing", 0.42,
            "inferred", "swing on grid",
            "Swung percussion layer loosens the grid for funk/house feel.",
        ))

    if "mid-lead" in ids:
        entries.append(entry(
            "modulated-lead" if flux > 0.14 else "synth-lead", "synth", "lead",
            0.5 + rel.get("mid", 0), "measured", "mid-range pitched lead",
            "Synth lead carries melodic focus in the mid/presence range.",
        ))
    if "plucked-mid" in ids:
        entries.append(entry(
            "pluck-synth", "synth", "rhythm-harmony", 0.48 + flux,
            "measured", "plucked harmonic + chroma motion",
            "Plucked synth or guitar-like stabs punctuate the groove.",
        ))
    if "texture-fx" in ids or (flatness > 0.34 and rel.get("presence", 0) > 0.1):
        entries.append(entry(
            "atmospheric-fx", "fx", "texture",
            0.55 if "texture-fx" in ids else 0.42 + flatness * 0.3,
            "measured" if "texture-fx" in ids else "inferred",
            "noise/FX spectral role",
            "Atmospheric FX and noise beds widen the stereo field.",
        ))
    if rel.get("mid", 0) > 0.15 and rel.get("presence", 0) > 0.12 and "harmonic-pad" not in ids:
        entries.append(entry(
            "arp-synth", "synth", "motion", 0.38 + rel.get("presence", 0),
            "inferred", "active mid/presence energy",
            "Arpeggiated or moving synth lines add harmonic motion.",
        ))

    entries = [e for e in entries if e]
    seen = set()
    deduped = []
    for e in sorted(entries, key=lambda x: x["confidence"], reverse=True):
        key = (e["category"], e["type"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    lines = [e["usage"] for e in deduped if e.get("usage")]
    summary = " ".join(lines[:4]) if lines else ""
    return {
        "bass": bass_entry,
        "entries": deduped,
        "lines": lines,
        "summary": summary,
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
    }


def percussion_style(kick_steps, snare_steps, hat_steps, swing, drum_family, four_ratio, clap_steps=None):
    kicks = set(kick_steps or [])
    snares = set(snare_steps or [])
    hats = set(hat_steps or [])
    claps = set(clap_steps or [])
    downbeats = {0, 4, 8, 12}
    kick_sync = len(kicks - downbeats) / max(1, len(kicks))
    hat_evens = len(hats & {0, 2, 4, 6, 8, 10, 12, 14})
    hat_odds = len(hats & {1, 3, 5, 7, 9, 11, 13, 15})
    if len(hats) >= 12:
        hat_grid = "16th-wash"
    elif hat_odds > hat_evens and len(hats) >= 4:
        hat_grid = "offbeat-hats"
    elif hat_evens >= 6:
        hat_grid = "eighths"
    elif len(hats) >= 3:
        hat_grid = "sparse-accents"
    else:
        hat_grid = "open-or-minimal"
    if {4, 12} <= snares:
        snare_role = "backbeat-2-and-4"
    elif drum_family == "four-on-the-floor" and 12 in snares:
        snare_role = "backbeat-2-and-4"
    elif 8 in snares and 4 not in snares:
        snare_role = "half-time-beat-3"
    elif 3 in snares or 6 in snares:
        snare_role = "dembow-or-syncopated-snare"
    elif snares:
        snare_role = "broken-snare"
    else:
        snare_role = "no-clear-snare"
    if {4, 12} <= claps:
        clap_role = "clap-2-and-4"
    elif claps & {4, 12}:
        clap_role = "clap-backbeat-partial"
    elif claps:
        clap_role = "clap-accents"
    else:
        clap_role = "no-clear-clap"
    kick_role = (
        "four-on-the-floor"
        if drum_family == "four-on-the-floor" and len(kicks & downbeats) >= 3
        else "syncopated-or-broken-kick"
    )
    styles = [drum_family]
    if swing and swing >= 22:
        styles.append("swung")
    if kick_sync >= 0.4:
        styles.append("syncopated-kick")
    if hat_grid == "offbeat-hats":
        styles.append("disco-offbeat-hats")
    if hat_grid == "16th-wash":
        styles.append("busy-hat-grid")
    if clap_role == "clap-2-and-4":
        styles.append("house-clap-backbeat")
    return {
        "kickRole": kick_role,
        "snareRole": snare_role,
        "clapRole": clap_role,
        "hatGrid": hat_grid,
        "kickSyncopation": round(kick_sync, 3),
        "hatDensity": len(hats),
        "kickDensity": len(kicks),
        "snareDensity": len(snares),
        "clapDensity": len(claps),
        "swingPercent": round(float(swing or 0), 1),
        "fourRatio": round(float(four_ratio or 0), 3),
        "styles": [s for s in styles if s and s != "unknown"],
    }


def compose_audit(measured):
    """Description + connections from measured fields only. No titles, folders, or guessed history."""
    genre = measured.get("genre") or {}
    bass = measured.get("bass") or {}
    perc = measured.get("percussion") or {}
    instruments = measured.get("instruments") or []
    bpm = measured.get("bpm")
    key = measured.get("key")
    camelot = measured.get("camelot")
    drum = measured.get("drumFamily")
    feel = measured.get("timingFeel")
    facts = []
    if bpm:
        facts.append(f"Pulse {int(round(bpm))} BPM ({feel or 'unknown feel'}).")
    if drum:
        facts.append(f"Drum family {drum}; kick {perc.get('kickRole')}; snare {perc.get('snareRole')}; hats {perc.get('hatGrid')}.")
    if bass.get("lock"):
        facts.append(f"Bass lock {bass.get('lock')}" + (f" around {bass.get('rootNote')}" if bass.get("rootNote") else "") + ".")
    if key and not measured.get("unpitched"):
        facts.append(f"Root/key {key}" + (f" / Camelot {camelot}" if camelot else "") + ".")
    elif measured.get("unpitched"):
        facts.append("Pitch center too weak to name a key (unpitched / noise-like chroma).")
    named = [i["label"] for i in instruments if i.get("confidence", 0) >= 0.4]
    if named:
        facts.append("Instrument scene: " + ", ".join(named[:6]) + ".")
    usage = measured.get("arrangement") or arrangement_usage(measured)
    for line in usage.get("lines") or []:
        facts.append(line)
    if genre.get("primary"):
        facts.append(
            f"Groove class {genre.get('primary')}"
            + (f" / {genre.get('subgenre')}" if genre.get("subgenre") else "")
            + f" (conf {genre.get('confidence', 0):.2f})."
        )
    connections = [
        {
            "from": "drums",
            "to": "genre",
            "rule": "drum-pattern-first",
            "text": f"{drum} grid is the parent of genre {genre.get('primary')}.",
        },
        {
            "from": "tempo",
            "to": "genre",
            "rule": "tempo-feel-second",
            "text": f"{int(round(bpm)) if bpm else '?'} BPM {feel} selects the pocket inside that drum family.",
        },
        {
            "from": "bass",
            "to": "genre",
            "rule": "bass-lock-third",
            "text": f"Bass {bass.get('lock')} distinguishes funky/offbeat vs kick-locked vs sparse 808.",
        },
    ]
    if perc.get("hatGrid"):
        connections.append({
            "from": "hats",
            "to": "style",
            "rule": "hat-usage",
            "text": usage.get("hatUse") or f"Hats used as {perc.get('hatGrid')}.",
        })
    if usage.get("snareUse"):
        connections.append({
            "from": "snare",
            "to": "feel",
            "rule": "snare-usage",
            "text": usage.get("snareUse"),
        })
    if named:
        connections.append({
            "from": "instruments",
            "to": "arrangement",
            "rule": "instrument-usage",
            "text": "How kick, hats, and bass are used (pulse vs space vs 808) decides style, not the filename.",
        })
    caveats = [
        "Instrument IDs are spectral roles (kick, bass, hats, harmonic pad), not sample-library names.",
        "Vocals vs synth leads are not separated with high confidence; mid-lead means pitched mid energy.",
        "Genre follows how percussion and instruments are used: drum grid → hat/snare role → bass usage → tempo.",
        "History, culture, and psychology are encyclopedia knowledge bound to that measured class — not playlist names and not a claim that the file 'is' every related genre.",
    ]
    intel = measured.get("intelligence") or {}
    description = intel.get("description") or " ".join(facts)
    return {
        "description": description,
        "facts": facts,
        "connections": connections,
        "caveats": caveats,
        "method": "dsp-audit-v1+world-genre-intelligence",
        "layers": {
            "dsp": " ".join(facts),
            "historical": (intel.get("historical") or {}).get("historicalContext"),
            "cultural": (intel.get("cultural") or {}).get("description"),
            "psychological": (intel.get("emotional") or {}).get("psychologicalProfile"),
            "psychoacoustics": ((intel.get("psychoacoustics") or {}).get("report")),
            "musicological": (intel.get("musicology") or {}).get("description"),
        },
    }


def pick_bpm(raw_bpm, title_bpm, kick_steps, snare_steps):
    candidates = []
    for factor in (0.5, 1.0, 2.0):
        bpm = raw_bpm * factor
        if 60 <= bpm <= 200:
            candidates.append(bpm)

    def score(bpm):
        octave = 1.0 - min(1.0, abs(math.log2(bpm / max(raw_bpm, 1e-6))))
        s = 0.25 * octave
        if 90 <= bpm <= 145:
            s += 0.45
        elif 70 <= bpm < 90 or 145 < bpm <= 175:
            s += 0.12
        family, feel = classify_drum_family(kick_steps, snare_steps, [], bpm)
        if family == "four-on-the-floor" and 118 <= bpm <= 132:
            s += 0.4
        if family == "half-time" and feel == "half-time":
            s += 0.2
        if title_bpm and abs(bpm - title_bpm) <= 2:
            s += 0.8
        elif title_bpm and abs(bpm - title_bpm * 2) <= 2:
            s -= 0.4
        return s

    ranked = sorted(({ "bpm": round(b, 2), "score": round(score(b), 3) } for b in candidates), key=lambda x: x["score"], reverse=True)
    best = ranked[0]["bpm"] if ranked else round(raw_bpm, 2)
    conf = min(0.95, 0.45 + (ranked[0]["score"] if ranked else 0) / 3)
    if title_bpm and abs(best - title_bpm) <= 2:
        best = title_bpm
        conf = max(conf, 0.85)
    return best, ranked, conf


def swing_amount(hat_times, bpm, start, end):
    if bpm <= 0 or len(hat_times) < 4:
        return 0.0
    beat = 60.0 / bpm
    eighth = beat / 2.0
    offs = []
    for t in hat_times:
        if t < start or t > end:
            continue
        pos = (t - start) / eighth
        frac = pos - math.floor(pos)
        if 0.4 < frac < 0.95:
            offs.append(frac)
    if not offs:
        return 0.0
    mean = sum(offs) / len(offs)
    return max(0.0, min(100.0, (mean - 0.5) * 200))


def bass_lock(kick_steps, bass_steps, chroma_flux):
    if not bass_steps:
        return "unknown"
    kicks = set(kick_steps)
    bass = set(bass_steps)
    overlap = len(kicks & bass) / max(1, len(bass))
    offbeats = {1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15}
    off = len(bass & offbeats) / max(1, len(bass))
    if overlap >= 0.55 and off < 0.4:
        return "follows-kick"
    if off >= 0.45:
        return "offbeat-syncopated"
    if len(bass) <= 3:
        return "sparse-808" if chroma_flux > 0.12 else "pedal-root"
    if len(bass) >= 8:
        return "rolling"
    return "pedal-root"


def audio_duration(path: Path) -> float:
    import soundfile as sf

    return float(sf.info(str(path)).duration)


def choose_window(duration: float) -> tuple[float, float, str]:
    if duration <= 45:
        return 0.0, duration, "full-track"
    start = max(12.0, duration * 0.22)
    win = min(60.0, duration * 0.4)
    if start + win > duration:
        start = max(0.0, duration - win)
    return start, start + win, "mid-track-60s"


def measure_wav(path: Path, title: str | None = None) -> dict:
    import librosa
    import numpy as np

    duration = audio_duration(path)
    start, end, window_reason = choose_window(duration)
    y_win, sr = librosa.load(str(path), sr=22050, mono=True, offset=start, duration=max(1.0, end - start))
    if len(y_win) < sr:
        y_win, sr = librosa.load(str(path), sr=22050, mono=True)
        start, end = 0.0, float(len(y_win) / sr)
        window_reason = "full-track-fallback"

    tempo, _beats = librosa.beat.beat_track(y=y_win, sr=sr)
    raw_bpm = float(np.atleast_1d(tempo)[0]) or 120.0
    title_bpm = parse_title_bpm(title or path.name)

    y_kick = bandpass(y_win, sr, 30, 110)
    # Snare body (skin/tone) vs clap crack (transient) — separate bands, merged for pocket.
    y_snare = bandpass(y_win, sr, 160, 380)
    y_clap = bandpass(y_win, sr, 1800, 5500)
    y_hat = bandpass(y_win, sr, 6500, 12000)
    y_bass = bandpass(y_win, sr, 40, 250)
    kick_env, hop = band_envelope(y_kick, sr)
    snare_env, _ = band_envelope(y_snare, sr, hop)
    clap_env, _ = band_envelope(y_clap, sr, hop)
    hat_env, _ = band_envelope(y_hat, sr, hop)
    bass_env, _ = band_envelope(y_bass, sr, hop)

    ranked = []
    for factor in (0.5, 1.0, 2.0):
        cand = raw_bpm * factor
        if not 60 <= cand <= 200:
            continue
        _phase, _acc, four_ratio, _phrase = best_grid_phase(kick_env, sr, hop, cand)
        octave = 1.0 - min(1.0, abs(math.log2(cand / max(raw_bpm, 1e-6))))
        s = 0.15 * octave + 1.1 * four_ratio
        if 90 <= cand <= 145:
            s += 0.35
        if title_bpm and abs(cand - title_bpm) <= 2:
            s += 0.9
        elif title_bpm and abs(cand - title_bpm * 2) <= 2:
            s -= 0.4
        ranked.append({"bpm": round(cand, 2), "score": round(s, 3), "fourRatio": round(four_ratio, 3)})
    ranked.sort(key=lambda x: x["score"], reverse=True)
    bpm = ranked[0]["bpm"] if ranked else round(raw_bpm, 2)
    bpm_conf = min(0.95, 0.4 + (ranked[0]["score"] if ranked else 0) / 3)
    if title_bpm and abs(bpm - title_bpm) <= 3:
        bpm = title_bpm
        bpm_conf = max(bpm_conf, 0.85)
    candidates = ranked

    # Phrase-locked fold (16 steps/bar × 8 bars), then collapse to bar pocket for UI/compat.
    phase, kick_acc, four_ratio, kick_phrase = best_grid_phase(kick_env, sr, hop, bpm)
    snare_phrase = fold_phrase(snare_env, sr, hop, bpm, phase)
    clap_phrase = fold_phrase(clap_env, sr, hop, bpm, phase)
    hat_phrase = fold_phrase(hat_env, sr, hop, bpm, phase)
    bass_phrase = fold_phrase(bass_env, sr, hop, bpm, phase)
    snare_acc = collapse_phrase_to_bar(snare_phrase)
    clap_acc = collapse_phrase_to_bar(clap_phrase)
    hat_acc = collapse_phrase_to_bar(hat_phrase)
    bass_acc = collapse_phrase_to_bar(bass_phrase)
    kick_steps = steps_from_fold(kick_acc, max_steps=8, rel=0.5)
    snare_body_steps = steps_from_fold(snare_acc, max_steps=6, rel=0.52)
    clap_steps = steps_from_fold(clap_acc, max_steps=6, rel=0.48)
    # Pocket uses body ∪ clap so house 2+4 claps register even when skin energy is thin.
    snare_steps = sorted(set(snare_body_steps) | set(clap_steps))
    hat_steps = steps_from_fold(hat_acc, max_steps=10, rel=0.45)
    bass_steps = steps_from_fold(bass_acc, max_steps=8, rel=0.5)
    kick_phrase_steps = steps_from_fold(kick_phrase, max_steps=24, rel=0.5)
    snare_body_phrase_steps = steps_from_fold(snare_phrase, max_steps=18, rel=0.52)
    clap_phrase_steps = steps_from_fold(clap_phrase, max_steps=18, rel=0.48)
    snare_phrase_steps = sorted(set(snare_body_phrase_steps) | set(clap_phrase_steps))
    hat_phrase_steps = steps_from_fold(hat_phrase, max_steps=32, rel=0.45)
    if four_ratio >= 0.42:
        kick_steps = sorted(set(kick_steps) | {0, 4, 8, 12})
        # Mirror 4-on-floor onto every bar of the phrase grid.
        kick_phrase_steps = sorted(
            set(kick_phrase_steps)
            | {b * STEPS_PER_BAR + s for b in range(BARS_PER_PHRASE) for s in (0, 4, 8, 12)}
        )

    kick_onset_sec, grid_offset_sec, grid_phase_steps = build_kick_onset_sec(
        y_kick, sr, start, end, bpm, phase, kick_phrase_steps, kick_steps
    )

    drum_family, timing_feel = classify_drum_family(kick_steps, snare_steps, hat_steps, bpm, four_ratio)
    hat_t = onset_times(y_hat, sr, 6500, 12000) + start
    swing = swing_amount(hat_t, bpm, start, end)

    bass_chroma = librosa.feature.chroma_stft(y=y_bass, sr=sr)
    mix_chroma = librosa.feature.chroma_stft(y=y_win, sr=sr)
    bass_mean = bass_chroma.mean(axis=1)
    mix_mean = mix_chroma.mean(axis=1)
    bass_mean = bass_mean / (bass_mean.sum() + 1e-9)
    mix_mean = mix_mean / (mix_mean.sum() + 1e-9)
    weighted = 0.65 * bass_mean + 0.35 * mix_mean
    weighted = (weighted - weighted.mean()) / (weighted.std() + 1e-9)

    root_idx = int(np.argmax(bass_mean))
    root_note = NOTE_NAMES[root_idx]
    _tonic, mode, key_corr = correlate_key(weighted)
    scale = mode
    pmaj = np.array(MAJOR_PROFILE)
    pmin = np.array(MINOR_PROFILE)
    rmaj = float(np.corrcoef(np.roll(weighted, -root_idx), (pmaj - pmaj.mean()) / (pmaj.std() + 1e-9))[0, 1])
    rmin = float(np.corrcoef(np.roll(weighted, -root_idx), (pmin - pmin.mean()) / (pmin.std() + 1e-9))[0, 1])
    scale = "major" if rmaj >= rmin else "minor"
    key_corr = max(rmaj, rmin) if math.isfinite(rmaj) and math.isfinite(rmin) else key_corr
    key_note = root_note
    key_name = f"{key_note} {scale}"
    unpitched = bool(key_corr < 0.15)
    if unpitched:
        key_name = None

    flux = float(np.mean(np.abs(np.diff(bass_chroma, axis=1)))) if bass_chroma.shape[1] > 1 else 0.0
    lock = bass_lock(kick_steps, bass_steps, flux)

    rms = float(np.sqrt(np.mean(y_win ** 2)))
    peak = float(np.max(np.abs(y_win)))
    crest = peak / (rms + 1e-9)

    effective = round(bpm / 2) if timing_feel == "half-time" and bpm >= 120 else round(bpm)
    scene = spectral_scene(y_win, sr)
    chroma_peak = float(bass_mean.max()) if bass_mean is not None else 0.0
    instruments = detect_instruments(scene, lock, chroma_peak, flux)
    percussion = percussion_style(
        kick_steps, snare_steps, hat_steps, swing, drum_family, four_ratio, clap_steps=clap_steps
    )
    scene["chromaFlux"] = round(float(flux), 4)
    payload = {
        "schemaVersion": "1.2",
        "source": "librosa",
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
        "audioPath": str(path),
        "window": {"startSec": round(start, 2), "endSec": round(end, 2), "reason": window_reason},
        "bpm": round(float(bpm), 2),
        "bpmCandidates": candidates,
        "bpmConfidence": round(float(bpm_conf), 3),
        "titleBpm": title_bpm,
        "timingFeel": timing_feel,
        "effectiveBpm": effective,
        "drumFamily": drum_family,
        "fourRatio": round(float(four_ratio), 3),
        "stepsPerBar": STEPS_PER_BAR,
        "phraseBars": BARS_PER_PHRASE,
        "kickSteps": kick_steps,
        "snareSteps": snare_steps,
        "snareBodySteps": snare_body_steps,
        "clapSteps": clap_steps,
        "hatSteps": hat_steps,
        "kickPhraseSteps": kick_phrase_steps,
        "snarePhraseSteps": snare_phrase_steps,
        "clapPhraseSteps": clap_phrase_steps,
        "hatPhraseSteps": hat_phrase_steps,
        "gridPhaseSteps": grid_phase_steps,
        "gridOffsetSec": grid_offset_sec,
        "kickOnsetSec": [round(float(t), 4) for t in kick_onset_sec],
        "swingPercent": round(float(swing), 1),
        "bass": {
            "lock": lock,
            "rootNote": root_note,
            "slidesLikely": flux > 0.18 and lock == "sparse-808",
        },
        "rootNote": root_note,
        "scale": None if unpitched else scale,
        "key": key_name,
        "camelot": None if unpitched else CAMELOT.get(key_name),
        "unpitched": unpitched,
        "keyConfidence": round(max(0.0, float(key_corr)), 3),
        "loudness": {
            "rms": round(rms, 4),
            "peak": round(peak, 4),
            "crest": round(crest, 3),
        },
        "spectral": scene,
        "instruments": instruments,
        "percussion": percussion,
    }
    payload["instrumentUsage"] = detect_instrument_usage(payload, scene)
    return refine_measured(payload)


def default_audio_roots(extra: list[str]) -> list[Path]:
    roots = []
    env = os.environ.get("SERGIK_AUDIO_ROOT")
    if env:
        roots.append(Path(env))
    roots.extend(Path(p) for p in extra)
    roots.extend([
        Path("/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs"),
        Path("/Volumes/SERGIK/Exports SERGIK/SERGIK MP3s"),
        Path("/Volumes/SERGIK/Exports SERGIK"),
        Path.home() / "Music" / "MP3 Exports",
    ])
    # Repo vault mirrors (playback MP3s) — last resort for tracks without Exports masters
    repo = Path(__file__).resolve().parents[2]
    roots.append(repo / "web" / "public" / "audio")
    seen = []
    for root in roots:
        if root not in seen:
            seen.append(root)
    return seen


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def index_audio(roots: list[Path]) -> tuple[dict[str, Path], dict[str, Path]]:
    exact: dict[str, Path] = {}
    norm: dict[str, Path] = {}
    exts = {".wav", ".aiff", ".aif", ".flac", ".mp3", ".m4a", ".ogg"}
    for root in roots:
        if not root.exists():
            continue
        walker = root.rglob("*") if root.is_dir() else []
        for path in walker:
            if not path.is_file() or path.suffix.lower() not in exts:
                continue
            if path.name.startswith("._"):
                continue
            exact.setdefault(path.name.lower(), path)
            norm.setdefault(normalize_name(path.stem), path)
    return exact, norm


def resolve_audio(
    file_path: str | None,
    file_name: str | None,
    roots: list[Path],
    exact_index: dict[str, Path] | None = None,
    norm_index: dict[str, Path] | None = None,
) -> Path | None:
    candidates = []
    if file_path:
        p = Path(file_path)
        if p.is_absolute() and p.exists():
            return p
        candidates.append(file_path)
        candidates.append(Path(file_path).name)
    if file_name:
        candidates.append(file_name)
    for cand in candidates:
        for root in roots:
            trial = root / cand
            if trial.exists():
                return trial
            trial2 = root / Path(cand).name
            if trial2.exists():
                return trial2
        name = Path(cand).name.lower()
        if exact_index and name in exact_index:
            return exact_index[name]
        key = normalize_name(Path(cand).stem)
        if norm_index and key in norm_index:
            return norm_index[key]
    # Token overlap: "La Selva" vs files that share most words
    tokens = {t for t in re.split(r"[^a-z0-9]+", (file_name or Path(file_path or "").name).lower()) if len(t) > 2}
    tokens -= {"sergik", "andino", "wav", "the", "feat"}
    if tokens and norm_index:
        best = None
        best_score = 0
        for stem, path in norm_index.items():
            score = sum(1 for t in tokens if t in stem)
            if score > best_score:
                best_score = score
                best = path
        if best and best_score >= max(2, len(tokens) - 1):
            return best
    return None


def load_track_record(repo: Path, entry: dict) -> dict:
    rel = entry.get("file")
    if not rel:
        return entry
    path = repo / "knowledge/library-analysis" / rel
    if not path.exists():
        return entry
    return json.loads(path.read_text())


def measured_complete(measured: dict) -> bool:
    bpm_ok = isinstance(measured.get("bpm"), (int, float)) and measured.get("bpmConfidence", 0) >= 0.4
    drums_ok = measured.get("drumFamily") not in (None, "unknown") and (
        measured.get("kickSteps") or measured.get("snareSteps")
    )
    key_ok = measured.get("unpitched") or bool(measured.get("key") or measured.get("rootNote"))
    return bool(bpm_ok and drums_ok and key_ok)


def main():
    parser = argparse.ArgumentParser(description="Measure Sonic DNA from WAV/AIFF")
    parser.add_argument("--wav", help="Single audio file")
    parser.add_argument("--out", help="Write JSON to this path (single file mode)")
    parser.add_argument("--id", help="Catalog uuid (full or 8-char prefix)")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--library-only", action="store_true")
    parser.add_argument("--needs-clap", action="store_true", help="Only tracks missing clapSteps in measured JSON")
    parser.add_argument("--audio-root", action="append", default=[])
    parser.add_argument("--catalog", default="knowledge/library-analysis/catalog.json")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--reclassify-only", action="store_true", help="Rewrite genre/report from existing measured JSON (no audio)")
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[2]
    out_dir = repo / "knowledge/library-analysis/measured"
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.reclassify_only:
        files = sorted(out_dir.glob("*.json"))
        stats = {"ok": 0, "changed": 0}
        for dest in files:
            measured = json.loads(dest.read_text())
            before = (measured.get("genre") or {}).get("primary")
            refine_measured(measured, dest.stem)
            after = (measured.get("genre") or {}).get("primary")
            dest.write_text(json.dumps(measured, indent=2) + "\n")
            stats["ok"] += 1
            if before != after:
                stats["changed"] += 1
                print(f"[reclassify] {dest.stem[:8]} {before} → {after}", flush=True)
        print("[reclassify] done", stats, flush=True)
        return

    check_deps()
    roots = default_audio_roots(args.audio_root)
    print("[measure] indexing audio under", ", ".join(str(r) for r in roots if r.exists()) or "(none exist)")
    exact_index, norm_index = index_audio(roots)
    print(f"[measure] indexed {len(exact_index)} files")

    if args.wav:
        path = Path(args.wav)
        if not path.exists():
            print(f"File not found: {path}", file=sys.stderr)
            sys.exit(1)
        measured = measure_wav(path, path.name)
        dest = Path(args.out) if args.out else out_dir / f"{path.stem}.json"
        dest.write_text(json.dumps(measured, indent=2) + "\n")
        print(json.dumps({"ok": True, "out": str(dest), "status": "completed" if measured_complete(measured) else "partial", "genre": measured.get("genre")}, indent=2))
        return

    catalog_path = repo / args.catalog if not Path(args.catalog).is_absolute() else Path(args.catalog)
    catalog = json.loads(catalog_path.read_text())
    queue = catalog
    if args.library_only:
        queue = [t for t in queue if t.get("inLibrary")]
    if args.needs_clap:
        filtered = []
        for t in queue:
            dest = out_dir / f"{t['id']}.json"
            if not dest.exists():
                filtered.append(t)
                continue
            try:
                measured = json.loads(dest.read_text())
            except Exception:  # noqa: BLE001
                filtered.append(t)
                continue
            if not measured.get("clapSteps"):
                filtered.append(t)
        queue = filtered
        print(f"[measure] --needs-clap → {len(queue)} tracks", flush=True)
    if args.id:
        needle = args.id.lower()
        queue = [t for t in queue if str(t.get("id", "")).lower().startswith(needle)]
    if args.limit:
        queue = queue[: args.limit]

    stats = {"ok": 0, "skip": 0, "fail": 0, "partial": 0, "completed": 0}
    failures = []
    for entry in queue:
        rec = load_track_record(repo, entry)
        identity = rec.get("identity") or {}
        title = identity.get("title") or entry.get("title")
        dest = out_dir / f"{entry['id']}.json"
        if args.skip_existing and dest.exists():
            stats["skip"] += 1
            print(f"[measure] skip-existing {title}", flush=True)
            continue
        audio = resolve_audio(
            identity.get("filePath"),
            identity.get("fileName") or entry.get("title"),
            roots,
            exact_index,
            norm_index,
        )
        if not audio:
            stats["skip"] += 1
            failures.append({"id": entry.get("id"), "title": title, "error": "audio not found"})
            print(f"[measure] SKIP {title}: audio not found", flush=True)
            continue
        try:
            measured = measure_wav(audio, title)
            refine_measured(measured, entry.get("id"))
            dest = out_dir / f"{entry['id']}.json"
            dest.write_text(json.dumps(measured, indent=2) + "\n")
            complete = measured_complete(measured)
            stats["ok"] += 1
            stats["completed" if complete else "partial"] += 1
            g = (measured.get("genre") or {}).get("primary")
            print(f"[measure] {title}: {measured.get('bpm')} BPM {measured.get('key')} {measured.get('drumFamily')} → {g} ({'completed' if complete else 'partial'})", flush=True)
        except Exception as exc:  # noqa: BLE001
            stats["fail"] += 1
            failures.append({"id": entry.get("id"), "title": title, "error": str(exc)[:200]})
            print(f"[measure] FAIL {title}: {exc}", flush=True)

    report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "stats": stats, "failures": failures[:50]}
    (repo / "knowledge/library-analysis/measure-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print("[measure] done", stats, flush=True)
    if stats["skip"] and not stats["ok"]:
        print("Set SERGIK_AUDIO_ROOT or --audio-root to the folder that contains the WAV paths from identity.filePath.", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
