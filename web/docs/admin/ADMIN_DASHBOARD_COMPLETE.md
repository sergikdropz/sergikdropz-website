# 🎛️ Admin Dashboard - Complete Control System

## Overview

A comprehensive admin dashboard providing **optimal backend control** for all frontend features. Every aspect of your website can now be managed through intuitive admin tools.

## 🎯 Admin Tools Available

### 1. **Music Library** (`/admin/music`)
**Frontend Feature:** `/music-library` - Unreleased tracks vault
- ✅ Upload audio tracks with folder organization
- ✅ Backend controls: Scan Library, Analyze All Tracks
- ✅ View all tracks with metadata (BPM, key, duration)
- ✅ Delete tracks
- ✅ Real-time upload progress

**API Endpoints:**
- `POST /api/audio/upload` - Upload track
- `GET /api/audio/list` - List all tracks
- `POST /api/scan-library` - Scan music library
- `POST /api/audio/analyze-all-sonic-dna` - Analyze tracks

---

### 2. **Releases Management** (`/admin/releases`)
**Frontend Feature:** `/music` - Discography page
- ✅ Add/Edit/Delete releases
- ✅ Manage streaming platform links (Spotify, SoundCloud)
- ✅ Sync with Spotify API for automatic metadata
- ✅ Set release type (Single, EP, Album, Remix)
- ✅ Upload artwork images

**Data File:** `web/data/releases.json`

**API Endpoints:**
- `GET /api/admin/releases` - Get all releases
- `POST /api/admin/releases` - Create/Update release
- `DELETE /api/admin/releases/[id]` - Delete release
- `POST /api/admin/releases/[id]/sync-spotify` - Sync Spotify data

---

### 3. **Sonic DNA Analysis** (`/admin/sonic-dna`)
**Frontend Feature:** Audio analysis for tracks
- ✅ View agent team status and performance
- ✅ Analyze all tracks (batch processing)
- ✅ Regenerate Sonic DNA for tracks
- ✅ Track processing status (completed, processing, pending)
- ✅ View track metadata (BPM, key signature, energy level)

**API Endpoints:**
- `GET /api/audio/agent-status` - Agent team status
- `POST /api/audio/analyze-all-sonic-dna` - Analyze all
- `POST /api/audio/regenerate-all-sonic-dna-agents` - Regenerate all
- `POST /api/audio/sonic-dna-agents?trackId=...` - Regenerate single track

---

### 4. **Video Uploader** (`/admin/videos`)
**Frontend Feature:** Video content management
- ✅ Upload video files to Supabase Storage
- ✅ Add title and description
- ✅ View video grid with thumbnails
- ✅ Delete videos

**API Endpoints:**
- `POST /api/videos/upload` - Upload video
- `GET /api/youtube-videos` - List videos

---

### 5. **Videos Manager** (`/admin/videos-manager`)
**Frontend Feature:** `/videos` - YouTube videos page
- ✅ Add/Edit/Delete YouTube videos
- ✅ Manage video metadata (title, description, category)
- ✅ Set video categories (music-video, visualizer, collaboration, etc.)
- ✅ View video thumbnails

**Data File:** `web/data/videos.json`

**API Endpoints:**
- `GET /api/admin/videos` - Get all videos
- `POST /api/admin/videos` - Create/Update video
- `DELETE /api/admin/videos/[id]` - Delete video

---

### 6. **Instagram Helper** (`/admin/instagram`)
**Frontend Feature:** Homepage Instagram feed, `/instagram-helper`
- ✅ Save Instagram post URLs
- ✅ Scrape posts (extract metadata, video URLs)
- ✅ Process videos (download and upload to Supabase)
- ✅ View post grid with thumbnails/videos
- ✅ Delete posts

**Data File:** `web/data/instagram-posts.json` + Supabase `instagram_media` table

**API Endpoints:**
- `POST /api/instagram/save-posts` - Save post URLs
- `POST /api/instagram/scrape` - Scrape posts
- `POST /api/instagram/process-posts` - Process videos
- `GET /api/instagram/media` - List all posts

---

### 7. **Gallery Uploader** (`/admin/gallery`)
**Frontend Feature:** `/gallery` - Image gallery page
- ✅ Upload multiple images at once
- ✅ Upload to local storage (`/public/images/gallery/`)
- ✅ Upload to Supabase Storage
- ✅ View image grid with previews
- ✅ Delete images

**Data File:** `web/data/gallery.json` + Supabase Storage

**API Endpoints:**
- `POST /api/gallery/upload` - Upload to local
- `POST /api/gallery/upload-supabase` - Upload to Supabase
- `GET /api/gallery/list` - List local images
- `GET /api/gallery/supabase-list` - List Supabase images
- `DELETE /api/gallery/[filename]` - Delete image

---

### 8. **Events & Performances** (`/admin/events`)
**Frontend Feature:** `/performances` - Events and venues page
- ✅ Manage events (festivals, shows, performances)
- ✅ Manage venues (warehouses, clubs, studios)
- ✅ Add/Edit/Delete events and venues
- ✅ Set event metadata (date, venue, city, type)

**Data Files:** `web/data/events.json`, `web/data/venues.json`

**API Endpoints:**
- `GET /api/admin/events` - Get all events
- `POST /api/admin/events` - Create/Update event
- `DELETE /api/admin/events/[id]` - Delete event
- `GET /api/admin/venues` - Get all venues
- `POST /api/admin/venues` - Create/Update venue
- `DELETE /api/admin/venues/[id]` - Delete venue

