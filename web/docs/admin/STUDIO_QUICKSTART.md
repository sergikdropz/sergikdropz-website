# Studio Distribution Workflow - Quick Start

## Overview

The Studio dashboard is four surfaces:
1. **Home** → `/studio` — readiness snapshot
2. **Create** → `/studio/create` — new release, track upload, CSV ISRC/split import, or DistroKid My Music JSON
3. **Releases** → `/studio/releases` — work a package through catalog → rights → copy → delivery → launch
4. **Pipeline** → `/studio/pipeline` — ops queues (DSP ingest, contracts, UGC, collab), marketing + DSP connect, calendar, and ISRC registry
5. **Release Collab** → `/studio/collab` — collaborator thread + magic-link review portal

## Setup

### 1. Database Schema
Run the SQL schema in Supabase:
```sql
-- Execute: web/supabase/studio_schema.sql
```

### 2. Environment Variables
Add to `.env.local`:
```bash
# ISRC Configuration (optional — defaults to allocated QTA53)
ISRC_PREFIX=QTA53  # US ISRC Agency Rights Owner Prefix (Jordan Caboga, allocated 2026-09-17)

# SoundExchange API (optional - for ISRC submission to US ISRC Agency)
# Pipeline → ISRCs works in local registry mode without these; CSV → isrc.soundexchange.com is the finish line.
SOUNDEXCHANGE_API_KEY=your_api_key
SOUNDEXCHANGE_ACCOUNT_ID=your_account_id
SOUNDEXCHANGE_BASE_URL=https://api.soundexchange.com  # Optional

# Distributor API (Revelator aggregator — DSP delivery)
# Without keys, Delivery → Distribute to stores dry-runs (no DSP upload).
# Partner/sandbox: support@revelator.com — then set keys and REVELATOR_DRY_RUN=0.
REVELATOR_API_KEY=your_api_key
REVELATOR_PARTNER_USER_ID=your_partner_user_id
# REVELATOR_API_SECRET=your_partner_user_id   # legacy alias
REVELATOR_BASE_URL=https://api.revelator.com
# REVELATOR_PLATFORM_URL=https://platform.revelator.com
# REVELATOR_ENTERPRISE_ID=
# REVELATOR_DRY_RUN=1
# REVELATOR_REQUIRE_LIVE=0
```

### Revelator partner onboarding
1. Email **support@revelator.com** (or your Revelator sales contact) for partner API + sandbox.
2. Receive `partnerApiKey` + `partnerUserId`; put them in `.env.local` as `REVELATOR_API_KEY` / `REVELATOR_PARTNER_USER_ID`.
3. Set `REVELATOR_DRY_RUN=0`. Confirm Delivery health badge shows **Aggregator · Live**.
4. After first live distribute, refresh store IDs via Revelator `GET /common/lookup/stores` if regional DSPs stay “unsupported”.
5. Self-publish on SERGIK remains separate from aggregator delivery.

### Before partner reply (do now)
- Apply DSP cover column: `node scripts/apply-artwork-dsp-url-migration.mjs` (or paste `supabase/migrations/add_artwork_dsp_url.sql`).
- On a real release: attach WAV/FLAC masters + ISRCs, set UPC, **Generate DSP cover**, confirm Delivery readiness tiles go green.
- Dry-run **Distribute to stores** — validates packet + curated queue; does not upload until keys land.
- Ask Support (when they reply) about DistroKid UPC keep-streams vs new UPC.

### 3. ISRC Prefix (allocated)
- Registrant: Jordan Caboga
- Prefix: `QTA53` (US ISRC Agency, allocated 2026-09-17)
- Format: `PREFIX + YY + SERIAL` → first 2026 code is `QTA532600001` (`QT-A53-26-00001`)
- Up to 100,000 designation codes per year of reference
- Studio Assign ISRC mints the next serial atomically. Optionally also store the same code in the USISRC locker. Locker storage is not SoundExchange registration.

## Workflow

