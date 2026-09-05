#!/usr/bin/env python3
"""
SERGIK Stem Chain Preset Builder
===================================
Generates processing chain presets for each stem group:
  DRUMS / BASS / MELODIC / ATMOSPHERE

Outputs per group:
  1. {group}_chain.json       — machine-readable chain definition
  2. process_{group}.sh       — ffmpeg shell script, apply chain to any WAV
  3. {group}_rack.adg         — Ableton 11 Audio Effect Rack preset (drag into track)
  4. chains/README.md         — parameter documentation

Usage:
    python3 build_stem_chains.py [--output ~/Desktop/SERGIK-Stem-Chains]

The Ableton ADG racks include:
  DRUMS: EQ (kick boost 80Hz, hi presence cut) → Compressor (4:1 fast) → Limiter
  BASS:  EQ (sub boost 60Hz, 2kHz cut) → Compressor (3:1 medium) → Saturator → Sidechain note
  MELODIC: EQ (low cut 200Hz, presence lift 2kHz) → Reverb → Stereo Imager
  ATMOSPHERE: Lowpass 800Hz → Long reverb → Volume automation curve → Subtle delay
"""

import argparse
import gzip
import json
import os
from pathlib import Path


# ── Chain definitions ─────────────────────────────────────────────────────────
# Each chain maps to ffmpeg filter options AND Ableton device parameters.