---

### 9. **Artist Information** (`/admin/artist`)
**Frontend Feature:** `/about` - About page, homepage hero
- ✅ Edit artist name and legal name
- ✅ Update contact email
- ✅ Edit short and long bio
- ✅ Update location (city, state, country)
- ✅ Manage genres, influences, community roles

**Data File:** `web/data/artist.json`

**API Endpoints:**
- `GET /api/admin/artist` - Get artist data
- `POST /api/admin/artist` - Update artist data

---

### 10. **Purchasable Tracks** (`/admin/purchasable-tracks`)
**Frontend Feature:** Track purchasing system
- ✅ Add/Edit/Delete purchasable tracks
- ✅ Set pricing and Stripe Price IDs
- ✅ Manage file formats (WAV, FLAC, MP3)
- ✅ Set preview URLs and artwork
- ✅ Configure track metadata

**Data File:** `web/data/purchasable-tracks.json`

**API Endpoints:**
- `GET /api/admin/purchasable-tracks` - Get all tracks
- `POST /api/admin/purchasable-tracks` - Create/Update track
- `DELETE /api/admin/purchasable-tracks/[id]` - Delete track

---

### 11. **Analytics** (`/admin/analytics`)
**Frontend Feature:** Site analytics tracking
- ✅ View analytics statistics
- ✅ Track events and user behavior
- ✅ View analytics dashboard

**API Endpoints:**
- `GET /api/analytics/stats` - Get analytics stats
- `POST /api/analytics/track` - Track event
- `GET /api/analytics/events` - Get events

---

### 12. **Settings** (`/admin/settings`)
**Frontend Feature:** Site-wide settings
- ✅ Manage application settings
- ✅ Configure site preferences
- ✅ View settings status

**API Endpoints:**
- `GET /api/admin/settings` - Get all settings
- `POST /api/admin/settings` - Create/Update setting
- `GET /api/admin/settings/[key]` - Get specific setting
- `GET /api/admin/settings/status` - Get settings status

---

### 13. **Users** (`/admin/users`)
**Frontend Feature:** User management
- ✅ View all users
- ✅ Manage user accounts
- ✅ User administration

**API Endpoints:**
- `GET /api/admin/users` - Get all users
- `GET /api/admin/users/[id]` - Get user details
- `POST /api/admin/users/[id]` - Update user

---

### 14. **Purchases** (`/admin/purchases`)
**Frontend Feature:** Track purchase system
- ✅ View purchase history
- ✅ Manage purchases
- ✅ Purchase statistics

**API Endpoints:**
- `GET /api/admin/purchases` - Get all purchases
- `GET /api/admin/purchases/stats` - Get purchase stats

---

### 15. **Logs** (`/admin/logs`)
**Frontend Feature:** System logging
- ✅ View admin activity logs
- ✅ System event logs

**API Endpoints:**
- `GET /api/admin/logs` - Get logs

---

## 🗺️ Frontend Feature Mapping

| Frontend Page/Feature | Admin Tool | Data Source |
|----------------------|------------|-------------|
| `/` (Homepage) | Artist Info, Instagram Helper | `artist.json`, `instagram-posts.json` |
| `/music` | Releases Management | `releases.json` |
| `/music-library` | Music Library, Sonic DNA | Supabase `audio_files` table |
| `/videos` | Videos Manager | `videos.json` |
| `/gallery` | Gallery Uploader | `gallery.json` + Supabase Storage |
| `/performances` | Events & Performances | `events.json`, `venues.json` |
| `/about` | Artist Information | `artist.json` |
| `/epk` | Artist Info, Releases, Videos | Multiple data files |
| `/contact` | Settings | Settings API |
| Track Purchasing | Purchasable Tracks | `purchasable-tracks.json` |
| Instagram Feed | Instagram Helper | `instagram-posts.json` + Supabase |

---

## 🚀 Key Features

### Efficiency Optimizations

1. **Batch Operations**
   - Upload multiple files at once
   - Analyze all tracks in batch
   - Process multiple Instagram posts

2. **Real-time Updates**
   - Live upload progress
   - Real-time status updates
   - Instant data refresh

3. **Smart Defaults**
   - Auto-fill forms with existing data
   - Pre-configured options
   - Validation and error handling

4. **Unified Interface**
   - Consistent UI across all tools
   - Color-coded sections
   - Responsive design

5. **Backend Control**
   - Direct database access
   - File system management
   - API endpoint control

---

## 📊 Dashboard Statistics

The main dashboard (`/admin`) shows:
- Total Tracks
- Gallery Images
- Total Purchases
- Total Revenue
- Analytics Events
- Last Updated timestamp

---

## 🔐 Security

- All admin routes require authentication
- Admin-only API endpoints
- Server-side session validation
- Protected data operations

---

## 🎨 UI/UX Features

- Dark theme consistent with site design
- Hover effects and transitions
- Loading states
- Error handling
- Success notifications
- Confirmation dialogs for destructive actions

---

## 📝 Data Management

All data is managed through:
- **JSON Files** - For structured content (releases, videos, events, etc.)
- **Supabase Database** - For dynamic content (audio files, Instagram posts, etc.)
- **Supabase Storage** - For file uploads (audio, images, videos)

---

## ✅ Complete Coverage

Every frontend feature now has a corresponding admin tool for optimal backend control!