### Upload Track
1. Go to `/studio/create?tab=track`
2. Upload WAV file (required)
3. Upload artwork (optional)
4. Fill in metadata:
   - Title (required)
   - Version (e.g., "Original", "Remix")
   - Duration
   - Contributors (comma-separated)
   - Splits (format: `Artist1:50, Artist2:50` - must sum to 100%)
   - Explicit flag
5. Click "Create Track"

### Assign ISRC
1. After creating track, click "Assign ISRC"
2. System generates unique ISRC using atomic counter
3. Format: `PREFIX + YY + SERIAL` (e.g., `QTA532600001` / `QT-A53-26-00001`)
4. **Submit to SoundExchange** (optional): Click "Submit to SoundExchange" to register ISRC with US ISRC Agency

### Create Release
1. Go to `/studio/create`
2. Fill in release metadata:
   - Title, Type (Single/EP/Album)
   - Release date, Genre, Description
   - Upload artwork
3. Select tracks (only tracks with ISRCs can be selected), or import a Music Vault **EP**. Add **singles** from any catalog track not assigned to an EP (crate tracks included; playlists stay in the vault)
4. Click "Create Release"

### Distribute Release
1. Go to `/studio/releases/[id]`
2. Review tracks and metadata
3. Click "Distribute Release"
4. System validates:
   - All tracks have ISRCs
   - Release has at least one track
   - Metadata is complete
5. Submits to distributor API
6. Status updates: `draft` → `submitted` → `delivered` → `live`

### Social / Meta promo (Marketing Pipeline)
On `/studio/pipeline?tab=marketing` → **Social promo** per release:

1. Apply migration: `npm run db:migrate-social-promo` (or paste `add_social_promo_to_releases.sql`)
2. **Generate schedule** — PT-optimized IG Feed / Story / Reel + Facebook posts from street date (T-14 → T+3)
3. Download **Feed 1080**, **Story still**, or **15s vinyl story/reel video** (needs Catalog WAV)
4. Copy captions · mark **Posted** after upload in Meta Business Suite / Instagram

Smoke / E2E:
- `npm run smoke:studio-social-promo` — authenticated generate + persist
- `npx playwright test e2e/studio-social-promo.spec.ts` — UI + API (needs E2E_ADMIN_*)

Does not auto-publish to Meta — Studio prepares assets + timing; you post from Meta.
First-party YouTube / TikTok / Meta UGC extra lives on **Rights**, not Delivery, and not DistroKid.

1. Open `/studio/releases/[id]` → Rights
2. Enroll the release in SERGIK UGC monetization and pick YouTube Content ID / TikTok UGC / Meta Rights Manager
3. Status becomes Queued with SERGIK. Mark Live after fingerprints are registered on this platform
4. Apply `web/supabase/migrations/add_ugc_pack_to_copyright_checklists.sql` so the extra can persist (`ugc_pack` JSON on `release_copyright_checklists`)

This does not upload audio. TikTok/Instagram Delivery links are artist pages. Do not also enroll the same master in DistroKid Social Media Pack or another CMS.

**UGC pack UI (Rights):** enroll → pick YouTube Content ID / TikTok Music ID / Meta Rights Manager → clear sample/master/composition blockers → **Mark fingerprints live**. Stores `notes`, `enrolled_at`, and `live_at` on `ugc_pack` JSON. Pipeline UGC chip counts queued (opted-in, not live).

Smoke / E2E:
- `npx playwright test e2e/studio-ugc-pack.spec.ts` — enroll via copyright API + Rights UI (needs `E2E_ADMIN_*`)

### DSP ingest (required before go-live)
Stores bounce packages that skip these. Fill them on Catalog, Metadata, Rights, and Launch:

