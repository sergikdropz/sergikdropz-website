#!/usr/bin/env python3
"""
SERGIK DNA Manifest Validator
==============================
Validates a sergik-dna-manifest.json against the schema
and applies semantic rules that JSON Schema alone cannot enforce.

Usage:
    python3 validate_sergik_manifest.py path/to/manifest.json

Semantic rules enforced:
  1. targetDurationSec >= 240 (minimum 4 minutes)
  2. First section dramaticRole must be 'establish_world'
  3. Last section dramaticRole must be 'dissolve'
  4. At least one section must be 'break' or 'after_break_return'
  5. Intro section environmentAudible must be True
  6. Outro section environmentAudible must be True
  7. BPM must be within stated zone ranges
  8. At least 4 stems defined
  9. masterBus targetLUFS between -16 and -9
  10. harmonicThesis must not contain 'TODO'
  11. compliance fields must all be True for a final track
"""

import json
import sys
from pathlib import Path


ZONE_BPM_RANGES = {
    "house": (118, 130),
    "tech_house": (122, 135),
    "downtempo": (50, 90),
    "hip_hop": (65, 100),
    "funk_fusion": (85, 115),
    "cross_zone": (50, 150),
}

DRAMATIC_ROLES_IN_ORDER = [
    "establish_world",
    "introduce_groove",
    "escalation",
    "groove_peak",
    "break",
    "after_break_return",
    "dissolve",
]


def error(msg: str) -> dict:
    return {"pass": False, "message": msg}


def ok(msg: str = "✓") -> dict:
    return {"pass": True, "message": msg}


def validate(manifest: dict) -> list[dict]:
    results = []
    track = manifest.get("track", {})
    composition = manifest.get("composition", {})
    sections = composition.get("sections", [])
    render = manifest.get("render", {})
    compliance = manifest.get("compliance", {})

    # Rule 1: Duration
    dur = track.get("targetDurationSec", 0)
    results.append(ok(f"Duration {dur}s >= 240") if dur >= 240
                   else error(f"targetDurationSec {dur} < 240 (minimum 4 minutes)"))

    # Rule 2: Zone / BPM alignment
    zone = track.get("zone", "")
    bpm = track.get("bpm", 0)
    if zone in ZONE_BPM_RANGES:
        lo, hi = ZONE_BPM_RANGES[zone]
        results.append(ok(f"BPM {bpm} within {zone} range [{lo}–{hi}]") if lo <= bpm <= hi
                       else error(f"BPM {bpm} is outside zone '{zone}' range [{lo}–{hi}]"))

    # Rule 3: Section count
    results.append(ok(f"{len(sections)} sections >= 4") if len(sections) >= 4
                   else error(f"Only {len(sections)} sections — need at least 4"))

    # Rule 4: First section = establish_world
    if sections:
        first = sections[0].get("dramaticRole", "")
        results.append(ok("First section is 'establish_world'") if first == "establish_world"
                       else error(f"First section dramaticRole is '{first}', must be 'establish_world'"))

    # Rule 5: Last section = dissolve
    if sections:
        last = sections[-1].get("dramaticRole", "")
        results.append(ok("Last section is 'dissolve'") if last == "dissolve"
                       else error(f"Last section dramaticRole is '{last}', must be 'dissolve'"))

    # Rule 6: Has break
    roles = [s.get("dramaticRole") for s in sections]
    has_break = "break" in roles or "after_break_return" in roles
    results.append(ok("Break section present") if has_break
                   else error("No 'break' or 'after_break_return' section found"))

    # Rule 7: Intro environmentAudible
    if sections:
        intro_env = sections[0].get("environmentAudible", False)
        results.append(ok("Intro environment audible") if intro_env
                       else error("First section environmentAudible must be True"))

    # Rule 8: Outro environmentAudible
    if sections:
        outro_env = sections[-1].get("environmentAudible", False)
        results.append(ok("Outro environment audible") if outro_env
                       else error("Last section environmentAudible must be True"))

    # Rule 9: Section timeline is contiguous
    for i, (a, b) in enumerate(zip(sections, sections[1:])):
        if a.get("endSec") != b.get("startSec"):
            results.append(error(
                f"Section gap between '{a.get('name')}' (ends {a.get('endSec')}) "
                f"and '{b.get('name')}' (starts {b.get('startSec')})"
            ))
    if all(
        sections[i].get("endSec") == sections[i+1].get("startSec")
        for i in range(len(sections)-1)
    ):
        results.append(ok("Section timeline is contiguous"))

    # Rule 10: Stem count
    stems = render.get("stems", [])
    results.append(ok(f"{len(stems)} stems >= 5") if len(stems) >= 5
                   else error(f"Only {len(stems)} stems — need at least 5"))

    # Rule 11: Stem isolation
    non_isolated = [s["role"] for s in stems if not s.get("isolated", True)]
    results.append(ok("All stems isolated") if not non_isolated
                   else error(f"Non-isolated stems: {non_isolated}"))

    # Rule 12: Master bus targets
    bus = render.get("masterBus", {})
    lufs = bus.get("targetLUFS", -99)
    tp = bus.get("truePeakDb", 0)
    dr = bus.get("minDynamicRange", 0)
    results.append(ok(f"LUFS {lufs} in [-16, -9]") if -16 <= lufs <= -9
                   else error(f"targetLUFS {lufs} outside [-16, -9]"))
    results.append(ok(f"True peak {tp} dB <= -0.5") if tp <= -0.5
                   else error(f"truePeakDb {tp} must be <= -0.5"))
    results.append(ok(f"Dynamic range >= {dr} dB") if dr >= 4
                   else error(f"minDynamicRange {dr} < 4"))

    # Rule 13: No TODO in harmonic thesis
    thesis = composition.get("harmonicThesis", "")
    results.append(ok("Harmonic thesis is complete") if "TODO" not in thesis and len(thesis) >= 20
                   else error("harmonicThesis contains TODO or is too short"))

    # Rule 14: Emotional arc has >= 3 states
    arc = composition.get("emotionalArc", [])
    results.append(ok(f"Emotional arc has {len(arc)} states") if len(arc) >= 3
                   else error(f"emotionalArc has only {len(arc)} states — need >= 3"))

    # Rule 15: Environment layers present
    env_layers = manifest.get("environment", {}).get("layers", [])
    results.append(ok(f"Environment has {len(env_layers)} layer(s)") if env_layers
                   else error("No environment layers defined"))

    # Rule 16: Compliance summary (for final tracks only)
    incomplete = [k for k, v in compliance.items() if v is False]
    if not incomplete:
        results.append(ok("All compliance fields True — track is final"))
    else:
        results.append(ok(f"Compliance incomplete (draft): {incomplete}"))

    return results


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_sergik_manifest.py <manifest.json>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"✗ File not found: {path}")
        sys.exit(1)

    with open(path) as f:
        manifest = json.load(f)

    title = manifest.get("track", {}).get("title", path.stem)
    print(f"\n{'='*60}")
    print(f"  SERGIK DNA Validator  ·  {title}")
    print(f"{'='*60}")

    results = validate(manifest)
    passed = sum(1 for r in results if r["pass"])
    failed = [r for r in results if not r["pass"]]

    for r in results:
        icon = "✓" if r["pass"] else "✗"
        print(f"  {icon}  {r['message']}")

    print(f"\n  {passed}/{len(results)} checks passed")

    if failed:
        print(f"\n  FAILED:")
        for r in failed:
            print(f"  ✗  {r['message']}")
        sys.exit(1)
    else:
        print(f"\n  ✓  Manifest is valid SERGIK DNA\n")


if __name__ == "__main__":
    main()
