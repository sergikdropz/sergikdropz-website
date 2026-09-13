"""Attach world-genre history, culture, and psychoacoustics to measured groove.

Primary class still comes from audio usage. This module never reads titles or folders.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

KB_PATH = Path(__file__).resolve().parents[1] / "sonic-dna" / "genre-intelligence.json"


@lru_cache(maxsize=1)
def load_kb():
    return json.loads(KB_PATH.read_text())


def _profile(primary: str, family: str) -> dict:
    kb = load_kb()
    profiles = kb.get("profiles") or {}
    return profiles.get(primary) or profiles.get(family) or profiles.get("Unclassified") or {}


def usage_related(measured: dict) -> list[str]:
    perc = measured.get("percussion") or {}
    hats = perc.get("hatGrid")
    snare = perc.get("snareRole")
    kick = perc.get("kickRole")
    drum = measured.get("drumFamily")
    bpm = measured.get("bpm") or 0
    extra = []
    if hats == "offbeat-hats" and 110 <= bpm <= 132:
        extra += ["Disco", "Chicago House", "Boogie", "Nu-Disco"]
    if hats in ("sparse-accents", "open-or-minimal"):
        extra += ["Dub", "UK Steppers", "Sound-system culture"]
    if snare == "half-time-beat-3" and hats in ("eighths", "offbeat-hats") and drum != "four-on-the-floor":
        extra += ["Trap", "Southern Hip-Hop", "Atlanta Trap"]
    elif snare == "half-time-beat-3" and hats == "16th-wash":
        extra += ["Atlanta Trap", "Drill"]
    elif snare == "half-time-beat-3":
        extra += ["Dancehall", "Dub", "Halftime"]
    if kick == "syncopated-or-broken-kick" or drum == "breakbeat":
        extra += ["UK Bass", "Broken Beat", "Funk breaks"]
    if drum == "dembow":
        extra += ["Dancehall", "Latin urban"]
    if drum == "boom-bap":
        extra += ["East Coast Hip-Hop", "Jazz Rap"]
    if drum == "one-drop":
        extra += ["Roots Reggae", "Rocksteady"]
    if hats in ("eighths", "16th-wash") and drum == "four-on-the-floor" and bpm >= 138:
        extra += ["Techno", "Trance"]
    out = []
    for name in extra:
        if name not in out:
            out.append(name)
    return out


def energy_dance(measured: dict) -> tuple[int, int]:
    rel = ((measured.get("spectral") or {}).get("relative") or {})
    bpm = float(measured.get("bpm") or 120)
    drum = measured.get("drumFamily")
    hats = (measured.get("percussion") or {}).get("hatGrid")
    arousal = (rel.get("presence") or 0) + (rel.get("air") or 0) + (rel.get("kick") or 0) * 0.5
    energy = 4 + int(round(min(5, arousal * 12 + max(0, bpm - 100) / 40)))
    dance = 5
    if drum == "four-on-the-floor" and 115 <= bpm <= 132:
        dance = 8
        if hats in ("offbeat-hats", "eighths"):
            dance = 9
    elif drum in ("dembow", "one-drop"):
        dance = 8
    elif drum in ("breakbeat", "half-time"):
        dance = 6
    elif drum in ("sparse", "unknown"):
        dance = 3
    if hats in ("sparse-accents", "open-or-minimal"):
        dance = max(4, dance - 2)
    return max(1, min(10, energy)), max(1, min(10, dance))


def mode_psychology(measured: dict) -> str:
    scale = (measured.get("scale") or "").lower()
    key = measured.get("key") or "an unnamed center"
    if measured.get("unpitched"):
        return (
            "Pitch center is too weak to name. Without a stable tonic, Western major/minor valence maps do not apply; "
            "listeners will lean on rhythm and spectrum instead."
        )
    if scale == "minor":
        return (
            f"Named center {key}. In many Western listeners, minor collections trend toward lower valence "
            "(Juslin/Gabrielsson-type findings) — a tendency, not a universal. Rhythm and bass weight can override that coloring."
        )
    if scale == "major":
        return (
            f"Named center {key}. Major collections often trend brighter in Western pop/club hearing, "
            "again as a statistical tendency rather than a law."
        )
    return f"Named center {key}."


def _social_usage(drum: str, hat: str, snare: str, bpm: float, primary: str) -> str:
    if hat == "offbeat-hats" and 110 <= bpm <= 132:
        return (
            "Social usage: a shared dance-floor clock. People fill the gaps between kicks together — talking, stepping, "
            "and staying in the room without needing a lyric to agree."
        )
    if hat in ("sparse-accents", "open-or-minimal"):
        return (
            "Social usage: huddle and sound-system congregation. The social unit is the chest and the sub, "
            "not a marching line of hats."
        )
    if snare == "half-time-beat-3":
        return (
            "Social usage: lean-back togetherness. The snare on 3 invites heads and shoulders more than a four-on-the-floor march."
        )
    if drum == "four-on-the-floor" and bpm >= 138:
        return (
            "Social usage: endurance warehouse coupling — stay on the grid for a long time with few harmonic events."
        )
    if drum in ("boom-bap", "breakbeat"):
        return (
            "Social usage: nod-and-cypher energy. The broken kick is a conversation starter more than a mass-march cue."
        )
    return (
        f"Social usage: {primary} as a room template — people use the measured pulse to decide whether to dance, lean, or listen."
    )


def _sonic_intent(drum: str, hat: str, lock: str, primary: str) -> str:
    if hat == "offbeat-hats" and drum == "four-on-the-floor":
        return (
            "Sonic intent: keep bodies on a house/disco lift — kick as heartbeat, offbeat hats as the invitation to move in the holes."
        )
    if hat in ("sparse-accents", "open-or-minimal"):
        return (
            "Sonic intent: open space so bass and delay can act as architecture. The mix wants weight and air, not a hat wash."
        )
    if drum in ("half-time",) or "half-time" in (lock or ""):
        return (
            "Sonic intent: slow the felt pocket against a faster clock so attention drops into the snare and sub."
        )
    if lock == "offbeat-syncopated" and drum == "four-on-the-floor":
        return (
            "Sonic intent: conversation between bass and kick — bounce rather than lockstep — typical of funky/disco house usage."
        )
    return f"Sonic intent: instantiate {primary} as a motor-and-mood template from this file's drums, tempo, bass, and percussion — not from a crate name."


def _listener_effect(drum: str, hat: str, snare: str, lock: str, energy: int, dance: int, emotions: str, mode_note: str) -> str:
    bits = [
        f"Listener effect: predicted affect cluster {emotions}.",
        f"Heuristic arousal {energy}/10 and dance affordance {dance}/10 from pulse, hats, and spectrum — not a lab score.",
    ]
    if hat == "offbeat-hats":
        bits.append("Offbeat hats create a small, repeating prediction error that many listeners feel as lift (groove-pleasure curve).")
    if hat in ("sparse-accents", "open-or-minimal"):
        bits.append("Sparse hats lower temporal density so sub and space can dominate the nervous system's 'where am I' map.")
    if snare == "half-time-beat-3":
        bits.append("Snare on 3 half-times the felt meter; the body often couples to the slower pocket even when the clock BPM is high.")
    if lock == "offbeat-syncopated":
        bits.append("Bass off the kick is moderate syncopation — the pleasure peak for groove rather than stiffness or chaos.")
    if drum == "four-on-the-floor":
        bits.append("Stable 4/4 recruits sensorimotor synchronization: the pulse becomes something to join, not just to hear.")
    bits.append(mode_note)
    bits.append("These are listening and movement tendencies, not a guarantee of inner state and not a therapeutic claim.")
    return " ".join(bits)


def compose_psychoacoustics(
    measured: dict,
    prof: dict,
    science: dict,
    energy: int,
    dance: int,
    primary: str,
    clock: str,
    feel: str,
    kick: str,
    snare: str,
    hat: str,
    inst: list[str],
) -> dict:
    drum = measured.get("drumFamily") or "unknown"
    lock = (measured.get("bass") or {}).get("lock") or "unspecified bass"
    bpm = float(measured.get("bpm") or 0)
    emotions = ", ".join((prof.get("emotions") or [])[:4]) or "an unmarked affect"
    mode_note = mode_psychology(measured)
    social = prof.get("socialUsage") or _social_usage(drum, hat, snare, bpm, primary)
    if not str(social).lower().startswith("social usage"):
        social = f"Social usage: {social}"
    intent = prof.get("sonicIntent") or _sonic_intent(drum, hat, lock, primary)
    if not str(intent).lower().startswith("sonic intent"):
        intent = f"Sonic intent: {intent}"
    effect = prof.get("listenerEffects") or _listener_effect(drum, hat, snare, lock, energy, dance, emotions, mode_note)
    if not str(effect).lower().startswith("listener effect"):
        effect = f"Listener effect: {effect}"
    scene = ", ".join(inst[:3]) or "the measured drum/bass scene"
    formula = (
        f"Activation formula: drums ({kick} on a {drum} grid) → tempo/feel ({clock}, {feel or 'unknown feel'}) → "
        f"bass ({lock}) → hats and snare ({hat}; {snare}) → instruments ({scene}) → "
        f"listener ({emotions}; arousal {energy}/10, dance {dance}/10)."
    )
    report = " ".join(
        p
        for p in (
            social,
            intent,
            formula,
            effect,
            science.get("activationFormula"),
            science.get("socialCoupling"),
            science.get("entrainment") if drum == "four-on-the-floor" else None,
            science.get("syncopation") if lock == "offbeat-syncopated" or hat == "offbeat-hats" else None,
            science.get("halfTime") if snare == "half-time-beat-3" or feel == "half-time" else None,
            science.get("subBass") if any("sub" in (n or "").lower() or "808" in (n or "").lower() for n in inst) else None,
        )
        if p
    )
    return {
        "socialUsage": social,
        "sonicIntent": intent,
        "activationFormula": formula,
        "listenerEffects": effect,
        "report": report,
    }


def compose_intelligence(measured: dict) -> dict:
    kb = load_kb()
    genre = measured.get("genre") or {}
    primary = genre.get("primary") or "Unclassified"
    family = genre.get("family") or primary
    sub = genre.get("subgenre")
    prof = _profile(primary, family)
    perc = measured.get("percussion") or {}
    arr = measured.get("arrangement") or {}
    bpm = measured.get("bpm")
    feel = measured.get("timingFeel")
    effective = measured.get("effectiveBpm")
    key = measured.get("key")
    camelot = measured.get("camelot")
    science = kb.get("science") or {}
    related = list(dict.fromkeys((prof.get("related") or []) + usage_related(measured)))
    energy, dance = energy_dance(measured)
    inst = [i.get("label") for i in (measured.get("instruments") or []) if (i.get("confidence") or 0) >= 0.4]

    clock = f"{int(round(bpm))} BPM" if bpm else "unmeasured tempo"
    pocket = f"effective pocket ~{int(effective)} BPM" if effective and bpm and abs(effective - bpm) >= 8 else clock
    usage_bits = " ".join(arr.get("lines") or [])
    hat = perc.get("hatGrid") or "unspecified hats"
    snare = perc.get("snareRole") or "unspecified snare"
    kick = perc.get("kickRole") or "unspecified kick"

    historical_context = " ".join(
        p for p in (
            prof.get("history"),
            f"This file's clock is {clock} ({feel or 'unknown feel'}; {pocket}). Kick is used as {kick}; snare as {snare}; hats as {hat}.",
            science.get("halfTime") if (snare == "half-time-beat-3" or feel == "half-time") else None,
            science.get("syncopation") if (measured.get("bass") or {}).get("lock") == "offbeat-syncopated" else None,
            science.get("entrainment") if (measured.get("drumFamily") == "four-on-the-floor") else None,
            science.get("subBass") if any("sub" in (n or "").lower() or "808" in (n or "").lower() for n in inst) else None,
            science.get("delaySpace") if primary == "Reggae" else None,
        ) if p
    )

    cultural_desc = " ".join(
        p for p in (
            prof.get("culture"),
            f"Related traditions on the map (not extra labels for this file): {', '.join(related[:10])}." if related else None,
        ) if p
    )

    psych = " ".join(
        p for p in (
            prof.get("psychology"),
            mode_psychology(measured),
            f"Estimated arousal {energy}/10 and dance affordance {dance}/10 from spectrum, pulse, and hat usage — heuristic, not a lab score.",
        ) if p
    )

    psycho = compose_psychoacoustics(
        measured,
        prof,
        science,
        energy,
        dance,
        primary,
        clock,
        feel,
        kick,
        snare,
        hat,
        inst,
    )

    journey = (
        f"The motor story follows how percussion is used: {usage_bits or (kick + '; ' + snare + '; ' + hat)} "
        f"Emotionally the encyclopedia of {primary} suggests {', '.join((prof.get('emotions') or [])[:5]) or 'an unmarked affect'}, "
        f"instantiated at {pocket}"
        + (f" in {key}" if key and not measured.get("unpitched") else "")
        + "."
    )

    musicology_desc = " ".join(
        p for p in (
            prof.get("theory"),
            prof.get("production"),
            f"Camelot {camelot}." if camelot else None,
        ) if p
    )

    fusion = (
        f"{primary} sits in the {family} family"
        + (f" with sub-dialect {sub}" if sub else "")
        + f". Adjacent world styles for context: {', '.join(related[:8])}."
        if related
        else f"{primary} / {family}."
    )

    description = " ".join(
        p for p in (
            f"Groove class {primary}" + (f" / {sub}" if sub else "") + f" from measured usage, not from a crate name.",
            usage_bits,
            historical_context,
            cultural_desc,
            psych,
        ) if p
    )

    intention = psycho.get("sonicIntent") or (
        f"Function: {primary} as a social-motor template — "
        f"{'dance-floor 4/4 coupling' if measured.get('drumFamily') == 'four-on-the-floor' else 'a non-4/4 or half-time body map'}. "
        f"The mix privileges {', '.join(inst[:3]) or 'the measured drum/bass scene'}."
    )

    intelligence = {
        "description": description,
        "intention": intention,
        "summary": description[:400] + ("…" if len(description) > 400 else ""),
        "emotional": {
            "primaryEmotions": prof.get("emotions") or [],
            "emotionalJourney": journey,
            "psychologicalProfile": psych,
            "moodTransitions": [],
        },
        "musical": {
            "keySignature": key or "Unknown",
            "timeSignature": "4/4",
            "scale": measured.get("scale"),
            "harmonicComplexity": prof.get("theory") or "",
            "rhythmicPatterns": " · ".join(
                filter(
                    None,
                    [
                        measured.get("drumFamily"),
                        perc.get("hatGrid"),
                        perc.get("snareRole"),
                        feel,
                        (measured.get("bass") or {}).get("lock"),
                        clock,
                    ],
                )
            ),
            "instrumentation": inst,
            "productionTechniques": prof.get("techniques") or [],
            "musicalInfluences": prof.get("influences") or [],
        },
        "historical": {
            "eraInfluences": prof.get("eras") or [],
            "historicalContext": historical_context,
            "evolutionFrom": prof.get("evolutionFrom") or [],
            "innovationPoints": [
                "Usage-first classification: drums → hats/snare role → bass → tempo.",
                *( [f"Related map includes {r}" for r in related[:3]] ),
            ],
        },
        "regional": {
            "primaryRegions": prof.get("regions") or [],
            "culturalInfluences": (prof.get("related") or [])[:6],
            "regionalCharacteristics": cultural_desc,
            "crossCulturalElements": related[:8],
        },
        "genres": {
            "primaryGenres": [g for g in [primary, family] if g],
            "subgenres": [s for s in [sub, *(prof.get("subgenres") or [])] if s],
            "genreFusion": fusion,
            "genreEvolution": " ← ".join((prof.get("evolutionFrom") or [])[:6] + [primary]),
            "genreCharacteristics": (prof.get("techniques") or [])[:8],
            "genreInfluences": related,
        },
        "technical": {
            "bpm": round(bpm) if isinstance(bpm, (int, float)) else None,
            "energyLevel": energy,
            "danceability": dance,
            "key": key,
            "camelot": camelot,
            "technicalDescription": " ".join(
                filter(None, [prof.get("production"), f"Spectral bands relative: {((measured.get('spectral') or {}).get('relative') or {})}."])
            ),
        },
        "drums": {
            "patternRecognition": f"{measured.get('drumFamily')} grid; kick {kick}; snare {snare}; hats {hat}.",
            "complexity": perc.get("styles") or [],
        },
        "musicology": {
            "description": musicology_desc,
            "era": {
                "decade": (prof.get("eras") or ["unspecified era"])[0],
                "description": prof.get("history"),
                "eraInfluences": prof.get("eras") or [],
                "historicalPeriod": "; ".join(prof.get("eras") or []),
            },
            "style": {
                "primaryStyle": primary,
                "description": prof.get("theory"),
                "styleCharacteristics": prof.get("techniques") or [],
                "stylisticInfluences": prof.get("influences") or [],
            },
            "production": {
                "techniques": prof.get("techniques") or [],
                "description": prof.get("production"),
                "productionEra": (prof.get("eras") or [None])[0],
            },
        },
        "cultural": {
            "description": cultural_desc,
            "regions": prof.get("regions") or [],
            "culturalInfluences": related[:8],
            "regionalCharacteristics": cultural_desc,
            "crossCulturalElements": related[:8],
        },
        "relatedGenres": related,
        "psychoacoustics": psycho,
        "scienceNotes": [
            science.get("entrainment"),
            science.get("syncopation"),
            science.get("subBass"),
            science.get("modeValence"),
            science.get("socialCoupling"),
            science.get("activationFormula"),
        ],
        "kbVersion": kb.get("version"),
        "method": kb.get("method"),
    }
    return intelligence