1. **Catalog → Edit credits:** store title (not “Artist - Song”), billed artists joined with **x** vs **feat.** add-ons, lyrics, original vs cover, **songwriter legal name for every billed collaborator** (SERGIK maps to Jordan Caboga), AI yes/no, Apple performer + producer, title preview (no `feat.` / years / emoji), version radios (normal / radio edit / other), optional radio-edit ISRC pair and preview-clip start
2. **Catalog → Edit splits:** party, legal name, role, share %, publisher, IPI, PRO. Seed from credits for collabs (equal billed shares). Saving credits also fills a missing/SERGIK-only sheet from the billed line
3. **Catalog → Replace WAV:** swap the mix/master on that row. ISRC stays. If the track is vault-linked, Music Vault audio and Sonic DNA update with the same file
4. **Catalog → Press note:** edit journalist copy and “for the room” intent in place, then Save. Rewrite from listen still drafts from Sonic DNA + lyrics
5. **Metadata:** DSP primary/secondary genre (Sonic DNA classes like Funky House auto-map to Dance/House), previously released (reuse ISRC/UPC if yes), language, 7-day street date, artwork ownership, and **artwork credits** (designer / photographer / illustrator). Description is a start-to-finish EP listen from catalog press notes, titles, and Sonic DNA energy — **Write listening journey** (auto-fills if empty)
6. **Rights / Launch:** worldwide rights, no other artist names, no fake streams, YouTube Music understood, artwork owned. Clearance builds Split / Producer / Collab contract packets from Catalog — add collaborator emails → **Email for signing** (Resend) or Copy → Mark approved. Launch also lists recommended checks: 7-day street date, preview clip, radio-edit pair, artist profiles
7. **Release Collab** (`/studio/collab`): add collaborators, in-app thread (optional email notify from `release.studio@sergikdropz.com`), magic-link review portal (`/collab/[token]` — listen + approve). Apply `web/supabase/migrations/add_release_collab.sql`. Point Resend webhooks to `/api/webhooks/resend` with `RESEND_WEBHOOK_SECRET`. Full checklist: [RELEASE_COLLAB_SETUP.md](./RELEASE_COLLAB_SETUP.md)
8. **Delivery:** DistroKid-style “already on Spotify/Apple/YouTube/Instagram/Facebook?” cards from `artist.json`, plus the IDs so the release lands on existing SERGIK pages. **Connect stores** fans out live album/track URLs:

| Provider | Env / gate | What it fills |
| --- | --- | --- |
| Apple Music / iTunes | always on | ISRC / UPC / title search |
| Deezer | always on | ISRC / title search |
| Spotify catalog | `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` | ISRC / UPC search |
| YouTube Data | `YOUTUBE_API_KEY` | title → YouTube + YouTube Music |
| song.link (Odesli) | `ODESLI_API_KEY` or `SONG_LINK_API_KEY` | Amazon, Tidal, Pandora, Anghami, Boomplay, Audiomack, … |
| MusicBrainz | on by default (`DSP_MUSICBRAINZ=0` to disable) | UPC / ISRC → URL relations |
| Artist profiles | `artist.json` / Follow | fallback when no album deep-link |

Paste-only / DistroKid-submitted (often no public album URL): iHeart, Qobuz, Saavn, Claro, NetEase, Tencent, Joox, Flo, Kuack, Adaptr, MediaNet. Optional DistroKid “more stores” opt-ins: Beatport, Audiomack, Snapchat, MassiveMusic, Roblox.

Smoke / E2E:
- `npm run smoke:studio-dsp-connect` — DistroKid FTP import + Connect stores (persist)
- `npx playwright test e2e/studio-dsp-connect.spec.ts` — catalog completeness + connect (needs `E2E_ADMIN_*`)
- `npx playwright test e2e/studio-distrokid-import.spec.ts` — dry-run FTP fixture import

9. Apply `web/supabase/migrations/add_dsp_ingest_fields.sql` and `add_artwork_credits.sql`

Launch preflight will block go-live until ingest is green (Force launch still bypasses).

### Check Status
- Delivery → **Check delivery status** polls Revelator (or dry-run status)
- Store links upsert when aggregator reports `live` / `delivered` with URLs
- Links are stored in `distribution_store_links` (then use **Verify live stores**)