CHAINS = {
    "DRUMS": {
        "description": "Transient-forward drum bus. Fast attack compressor to tighten hits. "
                       "High-pass at 30Hz removes rumble. EQ punch at 80Hz, air cut at 12kHz "
                       "to keep drums dry and focused in the mix.",
        "purpose": "Kick, snare, hat, and percussion — the body of the groove.",
        "stem_role": "pulse_and_gravity",
        "ffmpeg_filter": (
            "highpass=f=30,"
            "equalizer=f=80:width_type=o:width=2:g=3,"
            "equalizer=f=300:width_type=o:width=1.5:g=-2,"
            "equalizer=f=12000:width_type=o:width=2:g=-3,"
            "acompressor=threshold=-18dB:ratio=4:attack=3:release=60:makeup=2dB,"
            "alimiter=limit=-0.5dB:attack=1:release=50"
        ),
        "parameters": {
            "highpass_freq_hz": 30,
            "eq_band_1": {"freq": 80, "gain_db": 3, "type": "bell", "q": 2.0, "label": "kick_punch"},
            "eq_band_2": {"freq": 300, "gain_db": -2, "type": "bell", "q": 1.5, "label": "mud_cut"},
            "eq_band_3": {"freq": 12000, "gain_db": -3, "type": "shelf_hi", "q": 1.0, "label": "air_cut"},
            "compressor": {
                "threshold_db": -18, "ratio": 4.0, "attack_ms": 3,
                "release_ms": 60, "makeup_db": 2, "knee_db": 3
            },
            "limiter": {"ceiling_db": -0.5, "attack_ms": 1, "release_ms": 50},
        },
        "ableton_devices": [
            {"type": "Eq8",         "label": "DRUM EQ"},
            {"type": "Compressor2", "label": "DRUM COMP"},
            {"type": "Limiter",     "label": "DRUM LIMIT"},
        ],
        "processing_notes": [
            "High-pass at 30Hz: removes sub rumble, keeps kick body",
            "+3dB at 80Hz: punch for kick transient",
            "-2dB at 300Hz: reduces boxy low-mid buildup",
            "-3dB shelf at 12kHz: reduces harshness from hi-hats in dense mixes",
            "Compressor 4:1, 3ms attack: lets transient through, then controls body",
            "60ms release: keeps groove breathing between hits",
        ],
    },

    "BASS": {
        "description": "Sub-forward bass bus with sidechain note for kick integration. "
                       "High-pass at 40Hz (filter sub rumble), body boost at 200Hz, "
                       "2kHz cut to clean up the presence range for melodic content.",
        "purpose": "Sub bass, bass line, 808 — the gravity of the groove.",
        "stem_role": "pulse_and_gravity",
        "ffmpeg_filter": (
            "highpass=f=40,"
            "equalizer=f=60:width_type=o:width=2:g=2,"
            "equalizer=f=200:width_type=o:width=1:g=1.5,"
            "equalizer=f=2000:width_type=o:width=2:g=-4,"
            "acompressor=threshold=-20dB:ratio=3:attack=10:release=120:makeup=1.5dB,"
            "volume=1.0"
        ),
        "parameters": {
            "highpass_freq_hz": 40,
            "eq_band_1": {"freq": 60, "gain_db": 2, "type": "bell", "q": 2.0, "label": "sub_boost"},
            "eq_band_2": {"freq": 200, "gain_db": 1.5, "type": "bell", "q": 1.0, "label": "body_boost"},
            "eq_band_3": {"freq": 2000, "gain_db": -4, "type": "bell", "q": 2.0, "label": "presence_cut"},
            "compressor": {
                "threshold_db": -20, "ratio": 3.0, "attack_ms": 10,
                "release_ms": 120, "makeup_db": 1.5, "knee_db": 6
            },
            "sidechain": {
                "source": "kick", "threshold_db": -20, "ratio": 4.0,
                "attack_ms": 1, "release_ms": 80,
                "note": "Duck bass under kick for separation. Route kick aux into sidechain input."
            },
        },
        "ableton_devices": [
            {"type": "Eq8",         "label": "BASS EQ"},
            {"type": "Compressor2", "label": "BASS COMP + SIDECHAIN from KICK"},
            {"type": "Saturator",   "label": "BASS WARM (Analog Clip, drive 15%)"},
        ],
        "processing_notes": [
            "High-pass at 40Hz: removes DC offset and deep sub rumble",
            "+2dB at 60Hz: adds weight to sub bass layer",
            "+1.5dB at 200Hz: body presence for bass line",
            "-4dB at 2kHz: clears room for melodic content above",
            "Compressor 3:1, 10ms attack: slower than drums, lets bass transient breathe",
            "Sidechain from kick: bass ducks when kick hits, keeps low-end separation",
            "Saturator: adds harmonics to sub-only bass lines (makes them audible on small speakers)",
        ],
    },

    "MELODIC": {
        "description": "Mid-forward melodic bus for pads, lead synths, chord stabs, samples. "
                       "Low-cut at 200Hz to leave bass register for BASS group. "
                       "Presence lift at 2-4kHz for forward harmonic content. "
                       "Room reverb and stereo widening for sense of space.",
        "purpose": "Pads, lead synth, chord stabs, emotional spear.",
        "stem_role": "harmonic_bed + emotional_spear",
        "ffmpeg_filter": (
            "highpass=f=200,"
            "equalizer=f=600:width_type=o:width=1:g=1,"
            "equalizer=f=3000:width_type=o:width=1.5:g=2,"
            "aecho=0.6:0.6:50|75:0.3|0.2,"
            "acompressor=threshold=-24dB:ratio=2:attack=20:release=200:makeup=1dB,"
            "volume=0.9"
        ),
        "parameters": {
            "highpass_freq_hz": 200,
            "eq_band_1": {"freq": 600, "gain_db": 1, "type": "bell", "q": 1.0, "label": "warmth"},
            "eq_band_2": {"freq": 3000, "gain_db": 2, "type": "bell", "q": 1.5, "label": "presence"},
            "reverb": {
                "pre_delay_ms": 12, "decay_sec": 1.8, "room_size": 0.6,
                "dry_wet": 0.25, "type": "room",
                "note": "25% wet. Keep pads in the room without washing the mix."
            },
            "compressor": {
                "threshold_db": -24, "ratio": 2.0, "attack_ms": 20,
                "release_ms": 200, "makeup_db": 1, "knee_db": 6
            },
            "stereo_width": 120,
        },
        "ableton_devices": [
            {"type": "Eq8",         "label": "MELODIC EQ (cut 200Hz low, lift 3kHz presence)"},
            {"type": "Reverb",      "label": "MELODIC ROOM (25% wet, 1.8s decay)"},
            {"type": "Compressor2", "label": "MELODIC GLUE (2:1 soft)"},
        ],
        "processing_notes": [
            "High-pass at 200Hz: keeps melodic content off bass frequencies",
            "+1dB at 600Hz: warmth/body for pads",
            "+2dB at 3kHz: harmonic presence, forward-facing emotional spear",
            "Reverb: room feel, 25% wet — pads breathe without washing",
            "Compressor 2:1, 20ms attack: gentle glue without crushing pads",
            "Stereo widener: 120% width for immersive harmonic bed",
        ],
    },

    "ATMOSPHERE": {
        "description": "High-frequency texture, room sound, FX tails. "
                       "Low-pass at 6kHz (removes melodic content, keeps air). "
                       "Long reverb tail for environmental depth. "
                       "Slow volume automation: loud in intro/outro, fades under groove.",
        "purpose": "Desert heat, room resonance, FX tails — the world the track inhabits.",
        "stem_role": "environment",
        "ffmpeg_filter": (
            "lowpass=f=6000,"
            "equalizer=f=8000:width_type=o:width=1:g=2,"
            "aecho=0.8:0.85:250|400:0.4|0.25,"
            "afade=t=in:st=0:d=2,"
            "volume=0.7"
        ),
        "parameters": {
            "lowpass_freq_hz": 6000,
            "eq_band_1": {"freq": 8000, "gain_db": 2, "type": "bell", "q": 1.0, "label": "air_shimmer"},
            "reverb": {
                "pre_delay_ms": 30, "decay_sec": 4.5, "room_size": 0.9,
                "dry_wet": 0.7, "type": "hall",
                "note": "70% wet — atmosphere is mostly reverb tail"
            },
            "fade_in_sec": 2.0,
            "volume_db": -3,
            "automation": {
                "intro_level": 1.0, "groove_level": 0.3,
                "break_level": 0.8, "outro_level": 1.0,
                "note": "Atmosphere should be heard in intro/outro, ducked under groove sections"
            },
        },
        "ableton_devices": [
            {"type": "AutoFilter",  "label": "ATMOSPHERE LOWPASS (6kHz cutoff)"},
            {"type": "Reverb",      "label": "ATMOSPHERE HALL (70% wet, 4.5s decay)"},
            {"type": "AutoVolume",  "label": "ATMOSPHERE SWELL (slow attack automation)"},
        ],
        "processing_notes": [
            "Low-pass at 6kHz: removes melodic/harmonic content, keeps texture",
            "+2dB at 8kHz: shimmer and air for desert/room feel",
            "Reverb: 70% wet, 4.5s hall decay — creates the space",
            "30ms pre-delay: separates atmosphere from direct signal",
            "Slow fade-in (2s): atmosphere swells into the track, not clicked on",
            "Volume automation: loud in intro/outro, retreats under groove",
        ],
    },
}


