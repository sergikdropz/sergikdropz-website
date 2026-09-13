#!/usr/bin/env python3
"""
SERGIK EP Sound Palette Extractor
===================================
Analyzes all 10 EPs from the SERGIK music library, extracts sound palettes
grouped per EP, and optionally separates stems using Demucs v4.

Usage:
    python3 extract_ep_palettes.py [--output /tmp/sergik-ep-palettes] [--stems] [--ep "Daze"]

    --stems   Run Demucs v4 stem separation (adds ~5–15 min per track)
    --ep      Process only one EP by name (partial match OK)
    --output  Output directory (default: /tmp/sergik-ep-palettes)

Output per EP:
    {output}/{EP-Name}/
        palette.json           Full sonic palette + per-track analysis
        {TrackN}/
            analysis/
                section_map.json
                energy_curve.json
                spectrogram.png
                chromagram.png
            stems/             (if --stems)
                drums.wav
                bass.wav
                other.wav
                vocals.wav
"""

import argparse
import difflib
import gzip
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# ── EP Catalog (from Supabase DB) ─────────────────────────────────────────────

EPS = {
    "SERGIK - Are We Awake": [
        "SERGIK - It Is What It Is",
        "SERGIK - Elevator Musik",
        "SERGIK - No Stopping",
        "SERGIK - Whats the Reason",
        "SERGIK x OG Coconut - What you want",
    ],
    "SERGIK - Daze": [
        "SERGIK - Crawling Vines",
        "SERGIK - Daze V2",
        "SERGIK - Forza",
        "SERGIK - What Is What Xtendo",
        "SERGIK x AUXLEE - The Conex",
        "SERGIK x Bones - Momentum",
    ],
    "SERGIK - FTP": [
        "SERGIK - Dmn8r's FTP",
        "SERGIK - FTP",
        "SERGIK - One Of Those Nights",
        "SERGIK - The Worst",
        "SERGIK x Lugh Haurie - Zoned",
    ],
    "SERGIK - In The Streets": [
        "SERGIK - Electrify 2",
        "SERGIK - In The Streets 2",
        "SERGIK - Melt",
        "SERGIK - The Assignment 2",
        "SERGIK - They Know",
    ],
    "SERGIK - Inspire": [
        "SERGIK - Deeper",
        "SERGIK - Inspire",
        "SERGIK - Life",
        "SERGIK - Like The Ol Days",
        "SERGIK - The McCoy",
    ],
    "SERGIK - Soul Candy": [
        "SEERGIK - All The Vibes",
        "SERGIK - Back to The Basics",
        "SERGIK - Everyday Gratitude",
        "SERGIK - Soul Candy",
        "SERGIK - Spring Swing",
    ],
    "SERGIK - Staying A Vibe": [
        "SERGIK - Last Night",
        "SERGIK - Mind n Body",
        "SERGIK - Pre Party",
        "SERGIK - Tequila Power",
        "SERGIK x BeJanis - Hydrate v2",
    ],
    "SERGIK - The World Dont Stop": [
        "SERGIK - Caramba V1",
        "SERGIK - The World Dont Stop The Day (Sax)",
        "SERGIK - The World Dont Stop The Night",
        "SERGIK X BATTLO - Land Of The Free",
        "SERGIK. - All My Real Ones",
    ],
    "SERGIK - Utopia": [
        "SERGIK - Jahdelicah",
        "SERGIK - Like The Ol Days (Bass VIP)",
        "SERGIK - Man On A Journey",
        "SERGIK - Subliminal acid",
        "SERGIK - Utopia",
    ],
    "SERGIK - Vice & Virtues": [
        "SERGIK - Doin Ma Thang",
        "SERGIK - Game",
        "SERGIK - We Do This",
        "SERGIK - What They Say",
        "SERGIK x Slick - Gangsta",
    ],
}

WAV_DIR = Path("/Volumes/SERGIK/Exports SERGIK/SERGIK WAVs")
ALS_DIR = Path("/Volumes/SERGIK/ABLETON PROJECTS")
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
CAMELOT_MAJOR = {"C": "8B", "D": "10B", "E": "12B", "F": "7B", "G": "9B", "A": "11B", "B": "1B",
                  "C#": "3B", "D#": "5B", "F#": "2B", "G#": "4B", "A#": "6B"}