### Distribute to stores (aggregator)
- Delivery → **Distribute to stores** posts `{ mode: "aggregator" }` with Revelator preflight
- Preflight blocks: missing UPC, non-WAV/FLAC masters, artwork, banned title junk, UGC origin, linking ack (migrations), Beatport without Support enablement
- **DSP-ready cover**: Delivery → **Generate DSP cover** (or auto on Distribute) probes site art (≥1400²) and writes `gallery-images/studio/release-covers/{id}/dsp-ready.jpg`. Site `artwork_url` is never mutated. Prefer `artwork_dsp_url` (column or `marketing_copy` fallback) in the aggregator packet.
- Rights toggles (streaming / download / UGC / Beatport / linking) save into `marketing_copy.revelator_delivery`
- Dry-run without partner keys; live when `REVELATOR_*` is set and `REVELATOR_DRY_RUN=0`
- After keys: store IDs refresh from `GET /common/lookup/stores`
- Curated IDs today: Apple (1), Spotify (9), YouTube Music (13), YouTube CID (307), Facebook RM (310), TikTok (319)
- Aggregator store matrix is honest: curated vs lookup vs unsupported (Studio’s 33 targets ≠ Revelator queueable set)
- **Force / redeliver** requeues after reject/error (still respects hard WAV/ISRC/artwork gates)
- Ops checklist links: DSP cover, Distribution Deals Worksheet, FB/IG whitelist, YT safelist, Beatport enablement, track linking

## Public Music Page

The public `/music` page now reads from `distribution_releases`:
- Only shows releases with `distributor_status = 'live'`
- Falls back to static JSON if API fails
- Maintains existing UI/UX

## API Endpoints

### Studio Tracks
- `GET /api/studio/tracks` - List all tracks
- `POST /api/studio/tracks` - Create track
- `GET /api/studio/tracks/[id]` - Get track
- `PUT /api/studio/tracks/[id]` - Update track
- `POST /api/studio/tracks/[id]/replace-wav` - Replace master WAV (keeps ISRC; updates linked vault file)
- `DELETE /api/studio/tracks/[id]` - Delete track

### Studio Releases
- `GET /api/studio/releases` - List releases (admin)
- `GET /api/studio/releases/public` - Get live releases (public)
- `POST /api/studio/releases` - Create release
- `GET /api/studio/releases/[id]` - Get release with tracks
- `PUT /api/studio/releases/[id]` - Update release
- `DELETE /api/studio/releases/[id]` - Delete release
- `POST /api/studio/releases/[id]/distribute` - Submit for distribution
- `GET /api/studio/releases/[id]/status` - Poll distribution status
- `GET|POST /api/studio/releases/[id]/dsp-artwork` - Probe site art / generate DSP-ready cover (release-covers folder)
- `POST /api/studio/releases/from-vault` - Import Music Vault EP folder
- `POST /api/studio/releases/from-distrokid` - Import DistroKid My Music JSON (UPC/ISRC/store links)
- `GET|POST /api/studio/releases/[id]/dsp-connect` - Connect stores status + fan-out (Odesli / MusicBrainz / catalog APIs)
- `POST /api/studio/releases/from-store-url` - LANDR-style Spotify/Apple URL → previously_released draft
- `GET|PATCH /api/studio/releases/[id]/stream-continuity` - Migrate & keep streams checklist

### DistroKid / migrate import
See `web/docs/admin/DISTROKID_IMPORT.md` and `web/docs/admin/MIGRATE_KEEP_STREAMS.md`. Create → Import: DistroKid JSON and/or Store URL. Reuses live UPC/ISRCs; never mints QTA53 on those paths. Catalog JSON may include `submitted_stores` (DistroKid icon row) and album links for Spotify / Apple / Amazon / Deezer / iHeart when DistroKid exposes them.

### DSP Masters (R2)
Canonical distribution WAVs live in Cloudflare R2 under `audio/dsp-masters/{release}/{ISRC}-{title}.wav`, with a Music Vault **DSP Masters** folder.

When you set up / open a release, Studio auto-scans your local drive (`SERGIK ALBUM RELEASE MASTERS`, `Exports SERGIK`, `Distrokid downloads`), uploads matches to R2, and links `wav_url`. If a track isn’t found, Catalog shows **Locate master** so you can pick the WAV.

```bash
cd web && npx tsx scripts/ingest-dsp-masters.ts          # dry-run (title match + duration verify)
cd web && npx tsx scripts/ingest-dsp-masters.ts --apply  # bulk upload + link wav_url
# optional: --force to re-upload
```

