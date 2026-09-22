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
- US ISRC Rights Owner prefix: `QTA53` (registrant Jordan Caboga; allocated 2026-09-17 by the US ISRC Agency). First 2026 code = `QTA532600001` / `QT-A53-26-00001`. Studio mints via `assign_isrc`; locker on usisrc.org is optional storage, not SoundExchange registration.
- Primary social / streaming links (single source of truth — sourced from `web/data/artist.json`, also rendered on `/follow`):
  - Instagram: https://instagram.com/sergikdropz
  - YouTube: https://youtube.com/@sergikdropz
  - Spotify: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H
  - SoundCloud: https://soundcloud.com/sergikdropz
  - Linktree: https://linktr.ee/sergikdropz
  - Amazon Music / TIDAL / Beatport / TikTok / YouTube Music / Shazam / Deezer / Apple Music / Pandora: see `platforms` in `web/data/artist.json`
  - Traxsource / Bandcamp / Mixcloud: Delivery targets in Release Studio; add URLs to `platforms` in `web/data/artist.json` when those artist pages exist

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
| 2026-09-17 | Social promo E2E: `social_promo` column applied; `npm run smoke:studio-social-promo` + Playwright `studio-social-promo.spec.ts`; partial status PATCH merge fixed; post-deploy smoke can run studio check when E2E secrets exist. | Generate worked but status patches dropped; no CI/smoke path. |
| 2026-09-17 | Marketing Pipeline Social promo: generate PT-optimized IG Feed / Story / Reel + Facebook post calendar from street date; download 1080 feed + story stills and 15s vinyl story videos; persist `social_promo` JSON on `distribution_releases`. | Campaign/smart-link handoff alone did not cover Meta story sharing or post scheduling. |
| 2026-09-17 | Marketing pipeline board is rebuilt from distribution truth: street date no longer inherits Jan-1 calendar placeholders; phases (needs launch / date TBD / upcoming / past undelivered / live); alerts scoped to non-live rows; payload includes UPC, tracks, target vs live stores, press/copy fill, collab, and next marketing action. | Placeholder slate dates looked “Released”; stores showed empty despite 16 DSP targets; Ops-style gap tiles drowned the marketing job. |
| 2026-09-17 | Pipeline Ops/Marketing surfaces DSP ingest, contract email readiness, SERGIK UGC, store-link counts, and Release Collab pending reviews as integration chips + alert tiles; next actions deep-link into the matching workspace step. | New rights/DSP/collab work lived only on release detail; cross-release boards still looked like pre-integration queues. |
| 2026-09-17 | **Release Collab** is a fifth Studio nav item (`/studio/collab`) plus admin sidebar group under Release Studio. Per-release collaborators, in-app thread (email notify from `release.studio@sergikdropz.com`), magic-link review portal `/collab/[token]`, Resend webhooks at `/api/webhooks/resend`. Schema: `add_release_collab.sql`. | Rights had one-way contract email only; Studio needed ongoing collab communication without guest Studio login. |
| 2026-09-17 | DSP ingest requires a **legal songwriter name per billed collaborator** (SERGIK → Jordan Caboga). Split sheets store party, legal name, role, %, publisher, IPI, PRO. A SERGIK-only 100% sheet on a collab is invalid — seed equal shares from Catalog credits. | PROs/Apple need first-and-last names, not stage names; collab masters must list every billed owner. |
| 2026-09-17 | Rights Clearance generates first-party **Split sheet**, **Producer agreement**, and **Collab agreement** packets from Catalog credits/splits (copy + mark approved). Not DistroKid add-ons. | Contracts were status-only; Studio needs printable paperwork tied to real parties. |
| 2026-09-17 | Rights contracts: store collaborator emails (`party_contacts`) and **Email for signing** via Resend (`POST …/contracts/send`). SERGIK self skipped. | Collaborators need a send path, not only copy/paste packets. |
| 2026-09-17 | Catalog press notes are editable journalist copy (`description` + `intention` on `sonic_snapshot`, `press_source: edited`). Rewrite from listen still overwrites. | Press copy is used on Copy and DSP blurbs; AI listen is a draft, not the only writer. |
| 2026-09-17 | Catalog credits edit store title, billed **x** collaborators vs **feat.** add-ons, and lyrics (`sonic_snapshot.lyrics_excerpt`). A featured name already on the primary line is dropped so “SERGIK x OG Coconut” is not also “feat. OG Coconut”. Filename prefixes like “OG Coconut - What you want” become store title “What you want”. | DSP titles must not include artist names; billed vs featured is two different roles. |
| 2026-09-17 | Catalog **Replace WAV** swaps `distribution_tracks.wav_url` on the same row (ISRC unchanged) and, when `music_library_track_id` is set, also replaces the Music Vault `audio_files` object and requeues Sonic DNA. | Mix/master upgrades must not mint a new QTA53 code; player + DSP package stay one file. |
| 2026-09-17 | SERGIK UGC pack is first-party on Rights (`ugc_pack`). Partner is always SERGIK — not DistroKid, Identifyy, or another CMS the artist enrolls in separately. | User-generated Content ID / TikTok / Meta claims should stay on this platform. Dual-enrolling the same master at DistroKid Social Media Pack is forbidden. |
| 2026-09-16 | Release Studio nav is five items: Home, Releases, Create, Pipeline, **Release Collab**. Create merges new release + track upload + CSV import. Pipeline merges command center + marketing + calendar + SoundExchange. Legacy URLs redirect. | Ops vs collab messaging are different jobs; Collab stays out of fan nurturing. |
| 2026-09-17 | Release Studio Music Vault **track** catalog: EPs are `ep`/`remix` folders; **singles are every other catalog track** (crates `album`, typed `single`) not assigned to an EP. Playlists stay in the vault. Whole-folder import is still EP/single/remix only — do not import a crate as a release. | Crate tracks are loose singles until they live on an EP. |
| 2026-09-17 | Official US ISRC prefix is `QTA53`. Studio assign/bulk-assign defaults to it (`ISRC_PREFIX` can override). | Prefix allocated to Jordan Caboga by the US ISRC Agency; assignment was blocked when env was unset. |
| 2026-09-16 | Release Studio Delivery default targets include Pandora (Follow artist URL), Traxsource, Mixcloud, and Bandcamp. Facebook / Twitter / Discord / Linktree stay Follow-only socials. | House/DJ storefronts belong in Delivery; social profiles are not DSPs. Pandora already had a live artist page on `/follow`. |
| 2026-09-16 | Release Studio Delivery connects DSPs by resolving live store pages (pasted URL + iTunes/Deezer + optional Spotify/YouTube/Odesli keys) into `distribution_store_links`. It does not upload audio to Spotify/Apple/YouTube/Shazam. | Those platforms do not accept indie uploads; a distributor still delivers the master. Studio needs the live URLs for the site, smart links, and SEO. |
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
