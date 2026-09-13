# SERGIK AI Knowledge Base
## Production Guide & Development Reference

This knowledge base contains all SERGIK-specific data, patterns, and systems for use during web development.

---

## Quick Reference

### Artist Profile
| Field | Value |
|-------|-------|
| Name | SERGIK (Jordan Caboga) |
| Active | 2015-present |
| DAW | Ableton Live 12 + Max for Live |
| Genres | House, Tech House, Funk, Hip-Hop, Soul |

### Key Statistics
| Metric | Value |
|--------|-------|
| Ableton Projects | 20,503 |
| Finished Exports | 721 |
| Unique Collaborators | 98 |
| Peak Year | 2024 (6,364 projects) |

---

## SERGIK DNA Profile

### BPM Zones (Dual-Zone Producer)
```
Zone 1: Downtempo/Hip-Hop  < 90 BPM   41%
Zone 2: House/Tech House   120-129    32%
Average BPM: 107.6
Sweet Spot: 120-127 BPM
```

### Key Preferences (Camelot)
```
10B (D major)  31%  - Primary, bright/energetic
11B (A major)  21%  - Secondary, warm/soulful
7A  (D minor)  13%  - Dark, driving, hypnotic
8A  (A minor)  12%  - Melancholic, deep
```

### Energy Profile
```
Sweet Spot: Level 5-7 (91% of tracks)
Average: 6/10
Style: Mid-energy groove focus
```

### Genre DNA
```
Hip-Hop Foundation  42%
Funk Influence      17%
House Energy         8%
Soul Textures        7%
Other               26%
```

---

## Top Collaborators (Use for Credits/Features)

| Rank | Name | Projects | Style Influence |
|------|------|----------|-----------------|
| 1 | Silent Jay | 408 | Vocals, soul |
| 2 | Slick Floyd | 285 | Electronic groove, funk |
| 3 | Breauxx | 213 | Production complexity, bass |
| 4 | OG Coconut | 187 | - |
| 5 | NOOD | 185 | Bass experimentation |
| 6 | ANDINO | 154 | - |
| 7 | Sean Watson | 151 | - |
| 8 | Sean Hart | 122 | - |
| 9 | CHKLZ | 108 | - |
| 10 | LODIN | 108 | - |

---

## Production Recommendations

### House Track Setup
```yaml
bpm: 122-126
key: 10B or 11B
energy: 6-7
```

### Hip-Hop/Downtempo Setup
```yaml
bpm: 80-88
key: 7A or 8A
energy: 5-6
```

### Funk Fusion Setup
```yaml
bpm: 95-110
key: Major keys
energy: 6
```

### Tech House Setup
```yaml
bpm: 124-128
key: 10B
energy: 6-7
```

---

## DJ Mixing Guide

### Key Transitions from 10B (D major)
- → 11B (A major): Energy UP
- → 9B (E major): Smooth transition
- → 10A (B minor): Relative minor
- → 7A (D minor): Parallel minor

### BPM Transitions
- 85 → 125: Double-time transition
- 125 → 85: Half-time breakdown
- Stay within ±5 BPM for seamless mixes

---

## Quality Standards

### Audio Tiers
| Tier | Format | Bit Depth | Status |
|------|--------|-----------|--------|
| 1 | WAV | 24-bit | Release-ready |
| 2 | WAV/AIF | 24-bit | Include |
| 3 | WAV | 16-bit | Legacy only |
| 4 | MP3/AAC | - | Exclude |

### Mastering Targets
- Loudness: -12 LUFS (±2)
- True Peak: -1.0 dBTP
- Dynamic Range: >6 dB
- Stereo Correlation: >0.7

---

## Track Naming Conventions

### Solo Tracks
```
SERGIK - [Title] [Version] [Key] [BPM].wav
```

### Collaborations
```
SERGIK x [Collaborator] - [Title] [Version].wav
```

### Version Suffixes
- v1, v2, v3 - Iterations
- VIP - Special/extended mix
- SRGFLiP - SERGIK remix
- (Instrumental) - No vocals
- (Mastered) - Final master

---

## Data Files Reference

Located in `/data/`:
- `sergik_artist_data.json` - Complete structured data
- `SERGIK_MUSIC_DATA_SUMMARY.md` - Human-readable summary
- `SERGIK_EXTRACTED_SYSTEMS.md` - Technical systems

---

*Use this knowledge base when building features that involve SERGIK's music data, style preferences, or production patterns.*
