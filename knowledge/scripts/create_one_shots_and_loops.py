#!/usr/bin/env python3
"""
SERGIK Premium Sample Pack Generator — Multi-Variant
======================================================
Up to 8 distinct variants per element per track. No duplicates.

Dedup method:
  One-shots : MFCC cosine similarity < 0.87 between any two kept hits
  Loops     : MFCC cosine similarity < 0.90 between any two kept phrases
              + different section per loop (beat-aligned, non-overlapping)

File naming:
  One-shots : SERGIK_{Type}_{BPM}bpm_{Key}_{EP}_{Track}_v{N}.wav
  Loops     : SERGIK_Loop-{Group}_8Bar_{BPM}bpm_{Key}_{EP}_{Track}_{role}.wav

Folder tree:
  SERGIK-Sample-Pack/
    01_KICKS/
    02_SNARES/
    03_HATS/
    04_PERCS/
    05_BASS/
    06_LOOPS_DRUMS/
    07_LOOPS_BASS/
    08_LOOPS_MELODIC/
    09_LOOPS_ATMO/
    manifest.json

Usage:
    python3 create_one_shots_and_loops.py
        [--palettes ~/Desktop/SERGIK-EP-Palettes]
        [--packs    ~/Desktop/SERGIK-Sample-Packs]
        [--output   ~/Desktop/SERGIK-Sample-Pack]
        [--ep       "Daze"]
        [--max-variants  8]
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

MAX_VARIANTS    = 8
ONESHOT_SIM_MAX = 0.87   # cosine similarity above which two hits are "the same"
LOOP_SIM_MAX    = 0.90
HIT_WINDOW_MS   = 300    # ms capture per one-shot
MIN_RMS         = 0.004

FOLDERS = {
    "kick":         "01_KICKS",
    "snare":        "02_SNARES",
    "hat":          "03_HATS",
    "perc":         "04_PERCS",
    "bass":         "05_BASS",
    "loop_drums":   "06_LOOPS_DRUMS",
    "loop_bass":    "07_LOOPS_BASS",
    "loop_melodic": "08_LOOPS_MELODIC",
    "loop_atmo":    "09_LOOPS_ATMO",
}

CENTROID_RANGES = {
    "kick":  (100,   900),
    "snare": (900,  3500),
    "hat":   (4000, 22000),
    "perc":  (1500, 6000),
    "bass":  (60,    500),
}

SECTION_PRIORITY = [
    "groove_peak", "escalation", "after_break_return",
    "introduce_groove", "break", "establish_world", "dissolve",
]

KEY_ABBREV = {
    "C major":"Cmaj",   "C minor":"Cmin",
    "C# major":"Dbmaj", "C# minor":"Dbmin",
    "D major":"Dmaj",   "D minor":"Dmin",
    "D# major":"Ebmaj", "D# minor":"Ebmin",
    "E major":"Emaj",   "E minor":"Emin",
    "F major":"Fmaj",   "F minor":"Fmin",
    "F# major":"F#maj", "F# minor":"F#min",
    "G major":"Gmaj",   "G minor":"Gmin",
    "G# major":"Abmaj", "G# minor":"Abmin",
    "A major":"Amaj",   "A minor":"Amin",
    "A# major":"Bbmaj", "A# minor":"Bbmin",
    "B major":"Bmaj",   "B minor":"Bmin",
}

LOOP_AF = {
    "DRUMS":      "highpass=f=30,acompressor=threshold=-18dB:ratio=4:attack=3:release=60",
    "BASS":       "highpass=f=40,equalizer=f=60:width_type=o:width=2:g=2",
    "MELODIC":    "highpass=f=180,equalizer=f=3000:width_type=o:width=1.5:g=1",
    "ATMOSPHERE": "lowpass=f=7000,volume=0.8",
}


# ── Naming ────────────────────────────────────────────────────────────────────

def safe(s: str) -> str:
    return "".join(c for c in s.replace(" ", "-").replace("/", "-") if c.isalnum() or c in "-_")

def shot_name(type_lbl, bpm, key, ep_slug, track_slug, variant: int) -> str:
    k = KEY_ABBREV.get(key, key.replace(" ", ""))
    return f"SERGIK_{safe(type_lbl)}_{int(round(bpm))}bpm_{k}_{safe(ep_slug)}_{safe(track_slug)}_v{variant:02d}.wav"

def loop_name(group_lbl, bpm, key, ep_slug, track_slug, role: str) -> str:
    k   = KEY_ABBREV.get(key, key.replace(" ", ""))
    rol = safe(role)
    return f"SERGIK_Loop-{safe(group_lbl)}_8Bar_{int(round(bpm))}bpm_{k}_{safe(ep_slug)}_{safe(track_slug)}_{rol}.wav"


# ── ffmpeg helpers ─────────────────────────────────────────────────────────────

def ffmpeg_slice(src: Path, dst: Path, start: float, dur: float, af: str = "") -> bool:
    cmd = ["ffmpeg", "-y", "-ss", f"{start:.4f}", "-t", f"{dur:.4f}", "-i", str(src)]
    if af:
        cmd += ["-af", af]
    cmd += ["-ar", "44100", "-acodec", "pcm_s16le", str(dst)]
    r = subprocess.run(cmd, capture_output=True)
    return r.returncode == 0 and dst.exists() and dst.stat().st_size > 2048

def ffmpeg_fade(p: Path, fi=0.004, fo=0.04):
    tmp = p.with_suffix(".tmp.wav")
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", str(p),
         "-af", f"afade=t=in:st=0:d={fi},afade=t=out:st=0:d={fo}",
         "-ar", "44100", "-acodec", "pcm_s16le", str(tmp)],
        capture_output=True
    )
    if r.returncode == 0 and tmp.exists():
        tmp.rename(p)


# ── Similarity / dedup ────────────────────────────────────────────────────────

def cosine(a, b) -> float:
    import numpy as np
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / d) if d > 0 else 0.0

def mfcc_vec(y, sr) -> list:
    import librosa
    import numpy as np
    if len(y) < 512:
        return [0.0] * 13
    return librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13).mean(axis=1).tolist()

def is_duplicate(vec, seen: list, threshold: float) -> bool:
    return any(cosine(vec, s) > threshold for s in seen)


# ── One-shot multi-variant selector ──────────────────────────────────────────

def pick_variants_oneshot(y, sr, onset_times, category: str, n: int = MAX_VARIANTS):
    """
    Return up to n distinct (start_sec, dur_sec) tuples for the given category.
    Sorted by RMS descending. Deduped by MFCC cosine similarity.
    """
    import librosa
    import numpy as np

    lo, hi   = CENTROID_RANGES[category]
    hit_samp = int(HIT_WINDOW_MS / 1000 * sr)
    min_samp = int(0.05 * sr)

    # Gather all valid candidates with their scores
    candidates = []
    for t in onset_times:
        s = int(t * sr)
        e = min(s + hit_samp, len(y))
        clip = y[s:e]
        if len(clip) < min_samp:
            continue
        rms = float(np.sqrt(np.mean(clip ** 2)))
        if rms < MIN_RMS:
            continue
        centroid = float(librosa.feature.spectral_centroid(y=clip, sr=sr)[0].mean())
        if not (lo <= centroid <= hi):
            continue
        candidates.append((rms, t, clip))

    # Sort by RMS descending — best hit first
    candidates.sort(key=lambda x: x[0], reverse=True)

    selected = []        # (start_sec, dur_sec)
    seen_vecs = []       # MFCC fingerprints of kept hits

    for rms, t, clip in candidates:
        if len(selected) >= n:
            break
        vec = mfcc_vec(clip, sr)
        if is_duplicate(vec, seen_vecs, ONESHOT_SIM_MAX):
            continue
        seen_vecs.append(vec)
        selected.append((t, HIT_WINDOW_MS / 1000))

    return selected


# ── Loop multi-variant selector ───────────────────────────────────────────────

def pick_variants_loops(y, sr, sections: list, bpm: float,
                        total_dur: float, n: int = MAX_VARIANTS):
    """
    Return up to n distinct (start_sec, dur_sec, role) tuples.
    One per unique section, ordered by dramatic priority. Deduped by MFCC.
    """
    import numpy as np

    loop_dur  = 8 * 4 * 60.0 / bpm
    beat_dur  = 60.0 / bpm

    def priority(sec):
        try:    return SECTION_PRIORITY.index(sec.get("dramaticRole", ""))
        except: return len(SECTION_PRIORITY)

    ordered = sorted(sections, key=priority)

    selected = []
    seen_vecs = []
    used_starts = []

    for sec in ordered:
        if len(selected) >= n:
            break
        raw_start = sec.get("startSec", 0)
        start = round(raw_start / beat_dur) * beat_dur  # snap to beat

        # Avoid overlapping with already-selected start points
        if any(abs(start - us) < loop_dur * 0.5 for us in used_starts):
            continue
        if start + loop_dur > total_dur + 0.3:
            continue

        s = int(start * sr)
        e = min(int((start + loop_dur) * sr), len(y))
        clip = y[s:e]
        if len(clip) < sr:
            continue

        import numpy as np
        rms = float(np.sqrt(np.mean(clip ** 2)))
        if rms < MIN_RMS:
            continue

        vec = mfcc_vec(clip, sr)
        if is_duplicate(vec, seen_vecs, LOOP_SIM_MAX):
            continue

        seen_vecs.append(vec)
        used_starts.append(start)
        role = sec.get("dramaticRole", f"section-{len(selected)+1}")
        selected.append((start, loop_dur, role))

    return selected


# ── Stem lookup ───────────────────────────────────────────────────────────────

def stem_src(track_dir: Path, pack_ep_dir: Path, track_slug: str, group: str) -> Path | None:
    dmap = {"DRUMS":"drums","BASS":"bass","MELODIC":"other","ATMOSPHERE":"other"}
    demucs = track_dir / "stems" / f"{dmap[group]}.wav"
    if demucs.exists():
        return demucs
    emap = {
        "DRUMS":      ("DRUMS",      f"{track_slug}_drums_extract.wav"),
        "BASS":       ("BASS",       f"{track_slug}_bass_extract.wav"),
        "MELODIC":    ("MELODIC",    f"{track_slug}_full_mix.wav"),
        "ATMOSPHERE": ("ATMOSPHERE", f"{track_slug}_atmosphere.wav"),
    }
    sub, fname = emap[group]
    p = pack_ep_dir / sub / fname
    if p.exists():
        return p
    # Fuzzy fallback
    pfx = track_slug[:12].lower()
    for f in (pack_ep_dir / sub).glob("*.wav"):
        if pfx in f.name.lower():
            return f
    return None


# ── Per-track processor ───────────────────────────────────────────────────────

def process_track(track_entry: dict, pack_ep_dir: Path, output_root: Path,
                  ep_slug: str, palette_ep_dir: Path, max_v: int) -> int:
    import librosa

    title  = track_entry.get("title", "unknown")
    raw_td = Path(track_entry.get("track_dir", ""))
    track_dir = raw_td if raw_td.exists() else palette_ep_dir / raw_td.name

    smap_path = track_dir / "analysis" / "section_map.json"
    if not smap_path.exists():
        print(f"    ✗  {title} — no section_map")
        return 0

    with open(smap_path) as f:
        smap = json.load(f)

    bpm       = float(smap.get("bpm", 120))
    key       = smap.get("key", "C major")
    sections  = smap.get("sections", [])
    total_dur = float(smap.get("duration_sec", 0))
    track_slug = track_dir.name

    key_abbr = KEY_ABBREV.get(key, key.replace(" ", ""))
    print(f"\n    ◉  {title}  {int(round(bpm))}bpm  {key_abbr}")

    saved = 0

    # ── One-shots: DRUMS ──────────────────────────────────────────────────────
    src_drums = stem_src(track_dir, pack_ep_dir, track_slug, "DRUMS")
    if src_drums:
        y_d, sr_d = librosa.load(str(src_drums), sr=22050, mono=True)
        hop = 512
        env = librosa.onset.onset_strength(y=y_d, sr=sr_d, hop_length=hop)
        frames = librosa.onset.onset_detect(
            onset_envelope=env, sr=sr_d, hop_length=hop,
            backtrack=True, units="frames", delta=0.25
        )
        onset_times = librosa.frames_to_time(frames, sr=sr_d, hop_length=hop)

        for cat in ("kick", "snare", "hat", "perc"):
            variants = pick_variants_oneshot(y_d, sr_d, onset_times, cat, n=max_v)
            folder   = output_root / FOLDERS[cat]
            folder.mkdir(parents=True, exist_ok=True)
            for i, (start, dur) in enumerate(variants, 1):
                fname = shot_name(cat.capitalize(), bpm, key, ep_slug, track_slug, i)
                dst   = folder / fname
                ok    = ffmpeg_slice(src_drums, dst, max(0, start - 0.003), dur + 0.05)
                if ok:
                    ffmpeg_fade(dst, fi=0.003, fo=0.04)
                    saved += 1
            if variants:
                print(f"         {cat.upper():<6} {len(variants)} variant(s)")

    # ── One-shots: BASS ───────────────────────────────────────────────────────
    src_bass = stem_src(track_dir, pack_ep_dir, track_slug, "BASS")
    if src_bass:
        y_b, sr_b = librosa.load(str(src_bass), sr=22050, mono=True)
        hop = 512
        env = librosa.onset.onset_strength(y=y_b, sr=sr_b, hop_length=hop)
        frames = librosa.onset.onset_detect(
            onset_envelope=env, sr=sr_b, hop_length=hop,
            backtrack=True, units="frames", delta=0.25
        )
        onset_times_b = librosa.frames_to_time(frames, sr=sr_b, hop_length=hop)
        variants = pick_variants_oneshot(y_b, sr_b, onset_times_b, "bass", n=max_v)
        folder   = output_root / FOLDERS["bass"]
        folder.mkdir(parents=True, exist_ok=True)
        for i, (start, dur) in enumerate(variants, 1):
            fname = shot_name("Bass", bpm, key, ep_slug, track_slug, i)
            dst   = folder / fname
            ok    = ffmpeg_slice(src_bass, dst, max(0, start - 0.003), dur + 0.08)
            if ok:
                ffmpeg_fade(dst, fi=0.003, fo=0.06)
                saved += 1
        if variants:
            print(f"         {'BASS':<6} {len(variants)} variant(s)")

    # ── 8-bar loops: all 4 groups ─────────────────────────────────────────────
    loop_cfg = [
        ("DRUMS",      "loop_drums",   "Drums"),
        ("BASS",       "loop_bass",    "Bass"),
        ("MELODIC",    "loop_melodic", "Melodic"),
        ("ATMOSPHERE", "loop_atmo",    "Atmo"),
    ]

    # Pre-compute loop variants from section map using DRUMS stem as timing reference
    src_ref = stem_src(track_dir, pack_ep_dir, track_slug, "DRUMS") or \
              stem_src(track_dir, pack_ep_dir, track_slug, "MELODIC")
    if src_ref:
        y_ref, sr_ref = librosa.load(str(src_ref), sr=22050, mono=True)
        loop_variants = pick_variants_loops(y_ref, sr_ref, sections, bpm, total_dur, n=max_v)
    else:
        loop_variants = []

    for group, folder_key, group_lbl in loop_cfg:
        src = stem_src(track_dir, pack_ep_dir, track_slug, group)
        if not src or not loop_variants:
            continue
        folder = output_root / FOLDERS[folder_key]
        folder.mkdir(parents=True, exist_ok=True)
        n_written = 0
        for start, dur, role in loop_variants:
            fname = loop_name(group_lbl, bpm, key, ep_slug, track_slug, role)
            dst   = folder / fname
            if dst.exists():
                # role collision (same role from two sections) — append index
                dst = folder / (dst.stem + f"_{n_written+1}" + dst.suffix)
            ok = ffmpeg_slice(src, dst, start, dur, af=LOOP_AF[group])
            if ok:
                ffmpeg_fade(dst, fi=0.02, fo=0.12)
                saved += 1
                n_written += 1
        if n_written:
            print(f"         LOOP  {group_lbl:<10} {n_written} variant(s)")

    return saved


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--palettes",     default=str(Path.home()/"Desktop/SERGIK-EP-Palettes"))
    parser.add_argument("--packs",        default=str(Path.home()/"Desktop/SERGIK-Sample-Packs"))
    parser.add_argument("--output",       default=str(Path.home()/"Desktop/SERGIK-Sample-Pack"))
    parser.add_argument("--ep",           default=None)
    parser.add_argument("--max-variants", type=int, default=MAX_VARIANTS)
    args = parser.parse_args()

    try:
        import librosa  # noqa
        import numpy    # noqa
    except ImportError as e:
        print(f"✗ Missing: {e}")
        sys.exit(1)

    palette_root = Path(args.palettes)
    pack_root    = Path(args.packs)
    output_root  = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)

    ep_dirs = sorted([d for d in palette_root.iterdir() if d.is_dir()])
    if args.ep:
        ep_dirs = [d for d in ep_dirs if args.ep.lower() in d.name.lower()]

    total = 0
    for ep_dir in ep_dirs:
        pp = ep_dir / "palette.json"
        if not pp.exists():
            continue
        with open(pp) as f:
            palette = json.load(f)

        ep_name = palette.get("ep", ep_dir.name)
        ep_slug = ep_dir.name
        pack_ep = pack_root / ep_slug

        print(f"\n{'='*60}")
        print(f"  {ep_name}  (max {args.max_variants} variants)")
        print(f"{'='*60}")

        for track in palette.get("tracks", []):
            if not track.get("wav_path") and "error" in track:
                continue
            n = process_track(track, pack_ep, output_root, ep_slug,
                               ep_dir, args.max_variants)
            total += n or 0

    # Summary
    print(f"\n{'='*60}")
    for folder_key, folder_name in FOLDERS.items():
        d = output_root / folder_name
        count = len(list(d.glob("*.wav"))) if d.exists() else 0
        if count:
            print(f"  {folder_name:<22}  {count:>4} files")

    # Manifest
    manifest = {"total_samples": total, "max_variants": args.max_variants, "folders": {}}
    for folder_key, folder_name in FOLDERS.items():
        d = output_root / folder_name
        manifest["folders"][folder_name] = sorted(f.name for f in d.glob("*.wav")) if d.exists() else []
    with open(output_root / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n  Total files : {total}")
    print(f"  Output      : {output_root}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
