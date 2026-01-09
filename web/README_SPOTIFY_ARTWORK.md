# Spotify Album Artwork Integration

## Overview

The app now supports automatic fetching of album artwork from Spotify. The system will:

1. **Try local images first** - If an image exists in `/public/images/releases/`, it will be used
2. **Fallback to Spotify** - If no local image, the app will attempt to fetch from Spotify
3. **Show placeholder** - If neither works, a nice placeholder is displayed

## How It Works

### API Route
- `/api/spotify-artwork` - Fetches artwork from Spotify's oEmbed API
- No authentication required for oEmbed API
- Returns high-quality album artwork URLs

### Component Updates
- `ReleaseCard` - Now automatically fetches artwork if not available locally
- Supports both local and remote images
- Graceful fallback to placeholder

### Image Configuration
- Updated `next.config.js` to allow Spotify CDN domains
- Supports: `i.scdn.co`, `image-cdn-fa.spotifycdn.com`, `mosaic.scdn.co`

## Adding Artwork

### Option 1: Local Images (Recommended)
1. Download album artwork
2. Save to `web/public/images/releases/`
3. Name files: `soul-candy.jpg`, `ftp.jpg`, etc.
4. Update `releases.json` with image path: `"/images/releases/soul-candy.jpg"`

### Option 2: Spotify URLs
1. Visit each release on Spotify
2. Copy the album artwork image URL
3. Update `releases.json` with the direct Spotify CDN URL
4. Format: `"https://i.scdn.co/image/{hash}"`

### Option 3: Automatic Fetching
- Currently works if you have track/album Spotify URLs (not just artist page)
- For full automation, you'd need Spotify Web API access
- The infrastructure is in place for future enhancement

## Current Status

The releases.json has been updated to:
- Set `image: null` for all releases
- Set `fetch_from_spotify: true` flag
- Keep Spotify artist URL for reference

## Next Steps

To get actual artwork automatically:

1. **Get Track/Album URLs**: Update `spotify_url` in `releases.json` to point to specific tracks/albums instead of the artist page
   - Example: `https://open.spotify.com/track/{track-id}` or `https://open.spotify.com/album/{album-id}`

2. **Or Use Spotify Web API**: 
   - Get API credentials from Spotify Developer Dashboard
   - Implement search functionality
   - Fetch artwork programmatically

3. **Or Manual Download**:
   - Visit each release on Spotify
   - Download artwork images
   - Save to `public/images/releases/`
   - Update `releases.json` with local paths

## Testing

The app will now:
- ✅ Display local images if available
- ✅ Attempt to fetch from Spotify API if track/album URL provided
- ✅ Show elegant placeholder if neither available
- ✅ Handle loading states gracefully

