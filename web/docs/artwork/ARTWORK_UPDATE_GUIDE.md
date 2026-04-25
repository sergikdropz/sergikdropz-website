# How to Update Release Artwork

## Current Status

All releases currently use the SERGIK artist image as a placeholder. To get proper artwork for each release:

## Method 1: Manual Update (Easiest)

1. **Visit SERGIK's Spotify Page:**
   - Go to: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H
   - Browse through the discography

2. **For Each Release:**
   - Click on the release (EP, Single, etc.)
   - Right-click on the album artwork
   - Select "Copy image address"
   - The URL will look like: `https://i.scdn.co/image/{hash}`

3. **Update releases.json:**
   - Open `web/data/releases.json`
   - Find the release
   - Replace the `image` field with the artwork URL you copied
   - Also update `spotify_url` to the specific track/album URL (not just artist page)

## Method 2: Using the API

1. **Get Track/Album URL:**
   - Find the release on Spotify
   - Copy the track/album URL (e.g., `https://open.spotify.com/track/...`)

2. **Fetch Artwork:**
   ```bash
   curl "http://localhost:3000/api/spotify-artwork?url={spotify-url}"
   ```

3. **Update releases.json:**
   - Use the `imageUrl` from the API response
   - Update both `spotify_url` and `image` fields

## Method 3: Using the Script

```bash
cd web/scripts
./update-artwork.sh "https://open.spotify.com/track/{track-id}"
```

## Example Update

**Before:**
```json
{
  "id": "soul-candy",
  "title": "Soul Candy",
  "spotify_url": "https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H",
  "image": "https://image-cdn-ak.spotifycdn.com/image/ab67616100005174a81945fefa16b88ff93f51e7"
}
```

**After:**
```json
{
  "id": "soul-candy",
  "title": "Soul Candy",
  "spotify_url": "https://open.spotify.com/album/{actual-album-id}",
  "image": "https://i.scdn.co/image/{actual-artwork-hash}"
}
```

## Releases to Update

1. ✅ Soul Candy (EP, 2025)
2. ✅ FTP (EP, 2024)
3. ✅ A Good Day (feat. Be Janis) (Single, 2025)
4. ✅ Repeat / Cozy Catz (feat. DiscoFlip) (Single, 2025)
5. ✅ Say Yeah (Sergik Remix) (Remix, 2025)
6. ✅ Funky Bounce (Single, 2024)

## Notes

- The app will automatically fetch artwork if you provide track/album URLs (not just artist page)
- Images are cached, so updates may take a moment to appear
- Make sure to use high-resolution artwork URLs (Spotify CDN provides these)