# ── Ableton ADG generator ─────────────────────────────────────────────────────

def _adg_eq8(label: str, bands: list[dict]) -> str:
    """Generate minimal Ableton Eq8 XML snippet."""
    # Map band list to Ableton EQ8 band params
    band_xmls = []
    for i, b in enumerate(bands[:8]):
        freq = b.get("freq", 1000)
        gain = b.get("gain_db", 0)
        q    = b.get("q", 1.0)
        mode = {"bell": 3, "shelf_lo": 1, "shelf_hi": 6, "highpass": 0, "lowpass": 8}.get(
            b.get("type", "bell"), 3)
        band_xmls.append(f"""
            <Band{i} Id="{i}">
              <Freq Value="{freq}" />
              <Gain Value="{gain}" />
              <Q Value="{q}" />
              <Mode Value="{mode}" />
              <IsOn Value="true" />
            </Band{i}>""")
    bands_xml = "".join(band_xmls)
    return f"""
          <Eq8 Id="0" LomId="0" IsExpanded="true" On="true" NumberOfInputChannels="2" NumberOfOutputChannels="2">
            <UserName Value="{label}" />
            <Bands>{bands_xml}
            </Bands>
          </Eq8>"""


def _adg_compressor(label: str, threshold: float, ratio: float,
                    attack: float, release: float, makeup: float) -> str:
    """Generate minimal Ableton Compressor2 XML snippet."""
    return f"""
          <Compressor2 Id="1" LomId="0" IsExpanded="true" On="true">
            <UserName Value="{label}" />
            <Threshold Value="{threshold}" />
            <Ratio Value="{ratio}" />
            <Attack Value="{attack}" />
            <Release Value="{release}" />
            <Gain Value="{makeup}" />
          </Compressor2>"""


