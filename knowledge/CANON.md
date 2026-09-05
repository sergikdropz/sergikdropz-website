# SERGIK project canon (AI + team)

Use this file for **stable facts and decisions** the agent should not infer. Keep entries short; link out to Notion/Supabase for long-form content.

## Identity and positioning

- Artist / project name: SERGIK (DJ, producer, curator, organizer — Phoenix, AZ)
- Public one-line pitch: Underground electronic music producer and DJ building groove-forward, minimal-leaning sets for warehouses, after-hours spaces, and environment-aware dance floors.
- Tone (brand voice) in a few adjectives: Dark, energetic, direct, confident. Underground. No fluff.

## Stack (frozen unless changed here)

- Front end: Next.js 14, TypeScript, Tailwind.
- Data/auth: Supabase.
- Payments: Stripe.
- Hosting: Vercel.
- Audio: wavesurfer.js, tone.js, peaks.js — user-initiated playback only; no autoplay.
- Testing: Playwright (E2E), Vitest (unit).

## Facts that must stay consistent

- Official site URL: https://sergikdropz.com
- Route inventory and E2E crawl alignment: [knowledge/SITE_INDEX.md](./SITE_INDEX.md) and [generated/site-knowledge.json](./generated/site-knowledge.json) (regenerate with `cd web && npm run knowledge:build`).
- Library analysis dataset (Sonic DNA + waveforms + metadata, one file per track): [library-analysis/README.md](./library-analysis/README.md). Regenerate with `node knowledge/scripts/compile_library_analysis.mjs`.
- Auto DJ beatmatching doctrine (media-time phase, AlignmentState, BeatSync): [DJ_SYNC_DOCTRINE.md](./DJ_SYNC_DOCTRINE.md).
- Primary social / streaming links (single source of truth — sourced from `web/data/artist.json`):
  - Instagram: https://instagram.com/sergikdropz
  - YouTube: https://youtube.com/@sergikdropz
  - Spotify: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H
  - SoundCloud: https://soundcloud.com/sergikdropz
  - Linktree: https://linktr.ee/sergikdropz

## Product boundaries

- **Audio:** user-initiated playback only; no autoplay in UI work.
- **Embeds:** use official embeds for Spotify, SoundCloud, YouTube; click-to-load where applicable.

## Library containers (UI vs data)

Display names in the music library. Backend folder `type` is unchanged (`album` | `ep` | `single` | …).

| UI name | Data `type` | Meaning |
| --- | --- | --- |
| **EPs** | `ep` | Finished multi-track releases. |
| **Crates** | `album` | Producer/DJ vibe collections of loose singles (assigned or unassigned to a future EP). A curated sound space for one mood / emotional frequency — not a commercial LP. Folder and playlist names are crates, not genre labels (see [library-analysis/README.md](./library-analysis/README.md)). |
| **Singles** | `single` | Standalone one-offs. |
| **Playlists** | curated playlists | Public listening sequences / sets. Crates are the workspace; playlists are the published journey. |

Browse tab label: **Crates & EPs**. Song-table column **Album** stays ID3-style metadata.

## Release and events (optional, or point to Notion/DB)

- Current release or focus: Music production and live performance platform with direct fan monetization (music library, vault unlocks, memberships, merch, splits, purchasable tracks).
- Notable upcoming events (title / date / city) — or “see Notion calendar”.