CAMELOT_MINOR = {"A": "8A", "B": "10A", "C#": "12A", "D": "7A", "E": "9A", "F#": "11A", "G#": "1A",
                  "C": "5A", "F": "4A", "G": "6A", "D#": "3A", "A#": "2A"}


# ── WAV file matching ─────────────────────────────────────────────────────────

def build_wav_index(wav_dir: Path) -> list[Path]:
    return [p for p in wav_dir.glob("*.wav") if not p.name.endswith(".asd")]


def find_best_wav(title: str, wav_index: list[Path], threshold: float = 0.45) -> Path | None:
    title_stem = title.lower().replace(" - ", " ").replace("  ", " ").strip()
    best_score, best_path = 0.0, None
    for wav in wav_index:
        candidate = wav.stem.lower().replace(" - ", " ").replace("  ", " ").strip()
        score = difflib.SequenceMatcher(None, title_stem, candidate).ratio()
        if score > best_score:
            best_score, best_path = score, wav
    if best_score >= threshold:
        return best_path
    return None


# ── Ableton project parsing ───────────────────────────────────────────────────

def find_ableton_project(title: str, als_dir: Path) -> Path | None:
    """Find best matching Ableton project folder for a track title."""
    title_lower = title.lower().replace("sergik", "").replace("-", "").strip()
    best_score, best_match = 0.0, None
    for folder in als_dir.iterdir():
        if not folder.is_dir():
            continue
        folder_lower = folder.name.lower().replace("project", "").replace("-", "").strip()
        score = difflib.SequenceMatcher(None, title_lower, folder_lower).ratio()
        if score > best_score:
            best_score, best_match = score, folder
    if best_score >= 0.55:
        return best_match
    return None


def parse_als_tracks(project_folder: Path) -> list[dict]:
    """Parse Ableton Live Set to extract track names and types."""
    als_files = list(project_folder.glob("*.als"))
    if not als_files:
        return []
    als_file = als_files[0]
    try:
        with gzip.open(als_file, "rb") as f:
            tree = ET.parse(f)
        root = tree.getroot()
        tracks = []
        for track_type in ["AudioTrack", "MidiTrack", "ReturnTrack"]:
            for track in root.iter(track_type):
                name_el = track.find(".//Name/UserName")
                if name_el is None:
                    name_el = track.find(".//Name/EffectiveName")
                name = name_el.get("Value", "Unknown") if name_el is not None else "Unknown"
                # Determine group from track name
                name_lower = name.lower()
                if any(k in name_lower for k in ["kick", "drum", "hat", "perc", "snare", "clap", "cymbal"]):
                    group = "DRUMS"
                elif any(k in name_lower for k in ["bass", "sub", "808"]):
                    group = "BASS"
                elif any(k in name_lower for k in ["pad", "chord", "synth", "lead", "melody", "guitar",
                                                    "piano", "rhodes", "organ", "horn", "string", "sax",
                                                    "flute", "keys", "vocal", "vox", "voice"]):
                    group = "MELODIC"
                else:
                    group = "ATMOSPHERE"
                tracks.append({
                    "name": name,
                    "type": track_type,
                    "group": group,
                })
        return tracks
    except Exception as e:
        return [{"error": str(e)}]


# ── Audio analysis ────────────────────────────────────────────────────────────

