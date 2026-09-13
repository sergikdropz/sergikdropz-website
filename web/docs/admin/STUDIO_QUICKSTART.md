# Studio Distribution Workflow - Quick Start

## Overview

The Studio dashboard provides a complete workflow for music distribution:
1. **Upload Track** → Upload WAV + artwork, add metadata
2. **Assign ISRC** → Generate unique ISRC for each track
3. **Create Release** → Package tracks into a release
4. **Distribute** → Submit to distributor (Revelator) and track status

## Setup

### 1. Database Schema
Run the SQL schema in Supabase:
```sql
-- Execute: web/supabase/studio_schema.sql
```

### 2. Environment Variables
Add to `.env.local`:
```bash
# ISRC Configuration (required)
ISRC_PREFIX=USRC1  # Your 5-character Rights Owner Prefix from US ISRC Agency

# SoundExchange API (optional - for ISRC submission to US ISRC Agency)
SOUNDEXCHANGE_API_KEY=your_api_key
SOUNDEXCHANGE_ACCOUNT_ID=your_account_id
SOUNDEXCHANGE_BASE_URL=https://api.soundexchange.com  # Optional

# Distributor API (optional - for now using mock)
REVELATOR_API_KEY=your_api_key
REVELATOR_API_SECRET=your_api_secret
REVELATOR_BASE_URL=https://api.revelator.com
```

### 3. Get ISRC Prefix
- Apply at: https://isrc.soundexchange.com/
- You'll receive a 5-character prefix (e.g., `USRC1`)
- This allows you to assign up to 100,000 ISRCs per year

## Workflow

### Upload Track
1. Go to `/studio/tracks/new`
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
3. Format: `PREFIX + YY + SERIAL` (e.g., `USRC1250001`)
4. **Submit to SoundExchange** (optional): Click "Submit to SoundExchange" to register ISRC with US ISRC Agency

### Create Release
1. Go to `/studio/releases/new`
2. Fill in release metadata:
   - Title, Type (Single/EP/Album)
   - Release date, Genre, Description
   - Upload artwork
3. Select tracks (only tracks with ISRCs can be selected)
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

### Check Status
- Click "Check Status" to poll distributor
- Store links appear automatically when status becomes `live`
- Links are stored in `distribution_store_links` table

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
- Check `ISRC_PREFIX` is set in environment variables
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

## SoundExchange Integration

SoundExchange is the US ISRC Agency and operates the authoritative ISRC lookup service. After assigning ISRCs, you can submit them to SoundExchange for registration.

### Submit ISRC to SoundExchange

**Single Track:**
1. After assigning ISRC, click "Submit to SoundExchange" button
2. System sends ISRC + metadata to SoundExchange
3. Submission status tracked in database

**Batch Submit (Release):**
1. On release detail page, click "Submit ISRCs to SoundExchange"
2. All tracks with ISRCs in the release are submitted
3. Results show success/failure for each track

**View Submissions:**
- Go to `/studio/soundexchange` to view submission history
- Check status of each ISRC submission
- Lookup ISRCs in SoundExchange database

### SoundExchange Setup

1. **Register with SoundExchange Direct** - https://www.soundexchange.com/
2. **Get API Credentials** - Contact SoundExchange for API access
3. **Set Environment Variables:**
   ```bash
   SOUNDEXCHANGE_API_KEY=your_api_key
   SOUNDEXCHANGE_ACCOUNT_ID=your_account_id
   ```

## Next Steps

1. **Get ISRC Prefix** - Apply at US ISRC Agency (https://isrc.soundexchange.com/)
2. **Set Environment Variables** - Add `ISRC_PREFIX` to `.env.local`
3. **Run Database Schema** - Execute `studio_schema.sql` in Supabase
4. **Test Workflow** - Upload a test track, assign ISRC, submit to SoundExchange
5. **Configure Distributor** - When ready, add Revelator API credentials
6. **Configure SoundExchange** - Add SoundExchange API credentials for ISRC submission
7. **Distribute** - Submit your first release!