## Decisions log (newest first)

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-03 | Waveform tape color modes remesure from Sonic DNA + unified intelligence (phrase grids, onsets, spectral mix, instruments, energy) before paint | L/M/H-only coloring mislabeled kicks/hats/vocals; DNA pocket was unused except a weak bias |
| 2026-08-28 | Auto DJ: media-time BPM phase, AlignmentState, resolvedIncomingSec, mediaDelayToWallMs, longer BeatSync lock, FoF-only snare; doctrine in DJ_SYNC_DOCTRINE.md | Harsh off-beat mixes from rate-scaled phase, wall-clock fire, cue undo, early unlock |
| 2026-08-28 | Auto DJ: kick onset series, syncMode BeatSync/TempoSync UI, peak-ready fire gate, admin grid lock on sonic_dna | Envelope-only residual, missing peaks at fire, no grid lock persistence |
| 2026-08-28 | DSP measure writes kickOnsetSec + gridOffsetSec; ensureKickOnsetSec on apply; MixQualityHud grades last mix | Onsets only at Lock Grid; sync telemetry buried in status string |
| 2026-08-28 | BeatSync BPM guard (half/double/low conf → TempoSync); mix-quality history (local); kick-onset backfill script; Playwright Sync mode | Unsafe BeatSync on wrong octave; no history; no library backfill path |
| 2026-08-29 | Auto DJ canonical OUT=last N bars / IN=first downbeat; math 8-bar first; lead-in prepare-only; freeze plan; locked grid preferred | Early mixes from outroStartRatio + lead-shifted OUT; markers off grid |
| 2026-08-26 | Track genre/subgenre edit force-refills Sonic DNA encyclopedia for the new preferred class (keep DSP audioPrimary); open report modal syncs immediately | Preference edits left old Tech House prose in place because encyclopedia looked “thick” |
| 2026-08-26 | Accuracy upgrades: bass pocket measure wave, confidence-gated LLM skip, classify conflict resolve, `runAccuracyChallenge` patches before publish | Higher DSP truth + grounded narrative without more polymath LLMs |
| 2026-08-26 | Polymath ∥ adds psychology + psychoacoustics agents; challenge stage stamps local accuracy warnings by default | Accurate listener/activation layers; apply full useful intel sequence |
| 2026-08-26 | Sonic DNA intel v3 pipeline: waveform → DSP measure (drum∥harmony) → classify lock → polymath ∥ → intention → description → compose → challenge → publish; recipe `sonic-dna-v2.2-intel`; genre after DSP; blackboard peer communication | Optimum accuracy sequence; agents collaborate on shared facts before narrative |
| 2026-08-26 | Sonic DNA encyclopedia: TS port of `compose_intelligence` (`genre-intelligence.json`) runs on every fill/GET/job so agent-path reports match measure-path depth | Thin stub reports vs Funky House gold were two pipelines; one KB for all groove classes |
| 2026-08-26 | Sonic DNA v2 pipeline: job stages (health→waveform→measure→normalize→blend→compose→publish), DSP-first statusFromMeasured, dual-write, evidence ledger, pocket fingerprint, creative insights | End stuck dual-% progress; authoritative measured truth; comprehensive report from collective measured knowledge |
| 2026-08-24 | UI labels `type: album` collections as **Crates** (browse: Crates & EPs). Keep DB/API `album`. | Those folders are vibe playlists of loose singles, not LPs. Distinguishes crates (workspace) from EPs and from Playlists (published sets). |
| 2026-08-19 | Sonic DNA audit adds spectral instrument roles + percussion styles; descriptions must be composed from measured fields only | Titles/folders/LLM were inventing arrangement; instruments are band-energy roles with confidence, not sample IDs. |
| 2026-08-19 | Sonic DNA auto-syncs on classifier/encyclopedia edits via `sonic-dna:watch` (dev daemon + folderOpen task) | Keep DB + compiled catalog current without a manual sync after each analysis change. |
| 2026-08-18 | Compiled library analysis dataset under `knowledge/library-analysis/` (one JSON file per audio recording; catalog + indexes committed, full waveform peaks gitignored) | Restore and organize Sonic DNA, waveforms, and metadata so playlists can share the same file without duplicating analysis. |
| 2026-05-15 | Archived 172 stale .md files from `web/` root to `web/docs/archive/` | Web root had accumulated 172+ operational/scratch markdown files; moved to archive to reduce noise. |
| | | |

---

Update this when marketing facts or technical constraints change. For long narratives, store in Notion and put a one-line pointer here.