def analyze_wav(wav_path: Path, output_dir: Path) -> dict:
    """Comprehensive librosa analysis: BPM, key, energy, MFCCs, spectral."""
    import librosa
    import numpy as np

    analysis_dir = output_dir / "analysis"
    analysis_dir.mkdir(parents=True, exist_ok=True)

    print(f"    ▶ Analyzing {wav_path.name}…")
    y, sr = librosa.load(str(wav_path), sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # BPM
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    # Key via Krumhansl-Schmuckler profiles
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    # Major profile
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    major_scores = [np.corrcoef(np.roll(major_profile, i), chroma_mean)[0, 1] for i in range(12)]
    minor_scores = [np.corrcoef(np.roll(minor_profile, i), chroma_mean)[0, 1] for i in range(12)]
    best_major = int(np.argmax(major_scores))
    best_minor = int(np.argmax(minor_scores))
    if major_scores[best_major] >= minor_scores[best_minor]:
        key_name = NOTE_NAMES[best_major]
        key_mode = "major"
        camelot = CAMELOT_MAJOR.get(key_name, "?B")
    else:
        key_name = NOTE_NAMES[best_minor]
        key_mode = "minor"
        camelot = CAMELOT_MINOR.get(key_name, "?A")

    # Energy
    hop = sr // 4
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    times = librosa.times_like(rms, sr=sr, hop_length=hop)
    avg_rms = float(rms.mean())
    peak_rms = float(rms.max())

    # Spectral features
    spec_centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr).mean())
    spec_rolloff = float(librosa.feature.spectral_rolloff(y=y, sr=sr).mean())
    spec_bandwidth = float(librosa.feature.spectral_bandwidth(y=y, sr=sr).mean())
    zero_crossing = float(librosa.feature.zero_crossing_rate(y).mean())

    # MFCCs — timbral fingerprint
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_means = [float(v) for v in mfccs.mean(axis=1)]

    # Frequency band energy ratios (sub, bass, low-mid, mid, high)
    freqs = np.abs(librosa.stft(y))
    freq_bins = librosa.fft_frequencies(sr=sr)
    def band_energy(lo, hi):
        mask = (freq_bins >= lo) & (freq_bins < hi)
        return float(freqs[mask].mean()) if mask.any() else 0.0

    freq_bands = {
        "sub_20_60hz": band_energy(20, 60),
        "bass_60_250hz": band_energy(60, 250),
        "low_mid_250_500hz": band_energy(250, 500),
        "mid_500_2khz": band_energy(500, 2000),
        "high_mid_2_4khz": band_energy(2000, 4000),
        "presence_4_8khz": band_energy(4000, 8000),
        "air_8_16khz": band_energy(8000, 16000),
    }
    total_band = sum(freq_bands.values()) or 1.0
    freq_bands_normalized = {k: round(v / total_band, 4) for k, v in freq_bands.items()}

    # Classify zone
    if bpm < 90:
        zone = "downtempo" if bpm < 75 else "hip_hop"
    elif bpm < 115:
        zone = "funk_fusion"
    elif bpm < 122:
        zone = "house"
    else:
        zone = "tech_house"

    # Section boundary detection
    window_frames = sr * 20 // hop
    energy_windows = [float(rms[i:i + window_frames].mean())
                      for i in range(0, max(1, len(rms) - window_frames), window_frames)]
    section_boundaries = [0]
    for i in range(1, len(energy_windows)):
        if abs(energy_windows[i] - energy_windows[i - 1]) > 0.015:
            section_boundaries.append(i * 20)
    section_boundaries.append(int(duration))

    sections = []
    density_labels = ["minimal", "sparse", "moderate", "dense", "wall_of_sound"]
    roles = ["establish_world", "introduce_groove", "escalation", "break",
             "after_break_return", "dissolve"]
    for i, (start, end) in enumerate(zip(section_boundaries, section_boundaries[1:])):
        seg = rms[int(start * sr / hop / sr):int(end * sr / hop / sr)]
        seg_energy = float(seg.mean()) if len(seg) > 0 else 0.0
        density_idx = min(int(seg_energy * 100), 4)
        role_idx = min(i, len(roles) - 1)
        sections.append({
            "startSec": start,
            "endSec": end,
            "density": density_labels[density_idx],
            "dramaticRole": roles[role_idx],
            "energyRMS": round(seg_energy, 4),
        })

    # Stem group fingerprint from frequency bands
    stem_groups = classify_stem_groups(freq_bands_normalized, bpm, zero_crossing)

    # Save energy curve (sampled)
    energy_curve = [{"t": round(float(t), 2), "rms": round(float(e), 5)}
                    for t, e in zip(times[::4], rms[::4])]
    with open(analysis_dir / "energy_curve.json", "w") as f:
        json.dump(energy_curve[:300], f)

    # Save section map
    section_map = {
        "bpm": round(bpm, 1),
        "key": f"{key_name} {key_mode}",
        "camelot": camelot,
        "zone": zone,
        "duration_sec": round(duration, 1),
        "sections": sections,
    }
    with open(analysis_dir / "section_map.json", "w") as f:
        json.dump(section_map, f, indent=2)

    # Generate spectrogram PNG
    _save_spectrogram(y, sr, wav_path.stem, analysis_dir)

    # Generate chromagram PNG
    _save_chromagram(chroma, sr, wav_path.stem, analysis_dir)

    print(f"      BPM: {bpm:.1f}  Key: {key_name} {key_mode} ({camelot})  Zone: {zone}  "
          f"Duration: {duration:.0f}s")

    return {
        "bpm": round(bpm, 1),
        "key": f"{key_name} {key_mode}",
        "camelot": camelot,
        "zone": zone,
        "duration_sec": round(duration, 1),
        "avg_energy_rms": round(avg_rms, 4),
        "peak_energy_rms": round(peak_rms, 4),
        "spectral_centroid_hz": round(spec_centroid, 1),
        "spectral_rolloff_hz": round(spec_rolloff, 1),
        "spectral_bandwidth_hz": round(spec_bandwidth, 1),
        "zero_crossing_rate": round(zero_crossing, 4),
        "mfcc_means": [round(v, 2) for v in mfcc_means],
        "frequency_bands": freq_bands_normalized,
        "stem_groups": stem_groups,
        "sections": sections,
    }


