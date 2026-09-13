#!/usr/bin/env python3
"""
SERGIK EP Sample Pack Builder
==============================
Reads the extracted EP palettes (palette.json per EP) and organizes
stems and samples into structured sample packs per EP.

Requires extract_ep_palettes.py to have been run first (with --stems for
actual stem WAVs, otherwise builds from source WAVs via frequency-band splitting).

Usage:
    python3 build_ep_sample_packs.py [--palette-dir /tmp/sergik-ep-palettes]
                                      [--output /tmp/sergik-sample-packs]
                                      [--ep "Daze"]

Output per EP:
    {output}/{EP-Name}/
        DRUMS/
            Track1_drums.wav
            Track2_drums.wav
            ...
        BASS/
            Track1_bass.wav
            ...
        MELODIC/
            Track1_other.wav
            ...
        ATMOSPHERE/
            Track1_atmosphere.wav
            ...
        sample_pack_manifest.json   (palette summary + sample catalog)
        README.md
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

GROUPS = ["DRUMS", "BASS", "MELODIC", "ATMOSPHERE"]
STEM_TO_GROUP = {
    "drums": "DRUMS",
    "bass": "BASS",
    "other": "MELODIC",
    "vocals": "MELODIC",
}


def build_pack_from_stems(ep_dir: Path, pack_dir: Path, palette: dict) -> dict:
    """Organize Demucs stems into group folders for the sample pack."""
    catalog: dict[str, list] = {g: [] for g in GROUPS}

    for track in palette.get("tracks", []):
        title = track.get("title", "Unknown")
        stems = track.get("stems", {})
        track_slug = Path(track.get("track_dir", title)).name

        if not stems:
            continue

        for stem_name, stem_path in stems.items():
            src = Path(stem_path)
            if not src.exists():
                continue
            group = STEM_TO_GROUP.get(stem_name, "ATMOSPHERE")
            dest_dir = pack_dir / group
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{track_slug}_{stem_name}.wav"
            shutil.copy2(src, dest)
            catalog[group].append({
                "file": dest.name,
                "source_track": title,
                "stem": stem_name,
                "size_mb": round(dest.stat().st_size / 1024 / 1024, 2),
            })
            print(f"    ✓ {group}/{dest.name}")

    return catalog


def build_pack_from_source_wavs(ep_dir: Path, pack_dir: Path, palette: dict) -> dict:
    """
    When no Demucs stems are available, copy source WAVs into MELODIC
    and create frequency-split versions using ffmpeg for BASS and DRUMS hints.
    """
    catalog: dict[str, list] = {g: [] for g in GROUPS}

    for track in palette.get("tracks", []):
        title = track.get("title", "Unknown")
        wav_path = track.get("wav_path")
        if not wav_path:
            continue
        wav = Path(wav_path)
        if not wav.exists():
            continue

        track_slug = Path(track.get("track_dir", title)).name
        analysis = track.get("analysis", {})
        stem_groups = analysis.get("stem_groups", {})

        print(f"\n  ◉ {title}")

        # Full mix → MELODIC (source reference)
        melodic_dir = pack_dir / "MELODIC"
        melodic_dir.mkdir(parents=True, exist_ok=True)
        dst_melodic = melodic_dir / f"{track_slug}_full_mix.wav"
        shutil.copy2(wav, dst_melodic)
        catalog["MELODIC"].append({
            "file": dst_melodic.name,
            "source_track": title,
            "stem": "full_mix",
            "size_mb": round(dst_melodic.stat().st_size / 1024 / 1024, 2),
            "note": "Full mix — run --stems for isolated stems",
        })

        # Bass extract via ffmpeg lowpass filter (sub + bass range)
        bass_dir = pack_dir / "BASS"
        bass_dir.mkdir(parents=True, exist_ok=True)
        dst_bass = bass_dir / f"{track_slug}_bass_extract.wav"
        _ffmpeg_filter(wav, dst_bass, "lowpass=f=250,highpass=f=20")
        if dst_bass.exists():
            catalog["BASS"].append({
                "file": dst_bass.name,
                "source_track": title,
                "stem": "bass_extract_lpf250hz",
                "size_mb": round(dst_bass.stat().st_size / 1024 / 1024, 2),
                "note": "LPF 250Hz extraction — approximate bass layer",
            })

        # Drums/transient extract via highpass + compressor (attack in ms, ≥0.01ms)
        drums_dir = pack_dir / "DRUMS"
        drums_dir.mkdir(parents=True, exist_ok=True)
        dst_drums = drums_dir / f"{track_slug}_drums_extract.wav"
        _ffmpeg_filter(wav, dst_drums, "highpass=f=100,acompressor=threshold=-20dB:ratio=8:attack=1:release=50")
        if dst_drums.exists():
            catalog["DRUMS"].append({
                "file": dst_drums.name,
                "source_track": title,
                "stem": "drums_extract_hpf100hz",
                "size_mb": round(dst_drums.stat().st_size / 1024 / 1024, 2),
                "note": "HPF 100Hz + transient compression — approximate drums layer",
            })

        # Atmosphere — high shelf (texture/air)
        atmo_dir = pack_dir / "ATMOSPHERE"
        atmo_dir.mkdir(parents=True, exist_ok=True)
        dst_atmo = atmo_dir / f"{track_slug}_atmosphere.wav"
        _ffmpeg_filter(wav, dst_atmo, "highpass=f=4000,volume=0.6")
        if dst_atmo.exists():
            catalog["ATMOSPHERE"].append({
                "file": dst_atmo.name,
                "source_track": title,
                "stem": "atmosphere_hpf4khz",
                "size_mb": round(dst_atmo.stat().st_size / 1024 / 1024, 2),
                "note": "HPF 4kHz extraction — texture/air layer",
            })

        print(f"    ✓ 4 group extracts created")

    return catalog


def _ffmpeg_filter(src: Path, dst: Path, filter_str: str):
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-af", filter_str,
         "-ar", "44100", "-acodec", "pcm_s16le", str(dst)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"      ⚠ ffmpeg failed for {dst.name}: {result.stderr[-200:]}")


def build_readme(ep_name: str, palette: dict, catalog: dict) -> str:
    summary = palette.get("summary", {})
    lines = [
        f"# {ep_name} — Sample Pack",
        "",
        f"**Primary Zone**: {summary.get('primary_zone', '?')}  ",
        f"**Primary Key**: {summary.get('primary_key', '?')} ({summary.get('primary_camelot', '?')})  ",
        f"**BPM Range**: {summary.get('bpm_range', [0,0])[0]}–{summary.get('bpm_range',[0,0])[1]} BPM (avg {summary.get('bpm_avg', 0)})  ",
        f"**Tracks**: {summary.get('track_count', 0)}  ",
        "",
        "## Stem Group Structure",
        "",
    ]
    for group in GROUPS:
        files = catalog.get(group, [])
        ep_group = summary.get("stem_groups", {}).get(group, {})
        prominence = ep_group.get("avg_prominence", 0)
        chars = ", ".join(ep_group.get("characteristics", []))
        lines.append(f"### {group} (prominence: {prominence:.2f})")
        lines.append(f"*{chars}*")
        lines.append("")
        if files:
            for f in files:
                lines.append(f"- `{f['file']}` — {f.get('note', f['source_track'])}")
        else:
            lines.append("- *(no stems extracted)*")
        lines.append("")
    lines += [
        "## EP Timbral Fingerprint (MFCC)",
        "",
        "```",
        str(summary.get("ep_timbral_fingerprint_mfcc", [])),
        "```",
        "",
        "## Key Distribution",
        "",
        *[f"- {k}: {v} track(s)" for k, v in summary.get("key_distribution", {}).items()],
        "",
        "---",
        "_Generated by SERGIK EP Sound Palette Extractor_",
    ]
    return "\n".join(lines)


def process_ep_pack(ep_dir: Path, pack_root: Path):
    palette_path = ep_dir / "palette.json"
    if not palette_path.exists():
        print(f"  ✗ No palette.json in {ep_dir}")
        return

    with open(palette_path) as f:
        palette = json.load(f)

    ep_name = palette.get("ep", ep_dir.name)
    ep_slug = ep_dir.name
    pack_dir = pack_root / ep_slug
    pack_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*64}")
    print(f"  Pack: {ep_name}")
    print(f"  Output: {pack_dir}")
    print(f"{'='*64}")

    # Determine if stems are available
    has_stems = any(track.get("stems") for track in palette.get("tracks", []))

    if has_stems:
        print("  Mode: Demucs stems available — organizing stem files")
        catalog = build_pack_from_stems(ep_dir, pack_dir, palette)
    else:
        print("  Mode: No stems — building frequency-split approximations from source WAVs")
        catalog = build_pack_from_source_wavs(ep_dir, pack_dir, palette)

    # Write manifest
    manifest = {
        "ep": ep_name,
        "has_demucs_stems": has_stems,
        "groups": {g: catalog.get(g, []) for g in GROUPS},
        "summary": palette.get("summary", {}),
    }
    with open(pack_dir / "sample_pack_manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    # Write README
    readme = build_readme(ep_name, palette, catalog)
    with open(pack_dir / "README.md", "w") as f:
        f.write(readme)

    total_files = sum(len(v) for v in catalog.values())
    print(f"\n  ✓ {total_files} sample files organized into {len(GROUPS)} groups")
    print(f"  ✓ manifest.json + README.md written")


def main():
    parser = argparse.ArgumentParser(description="SERGIK EP Sample Pack Builder")
    parser.add_argument("--palette-dir", default="/tmp/sergik-ep-palettes",
                        help="Directory containing per-EP palette.json files")
    parser.add_argument("--output", default="/tmp/sergik-sample-packs", help="Output directory")
    parser.add_argument("--ep", default=None, help="Process only one EP (partial match)")
    args = parser.parse_args()

    palette_root = Path(args.palette_dir)
    pack_root = Path(args.output)
    pack_root.mkdir(parents=True, exist_ok=True)

    ep_dirs = sorted([d for d in palette_root.iterdir() if d.is_dir()])
    if args.ep:
        ep_dirs = [d for d in ep_dirs if args.ep.lower() in d.name.lower()]

    if not ep_dirs:
        print(f"✗ No EP directories found in {palette_root}")
        sys.exit(1)

    print(f"▶ Building sample packs for {len(ep_dirs)} EP(s)")
    for ep_dir in ep_dirs:
        process_ep_pack(ep_dir, pack_root)

    print(f"\n{'='*64}")
    print(f"  ✓ Sample pack build complete")
    print(f"  Output: {pack_root}")
    print(f"{'='*64}\n")


if __name__ == "__main__":
    main()