def _adg_reverb(label: str, decay: float, wet: float) -> str:
    return f"""
          <Reverb Id="2" LomId="0" IsExpanded="true" On="true">
            <UserName Value="{label}" />
            <ReverbTime Value="{decay}" />
            <DryWet Value="{wet}" />
          </Reverb>"""


def build_adg(group: str, chain: dict, out_path: Path):
    """Build a minimal but loadable Ableton 11 Audio Effect Rack (.adg) preset."""
    p = chain["parameters"]
    devices = []

    if group == "DRUMS":
        bands = [
            chain["parameters"]["eq_band_1"],
            chain["parameters"]["eq_band_2"],
            chain["parameters"]["eq_band_3"],
        ]
        devices.append(_adg_eq8("DRUM EQ", bands))
        comp = p["compressor"]
        devices.append(_adg_compressor(
            "DRUM COMP", comp["threshold_db"], comp["ratio"],
            comp["attack_ms"], comp["release_ms"], comp["makeup_db"]
        ))

    elif group == "BASS":
        bands = [p["eq_band_1"], p["eq_band_2"], p["eq_band_3"]]
        devices.append(_adg_eq8("BASS EQ", bands))
        comp = p["compressor"]
        devices.append(_adg_compressor(
            "BASS COMP", comp["threshold_db"], comp["ratio"],
            comp["attack_ms"], comp["release_ms"], comp["makeup_db"]
        ))

    elif group == "MELODIC":
        bands = [p["eq_band_1"], p["eq_band_2"]]
        devices.append(_adg_eq8("MELODIC EQ", bands))
        devices.append(_adg_reverb("MELODIC ROOM", 1.8, p["reverb"]["dry_wet"]))
        comp = p["compressor"]
        devices.append(_adg_compressor(
            "MELODIC GLUE", comp["threshold_db"], comp["ratio"],
            comp["attack_ms"], comp["release_ms"], comp["makeup_db"]
        ))

    elif group == "ATMOSPHERE":
        bands = [p["eq_band_1"]]
        devices.append(_adg_eq8("ATMOSPHERE EQ", bands))
        devices.append(_adg_reverb("ATMOSPHERE HALL", 4.5, p["reverb"]["dry_wet"]))

    devices_xml = "\n".join(devices)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="11" MinorVersion="0.2" SchemaChangeCount="3" Creator="SERGIK DNA Chain Builder" Revision="">
  <AudioEffectGroup Id="0" LomId="0" IsExpanded="true" On="true"
    NumberOfInputChannels="2" NumberOfOutputChannels="2">
    <Name Value="{group} Chain — SERGIK DNA" />
    <ColorIndex Value="4" />
    <Branches>
      <AudioEffectBranch Id="0" LomId="0" ExclusiveArm="false">
        <DeviceChain>
          <AudioToAudioDeviceChain Id="0">
            <TrackDelay><Value Value="0" /><IsValueSampleBased Value="false" /></TrackDelay>
            <Name><EffectiveName Value="{group}" /><UserName Value="{group} — SERGIK" /></Name>
            <Color><PersistentKeyString Value="" /><IsDefaultValue Value="true" /></Color>
            <AutomationEnvelopes><Envelopes /></AutomationEnvelopes>
            <Devices>{devices_xml}
            </Devices>
          </AudioToAudioDeviceChain>
        </DeviceChain>
        <Name Value="{group} Main Chain" />
        <Color Value="4" />
        <IsOn Value="true" />
        <MixerDevice Id="9">
          <Volume><LomId Value="0" /><Manual Value="1" /><AutomationTarget Id="1" /></Volume>
          <Pan><LomId Value="0" /><Manual Value="0" /><AutomationTarget Id="2" /></Pan>
        </MixerDevice>
      </AudioEffectBranch>
    </Branches>
    <ReturnBranches />
  </AudioEffectGroup>
</Ableton>
"""
    # Write as gzip (Ableton ADG format)
    with gzip.open(str(out_path), "wb") as f:
        f.write(xml.encode("utf-8"))
    return out_path


def build_shell_script(group: str, chain: dict, out_path: Path):
    """Generate an ffmpeg shell script that applies the chain to any input WAV."""
    filter_str = chain["ffmpeg_filter"]
    script = f"""#!/bin/bash