def classify_stem_groups(bands: dict, bpm: float, zcr: float) -> dict:
    """Infer stem group prominence from frequency band ratios."""
    sub_bass = bands.get("sub_20_60hz", 0) + bands.get("bass_60_250hz", 0)
    mids = bands.get("low_mid_250_500hz", 0) + bands.get("mid_500_2khz", 0)
    highs = bands.get("high_mid_2_4khz", 0) + bands.get("presence_4_8khz", 0) + bands.get("air_8_16khz", 0)

    drums_prominence = round(min(zcr * 10 + highs * 0.5, 1.0), 3)
    bass_prominence = round(min(sub_bass * 3, 1.0), 3)
    melodic_prominence = round(min(mids * 2.5, 1.0), 3)
    atmosphere_prominence = round(min(highs * 2, 1.0), 3)

    return {
        "DRUMS": {
            "prominence": drums_prominence,
            "characteristics": ["kick", "snare/clap", "hats", "percussion"],
            "freq_range": "20Hz–8kHz (transient-heavy)",
        },
        "BASS": {
            "prominence": bass_prominence,
            "characteristics": ["sub bass", "bass line", "808"],
            "freq_range": "20Hz–250Hz",
            "sub_ratio": round(bands.get("sub_20_60hz", 0) / max(sub_bass, 0.001), 3),
        },
        "MELODIC": {
            "prominence": melodic_prominence,
            "characteristics": ["pad", "lead synth", "chord stabs", "samples"],
            "freq_range": "250Hz–4kHz",
        },
        "ATMOSPHERE": {
            "prominence": atmosphere_prominence,
            "characteristics": ["room texture", "fx tails", "reverb wash", "air"],
            "freq_range": "4kHz–16kHz",
        },
    }


def _save_spectrogram(y, sr, title: str, out_dir: Path):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import librosa
        import numpy as np
        D = librosa.amplitude_to_db(np.abs(librosa.stft(y)), ref=np.max)
        fig, ax = plt.subplots(figsize=(14, 4))
        librosa.display.specshow(D, sr=sr, x_axis="time", y_axis="hz", cmap="magma", ax=ax)
        plt.colorbar(librosa.display.specshow(D, sr=sr, x_axis="time", y_axis="hz",
                                              cmap="magma", ax=ax), ax=ax, format="%+2.0f dB")
        ax.set_title(f"{title} — Spectrogram")
        plt.tight_layout()
        plt.savefig(str(out_dir / "spectrogram.png"), dpi=120)
        plt.close()
    except Exception as e:
        print(f"      ⚠ Spectrogram skipped: {e}")


def _save_chromagram(chroma, sr, title: str, out_dir: Path):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import librosa
        import numpy as np
        fig, ax = plt.subplots(figsize=(14, 4))
        img = librosa.display.specshow(chroma, y_axis="chroma", x_axis="time", ax=ax, cmap="coolwarm")
        plt.colorbar(img, ax=ax)
        ax.set_title(f"{title} — Chromagram")
        ax.set_yticks(np.arange(12))
        ax.set_yticklabels(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])
        plt.tight_layout()
        plt.savefig(str(out_dir / "chromagram.png"), dpi=120)
        plt.close()
    except Exception as e:
        print(f"      ⚠ Chromagram skipped: {e}")


# ── Stem separation ───────────────────────────────────────────────────────────

