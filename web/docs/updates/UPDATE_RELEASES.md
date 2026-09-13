# Update Releases with Proper Artwork

Based on the [Spotify discography](https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all), here are the releases available:

## Available Releases on Spotify

1. **Soul Candy** (2025 • EP)
2. **A Good Day** (2025 • Single) 
3. **Repeat / Cozy Catz** (2025 • Single)
4. **Say Yeah (Sergik Remix)** (2025 • Single)
5. **Funky Bounce** (2024 • Single)
6. **ROOS VA** (2025 • EP) - *Not in current releases.json*
7. **Uninvited** (2024 • Single) - *Not in current releases.json*

## How to Get Artwork URLs

### Step 1: Get Track/Album URLs

1. Visit: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all
2. Click on each release
3. Copy the URL from the address bar
   - Format: `https://open.spotify.com/album/{id}` or `https://open.spotify.com/track/{id}`

### Step 2: Get Artwork URLs

**Option A: Using the API (if server is running)**
```bash
curl "http://localhost:3000/api/spotify-artwork?url={spotify-url}"
```

**Option B: Manual**
1. On the Spotify page, right-click the album artwork
2. Select "Copy image address"
3. URL format: `https://i.scdn.co/image/{hash}`

### Step 3: Update releases.json

Update each release with:
- `spotify_url`: The track/album URL (not artist page)
- `image`: The artwork URL

## Example Update

```json
{
  "id": "soul-candy",
  "title": "Soul Candy",
  "type": "EP",
  "year": 2025,
  "platforms": ["Spotify", "Apple Music", "SoundCloud"],
  "spotify_url": "https://open.spotify.com/album/{actual-album-id}",
  "image": "https://i.scdn.co/image/{actual-artwork-hash}",
  "fetch_from_spotify": true
}
```

## Note About FTP EP

The "FTP" EP (2024) is listed in releases.json but doesn't appear in the current Spotify discography. You may want to:
- Verify if it exists under a different name
- Remove it if it's not available
- Or keep it with a placeholder if it's coming soon

