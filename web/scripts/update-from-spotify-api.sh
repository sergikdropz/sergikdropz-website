#!/bin/bash

# Script to fetch and update releases.json from Spotify API
# Requires: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local

echo "🎵 Fetching SERGIK Discography from Spotify API"
echo "================================================"
echo ""

if [ ! -f ".env.local" ]; then
  echo "❌ .env.local file not found"
  echo ""
  echo "Create .env.local with:"
  echo "SPOTIFY_CLIENT_ID=your_client_id"
  echo "SPOTIFY_CLIENT_SECRET=your_client_secret"
  echo ""
  echo "Get credentials from: https://developer.spotify.com/dashboard"
  exit 1
fi

echo "📥 Fetching discography..."
curl -s "http://localhost:3000/api/spotify-discography" | python3 -m json.tool

echo ""
echo "✅ Use the output above to update releases.json with proper artwork URLs"