def separate_stems(wav_path: Path, output_dir: Path) -> dict[str, Path]:
    stems_dir = output_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    print(f"    ▶ Demucs separating {wav_path.name}…")
    result = subprocess.run(
        [sys.executable, "-m", "demucs", "--model", "htdemucs",
         "--out", str(stems_dir.parent), str(wav_path)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"      ✗ Demucs failed: {result.stderr[:200]}")
        return {}
    demucs_out = stems_dir.parent / "htdemucs" / wav_path.stem
    stem_map = {}
    for stem_name in ["drums", "bass", "other", "vocals"]:
        src = demucs_out / f"{stem_name}.wav"
        if src.exists():
            dst = stems_dir / f"{stem_name}.wav"
            src.rename(dst)
            stem_map[stem_name] = dst
            size_kb = dst.stat().st_size // 1024
            print(f"      ✓ {stem_name}.wav ({size_kb:,}KB)")
    return stem_map


# ── EP palette builder ────────────────────────────────────────────────────────

def build_ep_palette(ep_name: str, tracks_analysis: list[dict]) -> dict:
    """Aggregate per-track analysis into an EP-level sound palette."""
    import numpy as np

    valid = [t for t in tracks_analysis if "error" not in t and "analysis" in t]
    if not valid:
        return {"ep": ep_name, "tracks": tracks_analysis, "error": "no valid tracks"}

    bpms = [t["analysis"]["bpm"] for t in valid]
    keys = [t["analysis"]["key"] for t in valid]
    camelots = [t["analysis"]["camelot"] for t in valid]
    zones = [t["analysis"]["zone"] for t in valid]
    energies = [t["analysis"]["avg_energy_rms"] for t in valid]
    centroids = [t["analysis"]["spectral_centroid_hz"] for t in valid]
    mfcc_matrix = np.array([t["analysis"]["mfcc_means"] for t in valid])

    # Key distribution
    from collections import Counter
    key_dist = dict(Counter(keys).most_common())
    zone_dist = dict(Counter(zones).most_common())
    camelot_dist = dict(Counter(camelots).most_common())
    primary_key = max(key_dist, key=key_dist.get)
    primary_zone = max(zone_dist, key=zone_dist.get)

    # Spectral fingerprint (average MFCC per EP)
    ep_mfcc = [round(float(v), 2) for v in mfcc_matrix.mean(axis=0)]

    # EP-level stem group summary
    group_prominences = {"DRUMS": [], "BASS": [], "MELODIC": [], "ATMOSPHERE": []}
    for t in valid:
        for g, data in t["analysis"].get("stem_groups", {}).items():
            if g in group_prominences:
                group_prominences[g].append(data.get("prominence", 0))
    ep_stem_groups = {
        g: {
            "avg_prominence": round(float(np.mean(vals)), 3) if vals else 0,
            "characteristics": valid[0]["analysis"]["stem_groups"][g]["characteristics"]
            if valid and g in valid[0]["analysis"].get("stem_groups", {}) else [],
        }
        for g, vals in group_prominences.items()
    }

    # BPM zone classification
    avg_bpm = float(np.mean(bpms))
    if avg_bpm < 90:
        ep_zone = "downtempo" if avg_bpm < 75 else "hip_hop"
    elif avg_bpm < 115:
        ep_zone = "funk_fusion"
    elif avg_bpm < 122:
        ep_zone = "house"
    else:
        ep_zone = "tech_house"

    return {
        "ep": ep_name,
        "schemaVersion": "1.0",
        "summary": {
            "bpm_range": [round(min(bpms), 1), round(max(bpms), 1)],
            "bpm_avg": round(avg_bpm, 1),
            "primary_zone": ep_zone,
            "zone_distribution": zone_dist,
            "primary_key": primary_key,
            "key_distribution": key_dist,
            "primary_camelot": camelot_dist and max(camelot_dist, key=camelot_dist.get),
            "camelot_distribution": camelot_dist,
            "avg_energy_rms": round(float(np.mean(energies)), 4),
            "energy_range": [round(float(min(energies)), 4), round(float(max(energies)), 4)],
            "avg_spectral_centroid_hz": round(float(np.mean(centroids)), 1),
            "ep_timbral_fingerprint_mfcc": ep_mfcc,
            "stem_groups": ep_stem_groups,
            "track_count": len(valid),
        },
        "tracks": tracks_analysis,
    }


# ── Main pipeline ─────────────────────────────────────────────────────────────

def process_ep(ep_name: str, track_titles: list[str], output_root: Path,
               wav_index: list[Path], run_stems: bool) -> dict:
    ep_slug = ep_name.replace("SERGIK - ", "").replace("SERGIK - ", "").replace(" ", "-").replace("&", "and")
    ep_dir = output_root / ep_slug
    ep_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*64}")
    print(f"  EP: {ep_name}")
    print(f"  Output: {ep_dir}")
    print(f"{'='*64}")

    tracks_analysis = []
    for title in track_titles:
        wav = find_best_wav(title, wav_index)
        track_slug = title.replace("SERGIK - ", "").replace("SERGIK x ", "")\
                         .replace("SEERGIK - ", "").replace(" ", "-")[:40]
        track_dir = ep_dir / track_slug
        track_dir.mkdir(parents=True, exist_ok=True)

        entry: dict = {"title": title, "track_dir": str(track_dir)}

        if wav is None:
            print(f"  ✗ {title} — no WAV match found")
            entry["error"] = "wav_not_found"
            tracks_analysis.append(entry)
            continue

        print(f"\n  ◉ {title}")
        print(f"    WAV: {wav.name}")
        entry["wav_path"] = str(wav)
        entry["wav_filename"] = wav.name

        # Ableton project lookup
        als_folder = find_ableton_project(title, ALS_DIR)
        if als_folder:
            print(f"    ALS: {als_folder.name}")
            entry["ableton_project"] = als_folder.name
            entry["ableton_tracks"] = parse_als_tracks(als_folder)
        else:
            entry["ableton_project"] = None
            entry["ableton_tracks"] = []

        # librosa analysis
        try:
            analysis = analyze_wav(wav, track_dir)
            entry["analysis"] = analysis
        except Exception as e:
            print(f"    ✗ Analysis failed: {e}")
            entry["error"] = f"analysis_failed: {e}"
            tracks_analysis.append(entry)
            continue

        # Demucs stem separation
        if run_stems:
            stems = separate_stems(wav, track_dir)
            entry["stems"] = {k: str(v) for k, v in stems.items()}
        else:
            entry["stems"] = {}

        tracks_analysis.append(entry)

    palette = build_ep_palette(ep_name, tracks_analysis)

    # Serialize (strip Path objects)
    palette_path = ep_dir / "palette.json"
    with open(palette_path, "w") as f:
        json.dump(palette, f, indent=2, default=str)
    print(f"\n  ✓ Palette saved → {palette_path}")

    return palette


