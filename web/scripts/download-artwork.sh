#!/bin/bash

# Script to download album artwork from Spotify
# This uses curl to fetch images from Spotify's CDN

RELEASES_DIR="public/images/releases"
mkdir -p "$RELEASES_DIR"

echo "🎵 Downloading SERGIK Album Artwork"
echo "===================================="
echo ""

# Spotify image URLs format: https://i.scdn.co/image/{hash}
# We need to find the actual image hashes from Spotify

# For now, we'll create a helper that shows how to get them
echo "To get album artwork URLs:"
echo "1. Visit: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H"
echo "2. Click on each release"
echo "3. Right-click the album artwork → 'Copy image address'"
echo "4. The URL will be in format: https://i.scdn.co/image/{hash}"
echo ""
echo "Then update releases.json with the image URLs"
echo ""

# Example download (replace with actual URLs):
# curl -L "https://i.scdn.co/image/..." -o "$RELEASES_DIR/soul-candy.jpg"

echo "✅ Script ready. Update with actual Spotify image URLs to download."

