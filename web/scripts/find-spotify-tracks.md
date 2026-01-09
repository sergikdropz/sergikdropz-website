# How to Find Spotify Track URLs for SERGIK Releases

## Manual Method (Recommended)

1. **Visit SERGIK's Spotify Artist Page:**
   - https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H

2. **For Each Release:**
   - Scroll through the artist's discography
   - Click on each release (EP, Single, etc.)
   - Copy the URL from the address bar
   - The URL format will be:
     - Track: `https://open.spotify.com/track/{track-id}`
     - Album: `https://open.spotify.com/album/{album-id}`

3. **Get Artwork:**
   - Once you have the track/album URL, use our API:
   - `GET /api/spotify-artwork?url={spotify-url}`
   - Or right-click the artwork on Spotify and "Copy image address"

## Releases to Find:

1. **Soul Candy** (EP, 2025)
2. **FTP** (EP, 2024)
3. **A Good Day (feat. Be Janis)** (Single, 2025)
4. **Repeat / Cozy Catz (feat. DiscoFlip)** (Single, 2025)
5. **Say Yeah (Sergik Remix)** (Remix, 2025)
6. **Funky Bounce** (Single, 2024)

## Quick Script to Get Artwork

Once you have the track URLs, you can use:

```bash
# For each release, run:
curl "http://localhost:3000/api/spotify-artwork?url={spotify-track-url}"
```

This will return the artwork URL which you can then add to `releases.json`.