def main():
    parser = argparse.ArgumentParser(description="SERGIK EP Sound Palette Extractor")
    parser.add_argument("--output", default="/tmp/sergik-ep-palettes", help="Output directory")
    parser.add_argument("--stems", action="store_true", help="Run Demucs stem separation")
    parser.add_argument("--ep", default=None, help="Process only one EP (partial match)")
    args = parser.parse_args()

    # Dependency check
    try:
        import librosa  # noqa
        import numpy  # noqa
    except ImportError as e:
        print(f"✗ Missing: {e}. Run: pip install librosa numpy matplotlib")
        sys.exit(1)

    if not WAV_DIR.exists():
        print(f"✗ WAV directory not found: {WAV_DIR}")
        sys.exit(1)

    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)

    wav_index = build_wav_index(WAV_DIR)
    print(f"▶ Indexed {len(wav_index)} WAV files from {WAV_DIR}")

    eps_to_process = EPS
    if args.ep:
        eps_to_process = {k: v for k, v in EPS.items()
                          if args.ep.lower() in k.lower()}
        if not eps_to_process:
            print(f"✗ No EP matching '{args.ep}'. Available: {list(EPS.keys())}")
            sys.exit(1)

    all_palettes = {}
    for ep_name, tracks in eps_to_process.items():
        palette = process_ep(ep_name, tracks, output_root, wav_index, args.stems)
        all_palettes[ep_name] = palette

    # Write master index
    index = {
        "total_eps": len(all_palettes),
        "total_tracks": sum(len(v["tracks"]) for v in all_palettes.values()),
        "eps": {
            name: {
                "primary_key": p.get("summary", {}).get("primary_key"),
                "primary_zone": p.get("summary", {}).get("primary_zone"),
                "bpm_avg": p.get("summary", {}).get("bpm_avg"),
                "track_count": p.get("summary", {}).get("track_count"),
            }
            for name, p in all_palettes.items()
        },
    }
    with open(output_root / "index.json", "w") as f:
        json.dump(index, f, indent=2)

    print(f"\n{'='*64}")
    print(f"  ✓ Sound palette extraction complete")
    print(f"  EPs processed : {len(all_palettes)}")
    print(f"  Output root   : {output_root}")
    print(f"  Index file    : {output_root}/index.json")
    print(f"{'='*64}\n")


if __name__ == "__main__":
    main()
