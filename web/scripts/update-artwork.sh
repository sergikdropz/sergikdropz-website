#!/bin/bash

# Script to update releases.json with Spotify artwork URLs
# Usage: ./update-artwork.sh

echo "🎵 SERGIK Artwork Updater"
echo "========================="
echo ""
echo "This script helps you update artwork URLs in releases.json"
echo ""
echo "For each release, you need to:"
echo "1. Find the Spotify track/album URL"
echo "2. Get the artwork URL using:"
echo "   curl 'http://localhost:3000/api/spotify-artwork?url={spotify-url}'"
echo ""
echo "Then update releases.json with the image URLs"
echo ""
echo "Or manually:"
echo "1. Visit: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H"
echo "2. Find each release"
echo "3. Right-click artwork → Copy image address"
echo "4. Update releases.json"
echo ""

# Example: If you have a track URL, fetch its artwork
if [ -n "$1" ]; then
  echo "Fetching artwork for: $1"
  curl -s "http://localhost:3000/api/spotify-artwork?url=$(echo $1 | sed 's/ /%20/g')" | python3 -m json.tool
else
  echo "Usage: ./update-artwork.sh 'https://open.spotify.com/track/...'"
fi

