// Script to fetch album artwork from Spotify
// This uses Spotify's public oEmbed API

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const releasesDir = path.join(__dirname, '../public/images/releases');

// Ensure directory exists
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true });
}

// Function to fetch from Spotify oEmbed API
function fetchSpotifyArtwork(spotifyUrl) {
  return new Promise((resolve, reject) => {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    https.get(oembedUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.thumbnail_url);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Function to download image
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${path.basename(filepath)}`);
          resolve(filepath);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        file.close();
        reject(new Error(`Failed: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

console.log('🎵 SERGIK Album Artwork Fetcher');
console.log('================================\n');
console.log('To use this script:');
console.log('1. Visit https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H');
console.log('2. Find each release and copy its Spotify URL');
console.log('3. Update the releases array below with track/album URLs');
console.log('4. Run: node scripts/get-artwork-from-spotify.mjs\n');

// Update these with actual Spotify track/album URLs
const releases = [
  { id: 'soul-candy', title: 'Soul Candy', spotifyUrl: null },
  { id: 'ftp', title: 'FTP', spotifyUrl: null },
  { id: 'a-good-day', title: 'A Good Day', spotifyUrl: null },
  { id: 'repeat-cozy-catz', title: 'Repeat', spotifyUrl: null },
  { id: 'say-yeah-remix', title: 'Say Yeah', spotifyUrl: null },
  { id: 'funky-bounce', title: 'Funky Bounce', spotifyUrl: null },
];

// Process releases
async function processReleases() {
  for (const release of releases) {
    if (!release.spotifyUrl) {
      console.log(`⏭️  Skipping ${release.title} - no Spotify URL provided`);
      continue;
    }

    try {
      console.log(`📥 Fetching artwork for: ${release.title}`);
      const imageUrl = await fetchSpotifyArtwork(release.spotifyUrl);
      const filepath = path.join(releasesDir, `${release.id}.jpg`);
      await downloadImage(imageUrl, filepath);
    } catch (error) {
      console.error(`❌ Error fetching ${release.title}:`, error.message);
    }
  }
}

// Uncomment to run:
// processReleases();

console.log('\n💡 Tip: Add Spotify track/album URLs to the releases array and uncomment processReleases()');

