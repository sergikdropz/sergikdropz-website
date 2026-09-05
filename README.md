# SERGIK - Music Artist Platform

A comprehensive web and mobile platform for SERGIK, a music artist and DJ software developer. Built with Next.js 14, TypeScript, Supabase, and advanced audio analysis capabilities including AI-powered Sonic DNA generation.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [Documentation](#documentation)
4. [Architecture Overview](#architecture-overview)
5. [Complete File Index](#complete-file-index)
6. [Core Systems](#core-systems)
7. [API Reference](#api-reference)
8. [Data Models](#data-models)
9. [Component Library](#component-library)
10. [Utility Functions](#utility-functions)
11. [Scripts Reference](#scripts-reference)
12. [Environment Setup](#environment-setup)
13. [Development Workflow](#development-workflow)
14. [Deployment](#deployment)

---

## Project Overview

### Purpose
Electronic Press Kit (EPK) and fan engagement platform featuring:
- **Music Library**: Advanced audio player with waveform visualization, BPM analysis, and AI-powered metadata
- **Sonic DNA System**: Multi-agent AI system for comprehensive music analysis
- **DJ Tools**: Mixer mode, crossfading, beat matching, Camelot wheel
- **Admin Dashboard**: Content management, analytics, fan nurturing
- **Studio**: Release management, distribution, ISRC assignment
- **E-commerce**: Purchasable tracks with Stripe integration

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Framework | Next.js | 14.2.0 | React framework with App Router |
| Language | TypeScript | 5.x | Type-safe development |
| Styling | Tailwind CSS | 3.3.0 | Utility-first CSS |
| Database | Supabase | 2.90.1 | PostgreSQL + Auth + Storage + Realtime |
| State | @tanstack/react-query | 5.90.20 | Server state management |
| State | SWR | 2.3.8 | Data fetching hooks |
| Audio | wavesurfer.js | 7.12.1 | Waveform visualization |
| Audio | peaks.js | 4.0.0 | Audio peaks analysis |
| Audio | tone.js | 15.1.22 | Web Audio API wrapper |
| Audio | realtime-bpm-analyzer | 5.0.0 | BPM detection |
| Animation | framer-motion | 10.16.16 | React animations |
| Payments | Stripe | 14.25.0 | Payment processing |
| Charts | Recharts | 3.6.0 | Data visualization |
| AI | Anthropic SDK | 0.72.1 | Claude AI integration |
| Email | Resend | 3.2.0 | Transactional emails |

---

## Quick Start

```bash
# Clone and enter project
git clone [repository-url]
cd "SERGIK Web and app"

# Install web dependencies
cd web && npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your keys (see Environment Setup section)

# Start development server
npm run dev
# Opens at http://localhost:3001
```

---

## Documentation

Project docs are organized under `docs/` (root) and `web/docs/` (web app).

### Core project docs
- `docs/project/QUICKSTART.md`
- `docs/project/DEV_ENTRY.md`
- `docs/project/README_ETL.md`
- `docs/project/READY_TO_USE.md`
- `web/CONTRIBUTING.md` — Playwright setup, E2E secrets, site knowledge snapshot, pre-merge commands
- `knowledge/SITE_INDEX.md` — site architecture index and links to generated route inventory (`knowledge/generated/site-knowledge.json`)

### Deployment & environment
- `docs/deployment/DEPLOYMENT_GUIDE.md`
- `docs/deployment/DOMAIN_UPDATE_GUIDE.md`
- `web/docs/environment/ENV_VARIABLES.md`
- `web/docs/deployment/VERCEL_ENV_SETUP.md`

### Supabase & database
- `docs/database/SUPABASE_INTEGRATION_SUMMARY.md`
- `web/docs/database/SUPABASE_SETUP_GUIDE.md`
- `web/docs/database/SUPABASE_QUICKSTART.md`

### Media & gallery
- `docs/gallery/ADD_IMAGES_GUIDE.md`
- `docs/gallery/GALLERY_UPDATE_STATUS.md`
- `web/docs/media/ADD_VIDEOS_GUIDE.md`

### Instagram integration
- `web/docs/instagram/INSTAGRAM_SETUP_GUIDE.md`
- `web/docs/instagram/INSTAGRAM_AUTO_FETCH_SETUP.md`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  Next.js App Router    │   React Components    │   Contexts          │
│  - /app (pages)        │   - MusicPlayer       │   - AuthContext     │
│  - /app/api (routes)   │   - SonicDNA          │   - MusicPlayerCtx  │
│  - /app/admin          │   - DJMixerMode       │   - NotificationCtx │
│  - /app/studio         │   - FolderTree        │                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│  API Routes (/app/api)          │   Utilities (/utils)              │
│  - /audio/* (analysis)          │   - musicLibraryApi.ts            │
│  - /music-library/* (CRUD)      │   - sonicDNAAgents/*              │
│  - /admin/* (management)        │   - audioAnalysis.ts              │
│  - /nurturing/* (campaigns)     │   - comprehensiveMusicAnalysis.ts │
│  - /studio/* (releases)         │   - genreAnalyzer.ts              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Supabase                       │   Local JSON Data                 │
│  - PostgreSQL (tracks, users)   │   - /web/data/artist.json         │
│  - Storage (audio, images)      │   - /web/data/releases.json       │
│  - Auth (sessions, roles)       │   - /web/data/events.json         │
│  - Realtime (live updates)      │   - /web/data/gallery.json        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Complete File Index

### Root Directory Structure

```
SERGIK Web and app/
├── web/                    # [PRIMARY] Next.js web application
├── mobile/                 # React Native mobile app (Expo)
├── data/                   # Shared data schemas and templates
├── docs/                   # Root-level project documentation
├── kb/                     # Knowledge base documentation
├── scripts/                # Project-wide utility scripts
├── analysis/               # Code analysis reports
├── codex-chat-import/      # Chat history imports
├── cursor-chat-export/     # Cursor session exports
├── vscode-chat-import/     # VSCode chat imports
├── AGENTS.md               # AI agent instructions
├── README.md               # This file
├── docker-compose.yml      # Docker configuration
├── Makefile                # Build automation
├── package.json            # Root package config
├── requirements.txt        # Python dependencies
└── vercel.json             # Vercel deployment config
```

---

### Web Application (`/web`)

#### Entry Points & Configuration

| File | Purpose | Key Exports/Functions |
|------|---------|----------------------|
| `web/app/layout.tsx` | Root layout wrapper | `<html>`, `<body>`, providers |
| `web/app/page.tsx` | Homepage | Hero section, featured content |
| `web/app/globals.css` | Global styles | Tailwind imports, custom CSS |
| `web/app/error.tsx` | Error boundary | Error UI component |
| `web/app/not-found.tsx` | 404 page | Not found UI |
| `web/app/loading.tsx` | Loading state | Loading spinner/skeleton |
| `web/middleware.ts` | Request middleware | Auth checks, redirects |
| `web/tailwind.config.js` | Tailwind config | Theme, plugins, content paths |
| `web/package.json` | Dependencies | All npm packages |

---

#### Pages (`/web/app`)

##### Public Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `page.tsx` | Homepage with hero, featured tracks |
| `/about` | `about/page.tsx` | Artist biography and influences |
| `/music` | `music/page.tsx` | Public music catalog |
| `/music-library` | `music-library/page.tsx` | Full music library browser |
| `/gallery` | `gallery/page.tsx` | Image gallery with filters |
| `/performances` | `performances/page.tsx` | Event history, festivals |
| `/videos` | `videos/page.tsx` | Video content gallery |
| `/epk` | `epk/page.tsx` | Electronic Press Kit |
| `/contact` | `contact/page.tsx` | Contact form |
| `/book` | `book/page.tsx` | Booking request form |
| `/follow` | `follow/page.tsx` | Social media links |
| `/notes` | `notes/page.tsx` | Artist notes/blog |
| `/debug` | `debug/page.tsx` | Debug information (dev only) |
| `/instagram-helper` | `instagram-helper/page.tsx` | Instagram integration helper |

##### Admin Pages (`/web/app/admin`)

| Route | File | Description |
|-------|------|-------------|
| `/admin` | `page.tsx` | Admin dashboard home |
| `/admin/layout.tsx` | `layout.tsx` | Admin layout with nav |
| `/admin/music` | `music/page.tsx` | Music management |
| `/admin/music-library` | `music-library/page.tsx` | Full library admin |
| `/admin/sonic-dna` | `sonic-dna/page.tsx` | Sonic DNA management |
| `/admin/releases` | `releases/page.tsx` | Release management |
| `/admin/gallery` | `gallery/page.tsx` | Image management |
| `/admin/videos` | `videos/page.tsx` | Video management |
| `/admin/videos-manager` | `videos-manager/page.tsx` | Advanced video tools |
| `/admin/events` | `events/page.tsx` | Event management |
| `/admin/artist` | `artist/page.tsx` | Artist profile editing |
| `/admin/content` | `content/page.tsx` | Content management |
| `/admin/users` | `users/page.tsx` | User management |
| `/admin/settings` | `settings/page.tsx` | App settings |
| `/admin/analytics` | `analytics/page.tsx` | Analytics dashboard |
| `/admin/logs` | `logs/page.tsx` | System logs |
| `/admin/instagram` | `instagram/page.tsx` | Instagram integration |
| `/admin/purchases` | `purchases/page.tsx` | Purchase history |
| `/admin/purchasable-tracks` | `purchasable-tracks/page.tsx` | Track pricing |

##### Admin Auth Pages (`/web/app/admin/(auth)`)

| Route | File | Description |
|-------|------|-------------|
| `/admin/login` | `login/page.tsx` | Admin login form |
| `/admin/setup` | `setup/page.tsx` | Initial setup wizard |

##### Fan Nurturing Pages (`/web/app/admin/nurturing`)

| Route | File | Description |
|-------|------|-------------|
| `/admin/nurturing` | `page.tsx` | Nurturing dashboard |
| `/admin/nurturing/fans` | `fans/page.tsx` | Fan database |
| `/admin/nurturing/segments` | `segments/page.tsx` | Audience segments |
| `/admin/nurturing/campaigns` | `campaigns/page.tsx` | Email campaigns |
| `/admin/nurturing/campaigns/[id]` | `campaigns/[id]/page.tsx` | Campaign editor |
| `/admin/nurturing/templates` | `templates/page.tsx` | Email templates |
| `/admin/nurturing/smart-links` | `smart-links/page.tsx` | Tracking links |
| `/admin/nurturing/analytics` | `analytics/page.tsx` | Campaign analytics |

##### Studio Pages (`/web/app/studio`)

| Route | File | Description |
|-------|------|-------------|
| `/studio` | `page.tsx` | Studio dashboard |
| `/studio/layout.tsx` | `layout.tsx` | Studio layout |
| `/studio/releases` | `releases/page.tsx` | Release list |
| `/studio/releases/new` | `releases/new/page.tsx` | Create release |
| `/studio/releases/[id]` | `releases/[id]/page.tsx` | Edit release |
| `/studio/tracks/new` | `tracks/new/page.tsx` | Upload track |
| `/studio/soundexchange` | `soundexchange/page.tsx` | SoundExchange integration |

---

#### API Routes (`/web/app/api`)

##### Audio APIs (`/api/audio`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/audio/upload` | POST | `upload/route.ts` | Upload audio file |
| `/api/audio/upload-with-pipeline` | POST | `upload-with-pipeline/route.ts` | Upload with full processing |
| `/api/audio/bpm` | POST | `bpm/route.ts` | Analyze BPM |
| `/api/audio/waveform` | POST | `waveform/route.ts` | Generate waveform |
| `/api/audio/artwork` | POST | `artwork/route.ts` | Fetch/set artwork |
| `/api/audio/list` | GET | `list/route.ts` | List audio files |
| `/api/audio/resolve` | GET | `resolve/route.ts` | Resolve audio URL |
| `/api/audio/replace` | POST | `replace/route.ts` | Replace audio file |
| `/api/audio/reprocess-track` | POST | `reprocess-track/route.ts` | Reprocess track analysis |
| `/api/audio/sonic-dna` | GET/POST | `sonic-dna/route.ts` | Get/generate Sonic DNA |
| `/api/audio/sonic-dna-agents` | POST | `sonic-dna-agents/route.ts` | Multi-agent DNA analysis |
| `/api/audio/analyze-all-sonic-dna` | POST | `analyze-all-sonic-dna/route.ts` | Batch DNA analysis |
| `/api/audio/regenerate-all-sonic-dna` | POST | `regenerate-all-sonic-dna/route.ts` | Regenerate all DNA |
| `/api/audio/regenerate-all-sonic-dna-agents` | POST | `regenerate-all-sonic-dna-agents/route.ts` | Batch agent analysis |
| `/api/audio/update-all-enhanced` | POST | `update-all-enhanced/route.ts` | Enhanced batch update |
| `/api/audio/update-bpm` | POST | `update-bpm/route.ts` | Update BPM value |
| `/api/audio/agent-status` | GET | `agent-status/route.ts` | Agent processing status |
| `/api/audio/artifacts` | GET | `artifacts/route.ts` | Analysis artifacts |

##### Music Library APIs (`/api/music-library`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/music-library/tracks` | GET/POST/PATCH/DELETE | `tracks/route.ts` | Track CRUD operations |
| `/api/music-library/tracks-optimized` | GET | `tracks-optimized/route.ts` | Optimized track fetch |
| `/api/music-library/folders` | GET/POST | `folders/route.ts` | Folder management |
| `/api/music-library/folders/move` | POST | `folders/move/route.ts` | Move tracks between folders |
| `/api/music-library/playlists` | GET/POST | `playlists/route.ts` | Playlist management |
| `/api/music-library/stats` | GET | `stats/route.ts` | Library statistics |
| `/api/music-library/sync` | POST | `sync/route.ts` | Sync with Supabase |
| `/api/music-library/sync-all-data` | POST | `sync-all-data/route.ts` | Full data sync |
| `/api/music-library/sync-sonic-dna` | POST | `sync-sonic-dna/route.ts` | Sync Sonic DNA |
| `/api/music-library/snapshots` | GET/POST | `snapshots/route.ts` | Create/list snapshots |
| `/api/music-library/restore-snapshot` | POST | `restore-snapshot/route.ts` | Restore from snapshot |
| `/api/music-library/recover` | POST | `recover/route.ts` | Recover deleted tracks |
| `/api/music-library/organize` | POST | `organize/route.ts` | Auto-organize library |
| `/api/music-library/link-tracks` | POST | `link-tracks/route.ts` | Link track metadata |
| `/api/music-library/build-sonic-dna-cache` | POST | `build-sonic-dna-cache/route.ts` | Build DNA cache |

##### Admin APIs (`/api/admin`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/admin/stats` | GET | `stats/route.ts` | Dashboard statistics |
| `/api/admin/sync-all-stats` | POST | `sync-all-stats/route.ts` | Sync all stats |
| `/api/admin/sync-production` | POST | `sync-production/route.ts` | Sync to production |
| `/api/admin/recent-activity` | GET | `recent-activity/route.ts` | Recent activity feed |
| `/api/admin/pending-tasks` | GET | `pending-tasks/route.ts` | Pending tasks list |
| `/api/admin/search` | GET | `search/route.ts` | Global search |
| `/api/admin/logs` | GET | `logs/route.ts` | System logs |
| `/api/admin/health` | GET | `health/route.ts` | Health check |
| `/api/admin/artist` | GET/PUT | `artist/route.ts` | Artist profile |
| `/api/admin/events` | GET/POST | `events/route.ts` | Events CRUD |
| `/api/admin/events/[id]` | GET/PUT/DELETE | `events/[id]/route.ts` | Single event |
| `/api/admin/venues` | GET/POST | `venues/route.ts` | Venues CRUD |
| `/api/admin/venues/[id]` | GET/PUT/DELETE | `venues/[id]/route.ts` | Single venue |
| `/api/admin/releases` | GET/POST | `releases/route.ts` | Releases CRUD |
| `/api/admin/releases/[id]` | GET/PUT/DELETE | `releases/[id]/route.ts` | Single release |
| `/api/admin/releases/[id]/sync-spotify` | POST | `releases/[id]/sync-spotify/route.ts` | Sync with Spotify |
| `/api/admin/videos` | GET/POST | `videos/route.ts` | Videos CRUD |
| `/api/admin/videos/[id]` | GET/PUT/DELETE | `videos/[id]/route.ts` | Single video |
| `/api/admin/users` | GET/POST | `users/route.ts` | Users CRUD |
| `/api/admin/users/[id]` | GET/PUT/DELETE | `users/[id]/route.ts` | Single user |
| `/api/admin/settings` | GET/PUT | `settings/route.ts` | App settings |
| `/api/admin/settings/[key]` | GET/PUT | `settings/[key]/route.ts` | Single setting |
| `/api/admin/settings/status` | GET | `settings/status/route.ts` | Settings status |
| `/api/admin/purchasable-tracks` | GET/POST | `purchasable-tracks/route.ts` | Purchasable tracks |
| `/api/admin/purchasable-tracks/[id]` | GET/PUT/DELETE | `purchasable-tracks/[id]/route.ts` | Single purchasable track |
| `/api/admin/purchases` | GET | `purchases/route.ts` | Purchase list |
| `/api/admin/purchases/stats` | GET | `purchases/stats/route.ts` | Purchase stats |
| `/api/admin/sonic-dna/[id]` | GET/PUT/DELETE | `sonic-dna/[id]/route.ts` | Single Sonic DNA |
| `/api/admin/sonic-dna/export-pdf` | POST | `export-pdf/route.ts` | Export DNA as PDF |

##### Admin Setup APIs (`/api/admin/setup`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/admin/setup/check-supabase` | GET | `check-supabase/route.ts` | Verify Supabase connection |
| `/api/admin/setup/create-admin` | POST | `create-admin/route.ts` | Create admin user |
| `/api/admin/setup/setup-database` | POST | `setup-database/route.ts` | Initialize database |

##### Auth APIs (`/api/auth`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | `login/route.ts` | User login |
| `/api/auth/logout` | POST | `logout/route.ts` | User logout |
| `/api/auth/session` | GET | `session/route.ts` | Get session |
| `/api/auth/auto-login` | POST | `auto-login/route.ts` | Auto-login (dev) |

##### Nurturing APIs (`/api/nurturing`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/nurturing/fans` | GET/POST | `fans/route.ts` | Fan list |
| `/api/nurturing/fans/[id]` | GET/PUT/DELETE | `fans/[id]/route.ts` | Single fan |
| `/api/nurturing/segments` | GET/POST | `segments/route.ts` | Segments |
| `/api/nurturing/segments/[id]` | GET/PUT/DELETE | `segments/[id]/route.ts` | Single segment |
| `/api/nurturing/campaigns` | GET/POST | `campaigns/route.ts` | Campaigns |
| `/api/nurturing/campaigns/[id]` | GET/PUT/DELETE | `campaigns/[id]/route.ts` | Single campaign |
| `/api/nurturing/campaign-templates` | GET/POST | `campaign-templates/route.ts` | Templates |
| `/api/nurturing/campaign-templates/[id]` | GET/PUT/DELETE | `campaign-templates/[id]/route.ts` | Single template |
| `/api/nurturing/smart-links` | GET/POST | `smart-links/route.ts` | Smart links |
| `/api/nurturing/smart-links/[id]` | GET/PUT/DELETE | `smart-links/[id]/route.ts` | Single smart link |
| `/api/nurturing/sequences` | GET/POST | `sequences/route.ts` | Email sequences |
| `/api/nurturing/analytics` | GET | `analytics/route.ts` | Nurturing analytics |

##### Studio APIs (`/api/studio`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/studio/releases` | GET/POST | `releases/route.ts` | Releases |
| `/api/studio/releases/public` | GET | `releases/public/route.ts` | Public releases |
| `/api/studio/releases/[id]` | GET/PUT/DELETE | `releases/[id]/route.ts` | Single release |
| `/api/studio/releases/[id]/distribute` | POST | `releases/[id]/distribute/route.ts` | Distribute release |
| `/api/studio/releases/[id]/status` | GET | `releases/[id]/status/route.ts` | Distribution status |
| `/api/studio/tracks` | GET/POST | `tracks/route.ts` | Studio tracks |
| `/api/studio/tracks/[id]` | GET/PUT/DELETE | `tracks/[id]/route.ts` | Single track |
| `/api/studio/upload/wav` | POST | `upload/wav/route.ts` | Upload WAV |
| `/api/studio/upload/artwork` | POST | `upload/artwork/route.ts` | Upload artwork |
| `/api/studio/isrc/assign` | POST | `isrc/assign/route.ts` | Assign ISRC |
| `/api/studio/soundexchange/submit` | POST | `soundexchange/submit/route.ts` | Submit to SoundExchange |
| `/api/studio/soundexchange/batch-submit` | POST | `soundexchange/batch-submit/route.ts` | Batch submit |
| `/api/studio/soundexchange/lookup` | GET | `soundexchange/lookup/route.ts` | Lookup track |
| `/api/studio/soundexchange/submissions` | GET | `soundexchange/submissions/route.ts` | Submission history |

##### Gallery APIs (`/api/gallery`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/gallery/list` | GET | `list/route.ts` | List images |
| `/api/gallery/[filename]` | GET | `[filename]/route.ts` | Get image |
| `/api/gallery/upload` | POST | `upload/route.ts` | Upload to local |
| `/api/gallery/upload-supabase` | POST | `upload-supabase/route.ts` | Upload to Supabase |
| `/api/gallery/supabase-list` | GET | `supabase-list/route.ts` | List from Supabase |
| `/api/gallery/db` | GET/POST | `db/route.ts` | Gallery DB operations |

##### Instagram APIs (`/api/instagram`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/instagram/posts` | GET | `posts/route.ts` | Get posts |
| `/api/instagram/media` | GET | `media/route.ts` | Get media |
| `/api/instagram/callback` | GET | `callback/route.ts` | OAuth callback |
| `/api/instagram/refresh` | POST | `refresh/route.ts` | Refresh token |
| `/api/instagram/cron` | GET | `cron/route.ts` | Cron refresh |
| `/api/instagram/scrape` | POST | `scrape/route.ts` | Scrape posts |
| `/api/instagram/save-posts` | POST | `save-posts/route.ts` | Save posts |
| `/api/instagram/process-posts` | POST | `process-posts/route.ts` | Process posts |
| `/api/instagram/proxy-image` | GET | `proxy-image/route.ts` | Proxy image |

##### Analytics APIs (`/api/analytics`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/analytics/track` | POST | `track/route.ts` | Track event |
| `/api/analytics/events` | GET | `events/route.ts` | Get events |
| `/api/analytics/stats` | GET | `stats/route.ts` | Get statistics |

##### Payment APIs (`/api/stripe`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/stripe/create-checkout` | POST | `create-checkout/route.ts` | Create Stripe checkout |
| `/api/stripe/webhook` | POST | `webhook/route.ts` | Stripe webhook handler |
| `/api/purchases/verify` | POST | `purchases/verify/route.ts` | Verify purchase |

##### Other APIs

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | `health/route.ts` | Health check |
| `/api/download` | GET | `download/route.ts` | File download |
| `/api/epk-download` | GET | `epk-download/route.ts` | EPK download |
| `/api/go/[slug]` | GET | `go/[slug]/route.ts` | URL shortener |
| `/api/devtools` | GET | `devtools/route.ts` | Dev tools info |
| `/api/scan-library` | POST | `scan-library/route.ts` | Scan music library |
| `/api/spotify-search` | GET | `spotify-search/route.ts` | Search Spotify |
| `/api/spotify-artwork` | GET | `spotify-artwork/route.ts` | Get Spotify artwork |
| `/api/spotify-discography` | GET | `spotify-discography/route.ts` | Get discography |
| `/api/youtube-videos` | GET | `youtube-videos/route.ts` | Get YouTube videos |
| `/api/supabase-check` | GET | `supabase-check/route.ts` | Check Supabase |
| `/api/videos/upload` | POST | `videos/upload/route.ts` | Upload video |

##### Cron APIs (`/api/cron`)

| Endpoint | Method | File | Description |
|----------|--------|------|-------------|
| `/api/cron/campaigns-scheduler` | GET | `campaigns-scheduler/route.ts` | Schedule campaigns |
| `/api/cron/campaigns-sender` | GET | `campaigns-sender/route.ts` | Send scheduled |

---

#### Components (`/web/components`)

##### Core Components

| Component | File | Purpose | Key Props |
|-----------|------|---------|-----------|
| `MusicPlayer` | `MusicPlayer.tsx` | Main audio player (4800+ lines) | `tracks`, `initialTrack`, `onTrackChange` |
| `GlobalMusicPlayer` | `GlobalMusicPlayer.tsx` | Global player wrapper | Wraps MusicPlayer |
| `DJMixerMode` | `DJMixerMode.tsx` | DJ mixing interface | `tracks`, `onMix` |
| `SonicDNA` | `SonicDNA.tsx` | DNA visualization | `trackId`, `dna` |
| `FolderTree` | `FolderTree.tsx` | Folder browser | `folders`, `onSelect` |
| `VirtualizedTrackList` | `VirtualizedTrackList.tsx` | Performance track list | `tracks`, `height` |
| `PlaylistManager` | `PlaylistManager.tsx` | Playlist UI | `playlists`, `onUpdate` |

##### Layout Components

| Component | File | Purpose |
|-----------|------|---------|
| `Header` | `Header.tsx` | Site header/nav |
| `Footer` | `Footer.tsx` | Site footer |
| `ConditionalHeader` | `ConditionalHeader.tsx` | Conditionally render header |
| `ConditionalFooter` | `ConditionalFooter.tsx` | Conditionally render footer |
| `NavigationButtons` | `NavigationButtons.tsx` | Nav button group |
| `ConditionalNavigationButtons` | `ConditionalNavigationButtons.tsx` | Conditional nav |
| `AdminNav` | `AdminNav.tsx` | Admin navigation |
| `AdminLayoutClient` | `AdminLayoutClient.tsx` | Admin layout wrapper |

##### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `HeroImage` | `HeroImage.tsx` | Hero section with image |
| `ImageGallery` | `ImageGallery.tsx` | Gallery grid |
| `BackgroundImages` | `BackgroundImages.tsx` | Background image handler |
| `ContactForm` | `ContactForm.tsx` | Contact form |
| `SocialLinks` | `SocialLinks.tsx` | Social media links |
| `NotificationToast` | `NotificationToast.tsx` | Toast notifications |
| `ErrorHandler` | `ErrorHandler.tsx` | Error display |
| `CommandPalette` | `CommandPalette.tsx` | Cmd+K palette |
| `GlobalSearch` | `GlobalSearch.tsx` | Global search UI |

##### Media Components

| Component | File | Purpose |
|-----------|------|---------|
| `AudioPlayer` | `AudioPlayer.tsx` | Simple audio player |
| `VideoCard` | `VideoCard.tsx` | Video thumbnail card |
| `ReleaseCard` | `ReleaseCard.tsx` | Release display card |
| `VenueCard` | `VenueCard.tsx` | Venue display card |
| `PurchasableTrack` | `PurchasableTrack.tsx` | Track for purchase |
| `UnreleasedMusicSection` | `UnreleasedMusicSection.tsx` | Unreleased tracks |

##### Audio Components

| Component | File | Purpose |
|-----------|------|---------|
| `ThreeBandEQ` | `ThreeBandEQ.tsx` | 3-band equalizer |
| `ExpandedPlayerControls` | `ExpandedPlayerControls.tsx` | Extended player controls |
| `BulkOperationsPanel` | `BulkOperationsPanel.tsx` | Bulk track operations |

##### Music Subcomponents (`/web/components/music`)

| Component | File | Purpose |
|-----------|------|---------|
| `CamelotWheel` | `CamelotWheel.tsx` | Camelot wheel visualization |
| `MusicBadges` | `MusicBadges.tsx` | Genre/mood badges |
| `ProductionStats` | `ProductionStats.tsx` | Production statistics |
| `index.ts` | `index.ts` | Barrel export |

##### Integration Components

| Component | File | Purpose |
|-----------|------|---------|
| `SpotifyArtwork` | `SpotifyArtwork.tsx` | Spotify album art |
| `SoundCloudEmbed` | `SoundCloudEmbed.tsx` | SoundCloud embed |
| `SoundCloudPlayer` | `SoundCloudPlayer.tsx` | SoundCloud player |
| `InstagramEmbed` | `InstagramEmbed.tsx` | Instagram embed |
| `InstagramPost` | `InstagramPost.tsx` | Single IG post |
| `InstagramPostGrid` | `InstagramPostGrid.tsx` | IG post grid |
| `InstagramMediaGrid` | `InstagramMediaGrid.tsx` | IG media grid |
| `InstagramMediaModal` | `InstagramMediaModal.tsx` | IG media modal |

##### Provider Components

| Component | File | Purpose |
|-----------|------|---------|
| `Providers` | `Providers.tsx` | All providers wrapper |
| `AnalyticsProvider` | `AnalyticsProvider.tsx` | Analytics context |
| `ServiceWorkerRegistration` | `ServiceWorkerRegistration.tsx` | SW registration |
| `PageLogger` | `PageLogger.tsx` | Page view logging |

##### Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| `admin-nav-items.ts` | `admin-nav-items.ts` | Admin nav config |
| `SequenceBuilder` | `SequenceBuilder.tsx` | Email sequence builder |
| `CampaignAnalyticsChart` | `CampaignAnalyticsChart.tsx` | Campaign charts |

---

#### Contexts (`/web/contexts`)

| Context | File | Purpose | Exports |
|---------|------|---------|---------|
| `AuthContext` | `AuthContext.tsx` | Authentication state | `useAuth`, `AuthProvider` |
| `MusicPlayerContext` | `MusicPlayerContext.tsx` | Global player state | `useMusicPlayer`, `MusicPlayerProvider` |
| `NotificationContext` | `NotificationContext.tsx` | Notifications | `useNotification`, `NotificationProvider` |

---

#### Utilities (`/web/utils`)

##### Core Utilities

| Utility | File | Purpose | Key Exports |
|---------|------|---------|-------------|
| `musicLibraryApi` | `musicLibraryApi.ts` | Music library API client | `fetchTracks`, `updateTrack`, `deleteTrack` |
| `audioAnalysis` | `audioAnalysis.ts` | Audio analysis functions | `analyzeAudio`, `detectBPM` |
| `comprehensiveMusicAnalysis` | `comprehensiveMusicAnalysis.ts` | Full track analysis | `analyzeTrackComprehensively` |
| `sonicDNAAnalysis` | `sonicDNAAnalysis.ts` | DNA analysis | `generateSonicDNA` |
| `enhancedSonicDNAAnalysis` | `enhancedSonicDNAAnalysis.ts` | Enhanced DNA | `generateEnhancedDNA` |
| `genreAnalyzer` | `genreAnalyzer.ts` | Genre detection | `analyzeGenre`, `classifyGenre` |
| `extendedSubgenreClassifier` | `extendedSubgenreClassifier.ts` | Subgenre classification | `classifySubgenre` |
| `advancedDrumAnalyzer` | `advancedDrumAnalyzer.ts` | Drum pattern analysis | `analyzeDrumPattern` |

##### Processing Utilities

| Utility | File | Purpose |
|---------|------|---------|
| `generateWaveformFromBuffer` | `generateWaveformFromBuffer.ts` | Waveform generation |
| `extractMetadataFromBuffer` | `extractMetadataFromBuffer.ts` | Metadata extraction |
| `processUploadAutomatically` | `processUploadAutomatically.ts` | Auto-process uploads |
| `processUploadOptimized` | `processUploadOptimized.ts` | Optimized processing |
| `trackUploadPipeline` | `trackUploadPipeline.ts` | Full upload pipeline |

##### Data Utilities

| Utility | File | Purpose |
|---------|------|---------|
| `mapDatabaseToTrack` | `mapDatabaseToTrack.ts` | DB to Track mapping |
| `mergeSonicDNA` | `mergeSonicDNA.ts` | Merge DNA data |
| `mergeSonicDNAIntoMetadata` | `mergeSonicDNAIntoMetadata.ts` | Merge DNA to metadata |
| `deduplicateTracks` | `deduplicateTracks.ts` | Remove duplicate tracks |
| `buildFolderHierarchy` | `buildFolderHierarchy.ts` | Build folder tree |
| `trackIndexUtils` | `trackIndexUtils.ts` | Track indexing |

##### Cache & Performance

| Utility | File | Purpose |
|---------|------|---------|
| `audioCache` | `audioCache.ts` | Audio file caching |
| `sonicDNACache` | `sonicDNACache.ts` | DNA caching |
| `analysisArtifacts` | `analysisArtifacts.ts` | Analysis result cache |
| `performance` | `performance.ts` | Performance monitoring |
| `agentPerformanceMonitor` | `agentPerformanceMonitor.ts` | Agent performance |

##### URL/Image Utilities

| Utility | File | Purpose |
|---------|------|---------|
| `resolveAudioUrl` | `resolveAudioUrl.ts` | Resolve audio URLs |
| `resolveImageUrl` | `resolveImageUrl.ts` | Resolve image URLs |
| `extractPathFromSupabaseUrl` | `extractPathFromSupabaseUrl.ts` | Extract Supabase path |
| `fetchSpotifyArtwork` | `fetchSpotifyArtwork.ts` | Fetch Spotify art |
| `imageOptimization` | `imageOptimization.ts` | Image optimization |

##### External APIs

| Utility | File | Purpose |
|---------|------|---------|
| `musicbrainz` | `musicbrainz.ts` | MusicBrainz API client |
| `audioWorkerClient` | `audioWorkerClient.ts` | Web Worker client |
| `serviceWorker` | `serviceWorker.ts` | Service worker utils |

##### Sonic DNA Agents (`/web/utils/sonicDNAAgents`)

| Agent | File | Purpose |
|-------|------|---------|
| `index` | `index.ts` | Barrel export all agents |
| `agentTypes` | `agentTypes.ts` | Type definitions |
| `baseAgent` | `baseAgent.ts` | Base agent class |
| `pipelineOrchestrator` | `pipelineOrchestrator.ts` | Pipeline coordinator |
| `enhancedOrchestrator` | `enhancedOrchestrator.ts` | Enhanced orchestration |
| `musicologist` | `musicologist.ts` | Music theory analysis |
| `genreSpecialist` | `genreSpecialist.ts` | Genre classification |
| `harmonyAnalyst` | `harmonyAnalyst.ts` | Harmony analysis |
| `drumPatternExpert` | `drumPatternExpert.ts` | Drum pattern analysis |
| `emotionalPsychologist` | `emotionalPsychologist.ts` | Emotional analysis |
| `culturalAnalyst` | `culturalAnalyst.ts` | Cultural context |
| `intentionAnalyst` | `intentionAnalyst.ts` | Artist intention |
| `technicalAnalyzer` | `technicalAnalyzer.ts` | Technical analysis |
| `descriptionWriter` | `descriptionWriter.ts` | Generate descriptions |
| `waveformGenerator` | `waveformGenerator.ts` | Waveform generation |

---

#### Types (`/web/types`)

| Type File | File | Purpose |
|-----------|------|---------|
| `sergik-data` | `sergik-data.ts` | All SERGIK data types |

**Key Type Exports:**
- `ArtistProfile` - Artist information
- `CatalogStats` - Catalog statistics
- `MusicalDna` - Musical DNA structure
- `BpmProfile` - BPM analysis data
- `KeyProfile` - Key/Camelot data
- `EnergyProfile` - Energy levels
- `GenreDna` - Genre breakdown
- `CAMELOT_KEYS` - Camelot wheel constants
- `KEY_TRANSITIONS` - Key compatibility
- `DRUM_GENRES` - Drum genre types
- `GM_DRUM_MAP` - General MIDI drum map

---

#### Data Files (`/web/data`)

| File | Purpose | Schema |
|------|---------|--------|
| `artist.json` | Artist profile data | Name, bio, links |
| `releases.json` | Discography | Albums, EPs, singles |
| `events.json` | Performance history | Festivals, shows |
| `venues.json` | Venue information | Names, locations |
| `gallery.json` | Image gallery | Paths, categories |
| `videos.json` | Video content | YouTube, local |
| `unreleased.json` | Unreleased tracks | Preview tracks |
| `purchasable-tracks.json` | Tracks for sale | Prices, files |
| `social-proof.json` | Social proof | Reviews, press |
| `music-library.json` | Full library cache | All track data |
| `instagram-posts.json` | IG posts cache | Post data |
| `soundcloud-playlists.json` | SC playlists | Playlist data |
| `sergik_artist_data.json` | Complete artist data | All artist info |

---

#### Scripts (`/web/scripts`)

##### Database Scripts

| Script | Purpose |
|--------|---------|
| `setup-database.mjs` | Initialize database tables |
| `setup-supabase.mjs` | Configure Supabase |
| `setup-local-database.mjs` | Local DB setup |
| `test-supabase-connection.mjs` | Test DB connection |
| `try-create-tables.mjs` | Create tables |
| `remove-database-duplicates.mjs` | Remove duplicates |
| `cleanup-duplicate-tracks.mjs` | Clean duplicates |
| `cleanup-all-tracks-duplicates.mjs` | Full cleanup |

##### Sync Scripts

| Script | Purpose |
|--------|---------|
| `sync-local-to-supabase.mjs` | Local → Supabase |
| `sync-all-bidirectional.mjs` | Two-way sync |
| `sync-sonic-dna-to-tracks.mjs` | DNA → tracks |
| `sync-all-sonic-dna.mjs` | Sync all DNA |
| `sync-file-dates.mjs` | Sync file dates |
| `import-local-to-supabase.mjs` | Import local data |
| `ftp-scan-to-supabase.mjs` | FTP scan & import |

##### Analysis Scripts

| Script | Purpose |
|--------|---------|
| `generate-sonic-dna-all.mjs` | Generate all DNA |
| `regenerate-comprehensive-sonic-dna.mjs` | Regenerate DNA |
| `enrich-all-sonic-dna.mjs` | Enrich DNA data |
| `run-comprehensive-analysis-all.mjs` | Full analysis |
| `run-agent-pipeline.mjs` | Run agent pipeline |
| `analyze-music-library-complete.mjs` | Analyze library |
| `analyze-sonic-dna-library.mjs` | Analyze DNA library |
| `check-analysis-progress.mjs` | Check progress |

##### Track Management Scripts

| Script | Purpose |
|--------|---------|
| `scan-music-library.mjs` | Scan library |
| `organize-tracks.mjs` | Organize tracks |
| `reorganize-to-itunes-style.mjs` | iTunes-style organize |
| `move-playlists-under-all-tracks.mjs` | Move playlists |
| `link-all-tracks.mjs` | Link track data |
| `link-all-to-music-library.mjs` | Link to library |
| `autofill-track-fields.mjs` | Auto-fill fields |
| `comprehensive-track-enrichment.mjs` | Enrich tracks |
| `sergik-ai-complete-enrichment.mjs` | AI enrichment |

##### Artwork Scripts

| Script | Purpose |
|--------|---------|
| `fetch-album-artwork.js` | Fetch artwork |
| `fetch-all-artwork.mjs` | Fetch all artwork |
| `fetch-spotify-artwork.mjs` | Spotify artwork |
| `get-artwork-from-spotify.mjs` | Get Spotify art |
| `update-spotify-artwork.mjs` | Update artwork |
| `ensure-all-artwork.mjs` | Ensure all have art |
| `upload-ep-artwork-to-supabase.mjs` | Upload EP art |
| `verify-ep-artwork-in-supabase.mjs` | Verify EP art |

##### Instagram Scripts

| Script | Purpose |
|--------|---------|
| `setup-instagram-api.mjs` | Setup IG API |
| `fetch-instagram-posts.mjs` | Fetch posts |
| `save-instagram-posts-basic.mjs` | Save posts |
| `scrape-instagram-posts-to-db.mjs` | Scrape to DB |
| `download-instagram-videos-to-supabase.mjs` | Download videos |
| `verify-instagram-setup.mjs` | Verify setup |
| `test-instagram-api.mjs` | Test API |

##### Migration Scripts

| Script | Purpose |
|--------|---------|
| `migrate-jsonb-to-storage.mjs` | JSONB → Storage |
| `restore-gallery-images.mjs` | Restore images |
| `relink-all-media.mjs` | Relink media |
| `retry-failed-uploads.mjs` | Retry uploads |

---

### Data Schemas (`/data/schema`)

| Schema | File | Purpose |
|--------|------|---------|
| `artists.schema.json` | Artist data validation |
| `campaigns.schema.json` | Campaign validation |
| `faqs.schema.json` | FAQ validation |
| `integrations.schema.json` | Integration config |
| `leaderboard.schema.json` | Leaderboard data |
| `legal.schema.json` | Legal docs |
| `media.schema.json` | Media items |
| `metrics.schema.json` | Metrics data |
| `onboarding.schema.json` | Onboarding flow |
| `pages.schema.json` | Page content |
| `pricing.schema.json` | Pricing tiers |
| `testimonials.schema.json` | Testimonials |
| `users.schema.json` | User data |

---

### Mobile App (`/mobile`)

```
mobile/
├── App.tsx                 # Main app entry
├── app.json               # Expo config
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── babel.config.js        # Babel config
└── src/
    ├── screens/           # Screen components
    │   ├── HomeScreen.tsx
    │   ├── MusicScreen.tsx
    │   ├── GalleryScreen.tsx
    │   ├── EPKScreen.tsx
    │   └── AboutScreen.tsx
    └── data/              # Local data
        ├── artist.json
        ├── releases.json
        └── gallery.json
```

---

## Core Systems

### 1. Music Player System

**Entry Point:** `web/components/MusicPlayer.tsx` (4800+ lines)

**Features:**
- Waveform visualization (wavesurfer.js)
- BPM detection (realtime-bpm-analyzer)
- Queue management
- DJ Mode with crossfading
- Auto-DJ with beat matching
- Keyboard shortcuts
- Mobile responsive

**State Management:**
- 50+ useState hooks
- useRef for audio elements
- useCallback for performance
- Context integration

**Key Functions:**
- `playTrack(track)` - Play specific track
- `togglePlayPause()` - Play/pause toggle
- `handleSeek(time)` - Seek to time
- `addToQueue(track)` - Add to queue
- `crossfadeTo(nextTrack)` - DJ crossfade

### 2. Sonic DNA System

**Architecture:** Multi-agent AI system for music analysis

**Agents (`/web/utils/sonicDNAAgents`):**
1. **Musicologist** - Music theory analysis
2. **GenreSpecialist** - Genre classification
3. **HarmonyAnalyst** - Chord/key analysis
4. **DrumPatternExpert** - Rhythm analysis
5. **EmotionalPsychologist** - Mood/emotion
6. **CulturalAnalyst** - Cultural context
7. **IntentionAnalyst** - Artist intent
8. **TechnicalAnalyzer** - Technical specs
9. **DescriptionWriter** - Generate prose

**Pipeline Flow:**
```
Audio File → Buffer Extraction → Parallel Agent Analysis → 
Orchestrator Merge → DNA Object → Database Storage
```

### 3. Authentication System

**Provider:** Supabase Auth

**Files:**
- `web/contexts/AuthContext.tsx` - Auth state
- `web/app/api/auth/*` - Auth endpoints
- `web/middleware.ts` - Route protection

**Features:**
- Session management
- Role-based access (admin/user)
- Auto-login (dev mode)
- Protected routes

### 4. Fan Nurturing System

**Purpose:** Email marketing and fan engagement

**Components:**
- Fan database management
- Audience segmentation
- Email campaigns
- Smart links with tracking
- Sequence automation
- Analytics dashboard

**Files:**
- `/web/app/admin/nurturing/*` - UI pages
- `/web/app/api/nurturing/*` - API routes
- `/web/components/SequenceBuilder.tsx` - Sequence UI

---

## Data Models

### Track Interface

```typescript
interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  bpm?: number;
  key?: string;
  camelot_key?: string;
  energy?: number;
  genre?: string;
  subgenre?: string;
  mood?: string[];
  tags?: string[];
  audio_url: string;
  artwork_url?: string;
  waveform_data?: number[];
  sonic_dna?: SonicDNA;
  folder_path?: string;
  created_at: string;
  updated_at: string;
}
```

### Sonic DNA Interface

```typescript
interface SonicDNA {
  id: string;
  track_id: string;
  bpm: number;
  key: string;
  camelot_key: string;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  genre_analysis: GenreAnalysis;
  rhythm_analysis: RhythmAnalysis;
  harmony_analysis: HarmonyAnalysis;
  emotional_profile: EmotionalProfile;
  cultural_context: CulturalContext;
  production_notes: string;
  description: string;
  agent_analyses: AgentAnalysis[];
  created_at: string;
  updated_at: string;
}
```

---

## Environment Setup

### Required Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Anthropic AI (for Sonic DNA)
ANTHROPIC_API_KEY=sk-ant-...

# Resend (email)
RESEND_API_KEY=re_...

# Spotify (optional)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Instagram (optional)
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_BUSINESS_ACCOUNT_ID=...

# Development
NODE_ENV=development
```

### Supabase Tables Required

```sql
-- Core tables
CREATE TABLE tracks (...);
CREATE TABLE sonic_dna (...);
CREATE TABLE releases (...);
CREATE TABLE events (...);
CREATE TABLE venues (...);
CREATE TABLE gallery (...);
CREATE TABLE videos (...);

-- Admin tables
CREATE TABLE admin_users (...);
CREATE TABLE admin_settings (...);
CREATE TABLE admin_logs (...);

-- Nurturing tables
CREATE TABLE fans (...);
CREATE TABLE segments (...);
CREATE TABLE campaigns (...);
CREATE TABLE smart_links (...);

-- E-commerce tables
CREATE TABLE purchasable_tracks (...);
CREATE TABLE purchases (...);
```

---

## Development Workflow

### Commands

```bash
# Development
npm run dev           # Start dev server (port 3001)
npm run dev:3000      # Start on port 3000
npm run devtools      # Open React DevTools

# Build
npm run build         # Production build
npm run start         # Start production server
npm run start:3001    # Start on port 3001

# Quality
npm run lint          # Run ESLint
npx tsc --noEmit      # Type check
```

### Git Workflow

```bash
# Feature branch
git checkout -b feature/your-feature
git add .
git commit -m "feat: description"
git push origin feature/your-feature

# Create PR for review
```

---

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

### Environment Variables in Vercel

Set all variables from `.env.local` in Vercel dashboard under Project Settings → Environment Variables.

### Docker

```bash
# Build and run
docker-compose up -d

# Or use the script
./docker-start.sh
```

---

## For AI Developers

### Key Files to Understand First

1. **`AGENTS.md`** - Project context and guidelines
2. **`web/types/sergik-data.ts`** - All TypeScript types
3. **`web/components/MusicPlayer.tsx`** - Main player (complex)
4. **`web/utils/sonicDNAAgents/index.ts`** - Agent system
5. **`web/contexts/MusicPlayerContext.tsx`** - Player state

### Common Tasks

**Add new API endpoint:**
1. Create `web/app/api/your-endpoint/route.ts`
2. Export `GET`, `POST`, `PUT`, `DELETE` as needed
3. Use Supabase client for data

**Add new page:**
1. Create `web/app/your-page/page.tsx`
2. Export default React component
3. Add to navigation if needed

**Add new component:**
1. Create `web/components/YourComponent.tsx`
2. Use TypeScript interfaces
3. Follow existing patterns

**Modify Sonic DNA:**
1. Check `web/utils/sonicDNAAgents/`
2. Agents run in parallel
3. Orchestrator merges results

### Gotchas

- Audio must be user-initiated (no autoplay)
- MusicPlayer.tsx is 4800+ lines - be careful
- Supabase RLS policies affect data access
- Use `@tanstack/react-query` for server state
- Dynamic imports for audio libraries

---

## Contact

**Email:** sergikdrops@gmail.com

---

*Last Updated: January 2026*