# SERGIK {group} Chain Processor
# Usage: ./process_{group.lower()}.sh input.wav [output.wav]
#
# Chain: {chain['description'][:120]}

INPUT="$1"
OUTPUT="${{2:-${{INPUT%.*}}_{group.lower()}_processed.wav}}"

if [ -z "$INPUT" ]; then
  echo "Usage: $0 input.wav [output.wav]"
  exit 1
fi

echo "▶ Processing $INPUT through SERGIK {group} chain..."

ffmpeg -y -i "$INPUT" \\
  -af "{filter_str}" \\
  -ar 44100 -acodec pcm_s16le "$OUTPUT"

echo "✓ Output: $OUTPUT"
"""
    out_path.write_text(script)
    out_path.chmod(0o755)
    return out_path


def build_readme(chains_dir: Path, all_chains: dict):
    lines = [
        "# SERGIK Stem Processing Chains",
        "",
        "> Machine-generated processing chain presets for each stem group.",
        "> Derived from SERGIK's Ableton architecture and per-stem processing tables",
        "> in `knowledge/SERGIK_DNA.md`.",
        "",
        "## Files per Group",
        "",
        "| File | Description |",
        "|---|---|",
        "| `{GROUP}_chain.json` | Machine-readable chain definition with all parameter values |",
        "| `process_{group}.sh` | Shell script — apply chain to any WAV via ffmpeg |",
        "| `{GROUP}_rack.adg` | Ableton 11 Audio Effect Rack preset — drag onto track |",
        "",
        "---",
        "",
    ]
    for group, chain in all_chains.items():
        lines += [
            f"## {group}",
            "",
            f"**Purpose**: {chain['purpose']}  ",
            f"**Stem role**: `{chain['stem_role']}`  ",
            "",
            chain["description"],
            "",
            "### Processing steps:",
            "",
            *[f"{i+1}. {note}" for i, note in enumerate(chain["processing_notes"])],
            "",
            "### Ableton devices:",
            "",
            *[f"- **{d['type']}** — {d['label']}" for d in chain["ableton_devices"]],
            "",
            f"### ffmpeg filter chain:",
            "```",
            chain["ffmpeg_filter"],
            "```",
            "",
            "---",
            "",
        ]
    (chains_dir / "README.md").write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="SERGIK Stem Chain Preset Builder")
    parser.add_argument("--output", default=str(Path.home() / "Desktop/SERGIK-Stem-Chains"))
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    print(f"\n▶ Building stem chain presets → {out}\n")

    for group, chain in CHAINS.items():
        print(f"  {group}")

        # JSON definition
        json_path = out / f"{group}_chain.json"
        with open(json_path, "w") as f:
            json.dump({"group": group, **chain}, f, indent=2)
        print(f"    ✓ {json_path.name}")

        # Shell script
        sh_path = out / f"process_{group.lower()}.sh"
        build_shell_script(group, chain, sh_path)
        print(f"    ✓ {sh_path.name}")

        # Ableton ADG rack
        adg_path = out / f"{group}_rack.adg"
        build_adg(group, chain, adg_path)
        print(f"    ✓ {adg_path.name}")

    # README
    build_readme(out, CHAINS)
    print(f"\n  ✓ README.md")

    # Master chain bundle JSON
    bundle = {
        "schema": "SERGIK_stem_chains_v1",
        "groups": list(CHAINS.keys()),
        "chains": {g: {"ffmpeg_filter": c["ffmpeg_filter"],
                       "parameters": c["parameters"],
                       "stem_role": c["stem_role"]}
                   for g, c in CHAINS.items()},
    }
    with open(out / "chains_bundle.json", "w") as f:
        json.dump(bundle, f, indent=2)
    print(f"  ✓ chains_bundle.json\n")

    print(f"{'='*56}")
    print(f"  ✓ Chain presets complete → {out}")
    print(f"  4 groups × (JSON + shell + ADG) = 12 files")
    print(f"{'='*56}\n")


if __name__ == "__main__":
    main()
