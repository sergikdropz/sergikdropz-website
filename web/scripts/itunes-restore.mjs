import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dirname, '..', 'data', 'music-library.json');
const data = JSON.parse(readFileSync(jsonPath, 'utf8'));

const allTracks = data.folders[0].children[0].tracks;
const epFolderDefs = data.folders[0].children[2]; // artist-sergik EP collection

// EP artwork from the JSON
const epArtwork = {};
epFolderDefs.children.forEach(ep => {
  epArtwork[ep.id] = ep.artwork || null;
});

// Map EP name (from track ID) -> folder ID
const epIdMap = {
  'SERGIK - Are We Awake':     'collection-unreleased-eps-sergik---are-we-awake-',
  'SERGIK - Daze':             'collection-unreleased-eps-sergik---daze-',
  'SERGIK - FTP':              'collection-unreleased-eps-sergik---ftp-',
  'SERGIK - In The Streets':   'collection-unreleased-eps-sergik---in-the-streets-',
  'SERGIK - Inspire':          'collection-unreleased-eps-sergik---inspire-',
  'SERGIK - Soul Candy':       'collection-unreleased-eps-sergik---soul-candy-',
  'SERGIK - Staying A Vibe':   'collection-unreleased-eps-sergik---staying-a-vibe-',
  'SERGIK - The World Dont Stop': 'collection-unreleased-eps-sergik---the-world-dont-stop-',
  'SERGIK - Utopia':           'collection-unreleased-eps-sergik---utopia-',
  'SERGIK - Vice & Virtues':   'collection-unreleased-eps-sergik---vice---virtues-',
};

// Genre folder IDs
const genreIdMap = {
  'Deep n Funky':                'collection-unreleased-playlists-deep-n-funky-',
  'Experimental : Free Form Bass': 'collection-unreleased-playlists-experimental---free-form-bass-',
  'Feelin Sendy':                'collection-unreleased-playlists-feelin-sendy-',
  'Funktioneers':                'collection-unreleased-playlists-funktioneers-',
  'Hip Hop':                     'collection-unreleased-playlists-hip-hop-',
  'Party Time':                  'collection-unreleased-playlists-party-time-',
  'Reggae':                      'collection-unreleased-playlists-reggae-',
};

