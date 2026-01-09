// Script to fetch artwork for all SERGIK releases from Spotify discography
// Based on: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Releases from Spotify discography
const releases = [
  { 
    id: 'soul-candy',
    title: 'Soul Candy',
    type: 'EP',
    year: 2025,
    // Need actual album URL from Spotify
    spotifySearch: 'SERGIK Soul Candy EP'
  },
  { 
    id: 'a-good-day',
    title: 'A Good Day',
    type: 'Single',
    year: 2025,
    spotifySearch: 'SERGIK A Good Day'
  },
  { 
    id: 'repeat-cozy-catz',
    title: 'Repeat / Cozy Catz',
    type: 'Single',
    year: 2025,
    spotifySearch: 'SERGIK Repeat Cozy Catz'
  },
  { 
    id: 'say-yeah-remix',
    title: 'Say Yeah (Sergik Remix)',
    type: 'Remix',
    year: 2025,
    spotifySearch: 'SERGIK Say Yeah Remix'
  },
  { 
    id: 'funky-bounce',
    title: 'Funky Bounce',
    type: 'Single',
    year: 2024,
    spotifySearch: 'SERGIK Funky Bounce'
  },
];

console.log('🎵 SERGIK Artwork Fetcher');
console.log('========================');
console.log('\nReleases found on Spotify:');
releases.forEach(r => {
  console.log(`- ${r.title} (${r.type}, ${r.year})`);
});
console.log('\n⚠️  Note: To get artwork, you need the actual Spotify track/album URLs.');
console.log('Visit: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H/discography/all');
console.log('Click on each release and copy the URL, then update releases.json\n');

