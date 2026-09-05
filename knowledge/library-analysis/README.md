# SERGIK library analysis dataset

Compiled Sonic DNA, waveforms, and metadata for every catalog recording. One analysis file per audio file; the same file can belong to multiple folders and playlists.

Regenerate:

```bash
# Keep measured JSON, database rows, compiled catalog, and report in sync
node knowledge/scripts/sync-sonic-dna-analysis.mjs
# Catalog-only (no database writes)
node knowledge/scripts/sync-sonic-dna-analysis.mjs --skip-db
# Auto-update on classifier/encyclopedia changes (also started by the dev daemon)
cd web && npm run sonic-dna:watch
# From web/: npm run sonic-dna:sync
```

The watcher listens to `knowledge/scripts`, `knowledge/sonic-dna`, and `web/lib/audio` (groove/intelligence types). It debounces ~2.5s, then reclassifies, applies to the DB, and recompiles. It does **not** watch `measured/*.json` (those are outputs). Disable DB writes with `SONIC_DNA_WATCH_SKIP_DB=1`. Disable entirely with `SONIC_DNA_WATCH=0` on the dev daemon.

Measure then apply:

```bash
# 1) Measure audio (BPM, drum grid, bass lock, root/key) — requires librosa
pip install -r knowledge/scripts/requirements-audio.txt
knowledge/scripts/.venv/bin/python knowledge/scripts/measure_sonic_dna.py --library-only --audio-root "/path/to/wavs"
node knowledge/scripts/sync-sonic-dna-analysis.mjs

# Prefer local Exports WAVs (budget-friendly; ~201/243 library tracks match):
npm run sonic-dna:remasure:dry -w web   # plan
npm run sonic-dna:remasure -w web       # remasure + apply + compile
# Mount: /Volumes/SERGIK/Exports SERGIK/SERGIK WAVs
```

Optional Claude rewrite (needs `ANTHROPIC_API_KEY`): `node knowledge/scripts/run_sonic_dna_agent_pass.mjs --library-only`

**Quality gate:** `sonic_dna_status` is `completed` only when measured BPM, drum family, and key/root exist. Otherwise `partial`. Folder/playlist names are crates, not genre labels. Genre order is drum pattern → tempo/feel → bass lock → **how percussion and instruments are used**. After that, `knowledge/sonic-dna/genre-intelligence.json` attaches world-genre history, culture, psychology, and related styles (Disco, Dub, Detroit, Atlanta trap, etc.) instantiated with this file’s BPM/key/usage. `report.layers` keeps DSP facts separate from those encyclopedia paragraphs.

After measure:

```bash
node knowledge/scripts/report_sonic_dna.mjs
```

Gold-set (detector-seeded; ear-check still needed): `knowledge/library-analysis/gold-set.json`. Template: `gold-set.example.json`.

Uses live home-server Postgres when Docker is up; otherwise `web/data/supabase-export/audio_files.json`.

## Layout

```
knowledge/library-analysis/
  README.md
  dataset.json              # scaffold + counts + compact track index
  catalog.json              # same track index (no waveform peaks)
  catalog.csv               # spreadsheet view
  schema/track-analysis.v1.schema.json
  indexes/
    by-folder.json
    by-playlist.json
    by-genre.json
    by-bpm-zone.json
    by-artist.json
  tracks/{slug}--{id8}.json # full per-track file (DNA + waveform peaks + metadata)
  measured/{uuid}.json      # DSP-only measurements (gitignored)
  sonic-dna-report.json     # library-wide DSP audit (genres, drums, hats, instruments)
  gold-set.example.json     # ear-label template for detector scoring
```

## Per-track file

Each `tracks/*.json` contains:

- **identity** — title, artist, paths, artwork
- **library** — folder + playlist memberships (same audio file reused)
- **metadata** — BPM, energy, danceability, duration, BPM zone
- **analysis.sonicDna** — merged `sonic_dna` + `ai_analysis` (pending stubs lose to real values); `measured` is DSP-only when present
- **analysis.waveform** — 2000-sample peaks, 256-point preview, peak/RMS/crest stats

Schema: `knowledge/schemas/track-analysis.v1.schema.json`

## Notes

- Library tracks: 243 unique audio files across 17 playlists / 10 EPs / 7 collections.
- Catalog extras: audio_files rows not currently in the iTunes library still get an analysis file (`inLibrary: false`).
- Full track JSON is gitignored (waveform peaks). Indexes and catalog stay in git.