// Determine which folder a track belongs to
function getTargetFolder(track) {
  // EP tracks: ID contains "eps-EPNAME-"
  if (track.id.includes('eps-')) {
    for (const [epName, folderId] of Object.entries(epIdMap)) {
      if (track.id.includes(`eps-${epName}-`)) return folderId;
    }
  }
  // Genre/playlist tracks: extract from file URL
  if (track.id.includes('Playlists-') || track.file.includes('/Playlists/')) {
    const urlMatch = track.file.match(/Playlists\/([^/]+)\//);
    if (urlMatch) {
      const genre = decodeURIComponent(urlMatch[1]);
      if (genreIdMap[genre]) return genreIdMap[genre];
    }
  }
  return null;
}

// ─── iTunes-style folder hierarchy ───
// Root: SERGIK (artist-level)
// ├── EPs (container)
// │   ├── Are We Awake EP
// │   ├── Daze EP ...
// └── Genre Collections (container)  
//     ├── Deep n Funky
//     ├── Funktioneers ...

const ARTIST_ROOT = 'artist-sergik';
const EPS_CONTAINER = 'folder-eps';
const GENRES_CONTAINER = 'folder-genres';

const folders = [];

// 1. Artist root folder
folders.push({
  id: ARTIST_ROOT,
  name: 'SERGIK',
  type: 'artist',
  parent_id: null,
  artwork_url: null,
  year: null,
  display_order: 0,
  album_artist: 'SERGIK',
  genre: null,
  is_compilation: false,
});

// 2. EPs container
folders.push({
  id: EPS_CONTAINER,
  name: 'EPs',
  type: 'folder',
  parent_id: ARTIST_ROOT,
  artwork_url: null,
  year: null,
  display_order: 0,
  album_artist: 'SERGIK',
  genre: null,
  is_compilation: false,
});

// 3. Genre Collections container
folders.push({
  id: GENRES_CONTAINER,
  name: 'Genre Collections',
  type: 'folder',
  parent_id: ARTIST_ROOT,
  artwork_url: null,
  year: null,
  display_order: 1,
  album_artist: 'SERGIK',
  genre: null,
  is_compilation: false,
});

// 4. Individual EP folders (under EPs container)
const epNames = [
  { id: 'collection-unreleased-eps-sergik---are-we-awake-', name: 'Are We Awake', order: 0 },
  { id: 'collection-unreleased-eps-sergik---daze-', name: 'Daze', order: 1 },
  { id: 'collection-unreleased-eps-sergik---ftp-', name: 'FTP', order: 2 },
  { id: 'collection-unreleased-eps-sergik---in-the-streets-', name: 'In The Streets', order: 3 },
  { id: 'collection-unreleased-eps-sergik---inspire-', name: 'Inspire', order: 4 },
  { id: 'collection-unreleased-eps-sergik---soul-candy-', name: 'Soul Candy', order: 5 },
  { id: 'collection-unreleased-eps-sergik---staying-a-vibe-', name: 'Staying A Vibe', order: 6 },
  { id: 'collection-unreleased-eps-sergik---the-world-dont-stop-', name: 'The World Dont Stop', order: 7 },
  { id: 'collection-unreleased-eps-sergik---utopia-', name: 'UTOPIA', order: 8 },
  { id: 'collection-unreleased-eps-sergik---vice---virtues-', name: 'Vice & Virtues', order: 9 },
];

for (const ep of epNames) {
  folders.push({
    id: ep.id,
    name: ep.name,
    type: 'ep',
    parent_id: EPS_CONTAINER,
    artwork_url: epArtwork[ep.id] || null,
    year: 2026,
    display_order: ep.order,
    album_artist: 'SERGIK',
    genre: null,
    is_compilation: false,
  });
}

// 5. Genre folders (under Genre Collections container)
const genreNames = [
  { id: 'collection-unreleased-playlists-deep-n-funky-', name: 'Deep n Funky', genre: 'House', order: 0 },
  { id: 'collection-unreleased-playlists-experimental---free-form-bass-', name: 'Experimental : Free Form Bass', genre: 'Bass', order: 1 },
  { id: 'collection-unreleased-playlists-feelin-sendy-', name: 'Feelin Sendy', genre: 'EDM', order: 2 },
  { id: 'collection-unreleased-playlists-funktioneers-', name: 'Funktioneers', genre: 'Funk', order: 3 },
  { id: 'collection-unreleased-playlists-hip-hop-', name: 'Hip Hop', genre: 'Hip Hop', order: 4 },
  { id: 'collection-unreleased-playlists-party-time-', name: 'Party Time', genre: 'Party', order: 5 },
  { id: 'collection-unreleased-playlists-reggae-', name: 'Reggae', genre: 'Reggae', order: 6 },
];

for (const g of genreNames) {
  folders.push({
    id: g.id,
    name: g.name,
    type: 'album',
    parent_id: GENRES_CONTAINER,
    artwork_url: null,
    year: 2026,
    display_order: g.order,
    album_artist: 'SERGIK',
    genre: g.genre,
    is_compilation: true,
  });
}

// ─── Assign tracks to folders (deduplicated by title) ───
const seenTitles = new Set();
const tracks = [];

// Sort: EP tracks first (so they get priority), then genre tracks
const epTracks = allTracks.filter(t => t.id.includes('eps-'));
const genreTracks = allTracks.filter(t => !t.id.includes('eps-'));
const sortedTracks = [...epTracks, ...genreTracks];

for (const track of sortedTracks) {
  const folderId = getTargetFolder(track);
  if (!folderId) {
    console.warn('No folder for:', track.title, '- ID:', track.id);
    continue;
  }

  if (seenTitles.has(track.title)) continue;
  seenTitles.add(track.title);

  const trackId = `${track.id}-in-${folderId}`;
  const folder = folders.find(f => f.id === folderId);
  const trackNum = tracks.filter(t => t.folder_id === folderId).length + 1;

  tracks.push({
    id: trackId,
    folder_id: folderId,
    title: track.title,
    artist: track.artist || 'SERGIK',
    duration: track.duration || 0,
    file_url: track.file || null,
    artwork_url: track.artwork || folder?.artwork_url || null,
    bpm: track.bpm || null,
    key_signature: track.key_signature || null,
    energy_level: track.energy_level ?? null,
    danceability: track.danceability ?? null,
    sonic_dna: track.sonic_dna || null,
    waveform: track.waveform || null,
    display_order: trackNum - 1,
    track_number: trackNum,
    genre: folder?.genre || null,
    sort_artist: 'SERGIK',
    metadata: {},
  });
}

console.log('=== iTunes-Style Library Summary ===');
console.log(`Folders: ${folders.length} (3 structural + ${epNames.length} EPs + ${genreNames.length} genres)`);
console.log(`Tracks: ${tracks.length} (deduplicated from ${allTracks.length})`);
console.log();

// Print hierarchy
console.log('SERGIK');
console.log('├── EPs');
for (const ep of epNames) {
  const ct = tracks.filter(t => t.folder_id === ep.id).length;
  console.log(`│   ├── ${ep.name} (${ct} tracks)`);
}
console.log('└── Genre Collections');
for (const g of genreNames) {
  const ct = tracks.filter(t => t.folder_id === g.id).length;
  console.log(`    ├── ${g.name} (${ct} tracks)`);
}

// ─── Generate SQL ───

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Folder SQL
let folderSql = 'DELETE FROM music_library_tracks;\nDELETE FROM music_library_folders;\n\n';

// Insert structural folders first (no parent FK issues)
const structural = folders.filter(f => f.parent_id === null);
const level1 = folders.filter(f => f.parent_id === ARTIST_ROOT);
const level2 = folders.filter(f => f.parent_id === EPS_CONTAINER || f.parent_id === GENRES_CONTAINER);

for (const batch of [structural, level1, level2]) {
  for (const f of batch) {
    folderSql += `INSERT INTO music_library_folders (id, name, type, parent_id, artwork_url, year, display_order, album_artist, genre, is_compilation) VALUES (${esc(f.id)}, ${esc(f.name)}, ${esc(f.type)}, ${esc(f.parent_id)}, ${esc(f.artwork_url)}, ${esc(f.year)}, ${f.display_order}, ${esc(f.album_artist)}, ${esc(f.genre)}, ${f.is_compilation})\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, parent_id = EXCLUDED.parent_id, artwork_url = EXCLUDED.artwork_url, year = EXCLUDED.year, display_order = EXCLUDED.display_order, album_artist = EXCLUDED.album_artist, genre = EXCLUDED.genre, is_compilation = EXCLUDED.is_compilation;\n`;
  }
  folderSql += '\n';
}

writeFileSync('/tmp/itunes-folders.sql', folderSql);
console.log(`\nWrote /tmp/itunes-folders.sql (${folderSql.length} bytes)`);

// Track SQL in batches of 25
const BATCH = 25;
const batches = [];
for (let i = 0; i < tracks.length; i += BATCH) {
  const batch = tracks.slice(i, i + BATCH);
  let sql = `INSERT INTO music_library_tracks (id, folder_id, title, artist, duration, file_url, artwork_url, bpm, key_signature, energy_level, danceability, sonic_dna, waveform, display_order, track_number, genre, sort_artist, metadata) VALUES\n`;
  const rows = batch.map(t =>
    `(${esc(t.id)}, ${esc(t.folder_id)}, ${esc(t.title)}, ${esc(t.artist)}, ${t.duration}, ${esc(t.file_url)}, ${esc(t.artwork_url)}, ${esc(t.bpm)}, ${esc(t.key_signature)}, ${esc(t.energy_level)}, ${esc(t.danceability)}, ${esc(t.sonic_dna)}, ${esc(t.waveform)}, ${t.display_order}, ${esc(t.track_number)}, ${esc(t.genre)}, ${esc(t.sort_artist)}, ${esc(t.metadata)})`
  );
  sql += rows.join(',\n') + '\nON CONFLICT (id) DO NOTHING;';
  batches.push(sql);
}

for (let i = 0; i < batches.length; i++) {
  writeFileSync(`/tmp/itunes-tracks-batch-${i}.sql`, batches[i]);
}
console.log(`Wrote ${batches.length} track batch files to /tmp/itunes-tracks-batch-*.sql`);

// Also write combined JSON for updating music-library.json later
writeFileSync('/tmp/itunes-restore-data.json', JSON.stringify({ folders, tracks }, null, 2));
console.log('Wrote /tmp/itunes-restore-data.json');