Does **not** re-run Sonic DNA — reuses vault/DB DNA and only checks WAV header duration against the studio track.

Sources (priority): `SERGIK ALBUM RELEASE MASTERS` → `Exports SERGIK` → `Distrokid downloads`.

### ISRC
- `POST /api/studio/isrc/assign` - Assign ISRC to track

### SoundExchange
- `POST /api/studio/soundexchange/submit` - Submit single ISRC to SoundExchange
- `POST /api/studio/soundexchange/batch-submit` - Batch submit multiple ISRCs
- `GET /api/studio/soundexchange/lookup?isrc=...` - Lookup ISRC in SoundExchange database
- `GET /api/studio/soundexchange/submissions` - Get submission history

### Uploads
- `POST /api/studio/upload/wav` - Upload WAV file
- `POST /api/studio/upload/artwork` - Upload artwork

## Keyboard Shortcuts

- `Cmd+K` (Mac) / `Ctrl+K` (Windows) - Open Command Palette
- `Cmd+Shift+F` - Open Global Search
- `Esc` - Close modals/palettes

## Features

### Enhanced Admin Dashboard
- **Quick Actions** - Context-aware actions based on pending tasks
- **Health Status** - Database, Storage, APIs connectivity
- **Pending Tasks** - Alerts for tracks needing analysis, releases pending distribution
- **Recent Activity** - Last 10 admin actions
- **Command Palette** - Quick navigation and actions

### Studio Dashboard
- Distribution pipeline overview
- Quick stats (tracks, releases, pending distributions)
- Recent distribution activity

### Workflow Enhancements
- **Bulk Operations** - Select multiple items for batch actions
- **Auto-save** - Forms save drafts automatically
- **Global Search** - Search across tracks, releases, users
- **Notifications** - Toast notifications for success/error/warning

## Troubleshooting

### ISRC Assignment Fails
- Prefix defaults to `QTA53`; override with `ISRC_PREFIX` only if a new prefix is allocated
- Verify database schema is applied (check `isrc_counters` table exists)
- Check `assign_isrc` function exists in Supabase

### Distribution Fails
- Ensure all tracks have ISRCs assigned
- Verify release has at least one track
- Check distributor API credentials are configured
- Review release metadata is complete

### Upload Fails
- Check Supabase Storage buckets exist:
  - `audio-files` (for WAV files)
  - `gallery-images` (for artwork)
- Verify storage permissions are set correctly

## SoundExchange / US ISRC registry

Pipeline → **ISRCs** (`/studio/pipeline?tab=isrcs`) is the local-first registry for minted codes.

### What it does
1. **Lookup** — resolves an ISRC against `distribution_tracks` (works without API keys)
2. **Register selected** — writes `soundexchange_submissions` so Studio/Launch can see SX progress
3. **Export CSV** — USISRC locker format for upload at [isrc.soundexchange.com](https://isrc.soundexchange.com/)
4. **Mark accepted** — after the agency confirms the codes

### Daily flow
1. Mint ISRCs on a release (Assign ISRC) or Create → Track
2. Open Pipeline → ISRCs → select pending → **Register selected**
3. **Export pending CSV** → upload in the USISRC / SoundExchange locker
4. **Mark accepted** when confirmed

### Optional remote API
Local registry mode is production-ready for SERGIK ops. If SoundExchange issues API credentials later, set:

```bash
SOUNDEXCHANGE_API_KEY=your_api_key
SOUNDEXCHANGE_ACCOUNT_ID=your_account_id
# optional
SOUNDEXCHANGE_BASE_URL=https://api.soundexchange.com
```

Registrant: **Jordan Caboga** · SoundExchange ID **2181363681** · Prefix **QTA53** · Recording artist **SERGIK**

| Role | SXID | Membership | Mandate | Territories | Status |
| --- | --- | --- | --- | --- | --- |
| Performer | SX1102Q6ZH | 2026-09-16 | 2026-09-16 | Worldwide | Active |
| Rights Owner | SX1102Q6ZJ | 2026-09-16 | 2026-09-16 | Worldwide | Active |

Primary contact: sergikdrops@gmail.com

