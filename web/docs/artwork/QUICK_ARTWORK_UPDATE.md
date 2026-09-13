# Quick Guide: Update Release Artwork

Based on the [Spotify discography](https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all), here's how to get proper artwork:

## Method 1: Manual (Fastest - No API Setup)

1. **Visit the discography page:**
   - https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all

2. **For each release, click on it and:**
   - Copy the URL (e.g., `https://open.spotify.com/album/...`)
   - Right-click the artwork → "Copy image address"
   - Get the artwork URL (e.g., `https://i.scdn.co/image/...`)

3. **Update `releases.json`:**
   ```json
   {
     "id": "soul-candy",
     "spotify_url": "https://open.spotify.com/album/{actual-id}",
     "image": "https://i.scdn.co/image/{actual-hash}"
   }
   ```

## Method 2: Using Spotify Web API (Automated)

1. **Get API credentials:**
   - Visit: https://developer.spotify.com/dashboard
   - Create a new app
   - Copy Client ID and Client Secret

2. **Setup environment:**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local and add your credentials
   ```

3. **Fetch discography:**
   ```bash
   npm run dev  # Start server
   # In another terminal:
   curl http://localhost:3000/api/spotify-discography
   ```

4. **Update releases.json** with the fetched data

## Available Releases on Spotify

From the discography page, these releases are available:

- ✅ **Soul Candy** (2025 • EP)
- ✅ **A Good Day** (2025 • Single)
- ✅ **Repeat / Cozy Catz** (2025 • Single)
- ✅ **Say Yeah (Sergik Remix)** (2025 • Single)
- ✅ **Funky Bounce** (2024 • Single)
- ⚠️ **FTP** (2024 • EP) - *Not found in current discography*

## Quick Update Script

Once you have the track/album URLs, you can quickly get artwork:

```bash
# For each release:
curl "http://localhost:3000/api/spotify-artwork?url={spotify-url}"
```

This returns the artwork URL which you can add to `releases.json`.

## Current Status

All releases currently show the artist image. Update the `spotify_url` fields to point to specific tracks/albums (not the artist page) and the app will automatically fetch the correct artwork!

