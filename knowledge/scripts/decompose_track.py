#!/usr/bin/env python3
"""
SERGIK Track Decomposition Pipeline
====================================
Separates a finished WAV export into stems using Demucs v4,
analyzes each stem with librosa, and outputs a partial
SERGIK DNA manifest ready for manual completion.

Usage:
    python3 decompose_track.py path/to/track.wav [--output ./output_dir]

Requirements:
    pip install demucs librosa basic-pitch numpy scipy

Output structure:
    output_dir/
      {track_name}/
        stems/
          drums.wav
          bass.wav
          other.wav
          vocals.wav        (if present)
        midi/
          bass.mid
          other.mid         (melody/chord content)
        analysis/
          chromagram.png    (key visualization)
          spectrogram.png   (energy over time)
          section_map.json  (auto-detected sections)
        manifest_partial.json  (pre-filled DNA manifest)
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

# ── Dependency check ──────────────────────────────────────────────────────────

def check_deps():
    missing = []
    try:
        import librosa  # noqa: F401
    except ImportError:
        missing.append("librosa")
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    if missing:
        print(f"Missing: {missing}. Run: pip install {' '.join(missing)}")
        sys.exit(1)

# ── Stem separation via Demucs ────────────────────────────────────────────────

def separate_stems(audio_path: Path, output_dir: Path) -> dict[str, Path]:
    """Run Demucs v4 (htdemucs) to separate into 4 stems."""
    stems_dir = output_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)

    print(f"▶ Separating stems: {audio_path.name}")
    result = subprocess.run(
        [
            sys.executable, "-m", "demucs",
            "--two-stems", "no",
            "--model", "htdemucs",
            "--out", str(stems_dir.parent),
            str(audio_path),
        ],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"Demucs error:\n{result.stderr}")
        print("Install: pip install demucs")
        return {}

    # Demucs outputs to: out/htdemucs/{track_name}/{stem}.wav
    demucs_out = stems_dir.parent / "htdemucs" / audio_path.stem
    stem_map = {}
    for stem_name in ["drums", "bass", "other", "vocals"]:
        src = demucs_out / f"{stem_name}.wav"
        if src.exists():
            dst = stems_dir / f"{stem_name}.wav"
            src.rename(dst)
            stem_map[stem_name] = dst
            print(f"  ✓ {stem_name}.wav ({dst.stat().st_size // 1024}KB)")

    return stem_map

# ── MIDI extraction via Basic Pitch ───────────────────────────────────────────

def extract_midi(stems: dict[str, Path], output_dir: Path) -> dict[str, Path]:
    """Extract MIDI from bass and melodic (other) stems using Basic Pitch."""
    midi_dir = output_dir / "midi"
    midi_dir.mkdir(exist_ok=True)
    midi_map = {}

    for stem_name in ["bass", "other"]:
        if stem_name not in stems:
            continue
        stem_path = stems[stem_name]
        print(f"▶ Extracting MIDI from {stem_name}…")
        result = subprocess.run(
            [sys.executable, "-m", "basic_pitch", str(midi_dir), str(stem_path)],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            # Basic Pitch saves as {stem}_basic_pitch.mid
            mid = midi_dir / f"{stem_path.stem}_basic_pitch.mid"
            if mid.exists():
                dst = midi_dir / f"{stem_name}.mid"
                mid.rename(dst)
                midi_map[stem_name] = dst
                print(f"  ✓ {stem_name}.mid")
        else:
            print(f"  ✗ Basic Pitch failed for {stem_name}: {result.stderr[:200]}")

    return midi_map

# ── Audio analysis ────────────────────────────────────────────────────────────

def analyze_audio(audio_path: Path, output_dir: Path) -> dict:
    """Extract BPM, key, energy curve, and section boundaries."""
    import librosa
    import numpy as np

    analysis_dir = output_dir / "analysis"
    analysis_dir.mkdir(exist_ok=True)

    print(f"▶ Analyzing {audio_path.name}…")
    y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    # BPM
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    import numpy as np
    bpm = float(np.atleast_1d(tempo)[0])
    print(f"  BPM detected: {bpm:.1f}")

    # Key from chromagram
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    key_idx = int(np.argmax(chroma_mean))
    note_names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
    detected_key = note_names[key_idx]
    print(f"  Key detected: {detected_key}")

    # Energy curve — root mean square energy per second
    hop = sr // 4  # 4 samples per second
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    times = librosa.times_like(rms, sr=sr, hop_length=hop)
    energy_curve = [{"t": float(t), "rms": float(e)} for t, e in zip(times, rms)]

    # Section boundary detection via onset envelope
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    section_frames = librosa.segment.detect_locally_flat(
        onset_env, min_dist=sr // 512 * 30  # min 30s between sections
    ) if hasattr(librosa.segment, 'detect_locally_flat') else []

    # Simpler fallback: detect energy transitions as section boundaries
    window = sr * 20 // hop  # 20-second windows
    energy_windows = [float(rms[i:i+window].mean()) for i in range(0, len(rms)-window, window)]
    transitions = []
    for i in range(1, len(energy_windows)-1):
        delta = abs(energy_windows[i] - energy_windows[i-1])
        if delta > 0.02:  # threshold
            t_sec = (i * 20)
            transitions.append(t_sec)

    # Build auto section map
    section_boundaries = [0] + transitions + [int(duration)]
    auto_sections = []
    density_labels = ["minimal","sparse","moderate","dense","wall_of_sound"]
    for i, (start, end) in enumerate(zip(section_boundaries, section_boundaries[1:])):
        seg_rms = rms[int(start * sr / hop / sr):int(end * sr / hop / sr)]
        seg_energy = float(seg_rms.mean()) if len(seg_rms) > 0 else 0
        density_idx = min(int(seg_energy * 100), 4)
        auto_sections.append({
            "name": f"section_{i+1}",
            "startSec": start,
            "endSec": end,
            "density": density_labels[density_idx],
            "dramaticRole": "establish_world" if i == 0 else ("dissolve" if i == len(section_boundaries)-2 else "escalation"),
            "environmentAudible": i == 0 or i == len(section_boundaries)-2,
            "grooveLayerCount": density_idx + 1
        })

    # Map BPM to zone
    if bpm < 90:
        zone = "downtempo" if bpm < 75 else "hip_hop"
    elif bpm < 115:
        zone = "funk_fusion"
    elif bpm < 122:
        zone = "house"
    else:
        zone = "tech_house"

    # Camelot wheel (simplified — major keys only for now)
    major_camelot = {"C":"8B","D":"10B","E":"12B","F":"7B","G":"9B","A":"11B","B":"1B",
                     "C#":"3B","D#":"5B","F#":"2B","G#":"4B","A#":"6B"}
    minor_camelot = {"A":"8A","B":"10A","C#":"12A","D":"7A","E":"9A","F#":"11A","G#":"1A",
                     "C":"5A","F":"4A","G":"6A","D#":"3A","A#":"2A"}
    camelot = major_camelot.get(detected_key, "?B")

    # Save energy curve
    with open(analysis_dir / "energy_curve.json", "w") as f:
        json.dump(energy_curve[:200], f, indent=2)  # first 200 points

    # Generate spectrogram PNG
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        D = librosa.amplitude_to_db(abs(librosa.stft(y)), ref=np.max)
        plt.figure(figsize=(14, 4))
        librosa.display.specshow(D, sr=sr, x_axis="time", y_axis="hz", cmap="magma")
        plt.colorbar(format="%+2.0f dB")
        plt.title(f"{audio_path.stem} — Spectrogram")
        plt.tight_layout()
        plt.savefig(str(analysis_dir / "spectrogram.png"), dpi=150)
        plt.close()
        print(f"  ✓ spectrogram.png saved")
    except Exception as e:
        print(f"  ✗ Spectrogram failed: {e}")

    result = {
        "duration_sec": round(duration, 1),
        "bpm": round(bpm, 1),
        "detected_key": detected_key,
        "camelot": camelot,
        "zone": zone,
        "auto_sections": auto_sections,
    }

    with open(analysis_dir / "section_map.json", "w") as f:
        json.dump(result, f, indent=2)
    print(f"  ✓ section_map.json saved ({len(auto_sections)} sections detected)")

    return result

# ── Manifest builder ──────────────────────────────────────────────────────────

def build_partial_manifest(
    audio_path: Path,
    analysis: dict,
    stems: dict[str, Path],
    midi_files: dict[str, Path],
    output_dir: Path,
) -> dict:
    """Build a partial SERGIK DNA manifest from analysis results."""

    track_id = audio_path.stem.lower().replace(" ", "-").replace("_", "-")

    stem_entries = []
    for role in ["environment", "kick", "bass", "pad", "hat", "percussion", "lead_synth"]:
        source_type = "demucs_separated" if role in ["kick","bass","hat","percussion"] else "midi_generated"
        processing = {
            "kick": ["highpass","equalizer","acompressor","limiter"],
            "bass": ["highpass","equalizer","acompressor","sidechain","volume"],
            "pad": ["lowpass","aecho","afade","volume"],
            "hat": ["highpass","equalizer","volume"],
            "percussion": ["equalizer","aecho","acompressor","volume"],
            "lead_synth": ["highpass","equalizer","aecho","volume","automation"],
            "environment": ["lowpass","volume","automation"],
        }.get(role, ["volume"])
        stem_entries.append({
            "role": role,
            "isolated": True,
            "sourceType": source_type,
            "processing": processing
        })

    manifest = {
        "schemaVersion": "1.0",
        "track": {
            "id": track_id,
            "title": audio_path.stem,
            "archetype": "desert_groove",  # TODO: fill in
            "zone": analysis["zone"],
            "key": f"{analysis['detected_key']} major",  # TODO: verify major/minor
            "camelot": analysis["camelot"],
            "bpm": analysis["bpm"],
            "targetDurationSec": analysis["duration_sec"],
            "emotionalCenter": "TODO: one-sentence description of the emotional state this track develops",
            "collaborators": []
        },
        "composition": {
            "harmonicThesis": "TODO: describe what the harmony is doing and why",
            "emotionalArc": ["patient_expansion", "groove_inevitability", "earned_release"],
            "hasChangedReturn": True,
            "containsBreakSection": True,
            "sections": analysis["auto_sections"]
        },
        "environment": {
            "roomDefinition": "TODO: describe the room this track inhabits",
            "room": "desert_heat",  # TODO: choose from enum
            "layers": [
                {
                    "role": "primary_texture",
                    "sourceKind": "synthesized_environment",
                    "subjectLink": "TODO: explain the connection between this texture and the track's subject",
                    "audibleInIntro": True,
                    "audibleInOutro": True
                }
            ]
        },
        "arrangement": {
            "harmonicBed": ["sustained pad", "drone"],
            "emotionalSpear": ["lead synth"],
            "pulseAndGravity": ["kick", "bass", "sub"],
            "orchestralBloom": [],
            "conversationPairs": [
                {"left": "kick", "right": "bass", "relationship": "body and drive"}
            ]
        },
        "render": {
            "pipelineMode": "stem_first",
            "stemOrder": ["environment","kick","bass","pad","hat","percussion","lead_synth"],
            "stems": stem_entries,
            "masterBus": {
                "targetLUFS": -12,
                "truePeakDb": -1.0,
                "minDynamicRange": 6,
                "stereoCorrelationMin": 0.7
            }
        },
        "decompositionSources": {
            "sourceWavs": [
                {
                    "title": audio_path.stem,
                    "filepath": str(audio_path),
                    "role": "primary_reference",
                    "demucsStemsPath": str(output_dir / "stems") if stems else None,
                    "midiExtractionPath": str(output_dir / "midi") if midi_files else None
                }
            ]
        },
        "compliance": {
            "sectionMapWritten": True,
            "harmonicThesisPresent": False,
            "environmentPresent": False,
            "stemIsolationRetained": bool(stems),
            "grooveEarnsResolution": False,
            "outroHasEnvironment": False,
            "masteringTargetsMet": False
        }
    }

    out_path = output_dir / "manifest_partial.json"
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  ✓ manifest_partial.json written → {out_path}")

    return manifest

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SERGIK Track Decomposition Pipeline")
    parser.add_argument("audio", help="Path to source WAV or MP3 file")
    parser.add_argument("--output", default="./decomposed", help="Output directory (default: ./decomposed)")
    parser.add_argument("--skip-stems", action="store_true", help="Skip Demucs stem separation")
    parser.add_argument("--skip-midi", action="store_true", help="Skip Basic Pitch MIDI extraction")
    args = parser.parse_args()

    check_deps()

    audio_path = Path(args.audio).resolve()
    if not audio_path.exists():
        print(f"✗ File not found: {audio_path}")
        sys.exit(1)

    output_dir = Path(args.output) / audio_path.stem
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  SERGIK DNA Decomposition")
    print(f"  Source : {audio_path.name}")
    print(f"  Output : {output_dir}")
    print(f"{'='*60}\n")

    stems = {}
    if not args.skip_stems:
        stems = separate_stems(audio_path, output_dir)
    else:
        print("  (Skipping stem separation)")

    midi_files = {}
    if not args.skip_midi and stems:
        midi_files = extract_midi(stems, output_dir)
    else:
        print("  (Skipping MIDI extraction)")

    analysis = analyze_audio(audio_path, output_dir)

    manifest = build_partial_manifest(audio_path, analysis, stems, midi_files, output_dir)

    print(f"\n{'='*60}")
    print(f"  ✓ Decomposition complete")
    print(f"  BPM    : {analysis['bpm']}")
    print(f"  Key    : {analysis['detected_key']} ({analysis['camelot']})")
    print(f"  Zone   : {analysis['zone']}")
    print(f"  Stems  : {list(stems.keys()) or 'skipped'}")
    print(f"  MIDI   : {list(midi_files.keys()) or 'skipped'}")
    print(f"  Next   : Edit {output_dir}/manifest_partial.json")
    print(f"         : Then run: python3 validate_sergik_manifest.py manifest_partial.json")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
