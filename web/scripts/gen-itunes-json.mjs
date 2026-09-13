import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const restoreData = JSON.parse(readFileSync('/tmp/itunes-restore-data.json', 'utf8'));
const { folders, tracks } = restoreData;

function buildTrackJson(t) {
  const obj = {
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    file: t.file_url,
    bpm: t.bpm,
  };
  if (t.artwork_url) obj.artwork = t.artwork_url;
  if (t.key_signature) obj.key_signature = t.key_signature;
  if (t.sonic_dna) obj.sonic_dna = t.sonic_dna;
  if (t.waveform) obj.waveform = t.waveform;
  if (t.energy_level !== null && t.energy_level !== undefined) obj.energy_level = t.energy_level;
  if (t.danceability !== null && t.danceability !== undefined) obj.danceability = t.danceability;
  if (t.track_number) obj.track_number = t.track_number;
  if (t.genre) obj.genre = t.genre;
  return obj;
}

// Build the iTunes-style JSON structure
const artistRoot = folders.find(f => f.id === 'artist-sergik');
const epsContainer = folders.find(f => f.id === 'folder-eps');
const genresContainer = folders.find(f => f.id === 'folder-genres');

const epFolders = folders.filter(f => f.parent_id === 'folder-eps');
const genreFolders = folders.filter(f => f.parent_id === 'folder-genres');

const json = {
  description: "Unreleased music vault - exclusive tracks not available on streaming services",
  folders: [
    {
      id: artistRoot.id,
      name: artistRoot.name,
      type: "folder",
      parentId: null,
      children: [
        {
          id: epsContainer.id,
          name: epsContainer.name,
          type: "folder",
          parentId: artistRoot.id,
          children: epFolders
            .sort((a, b) => a.display_order - b.display_order)
            .map(ep => ({
              id: ep.id,
              name: ep.name,
              type: "ep",
              year: ep.year || 2026,
              ...(ep.artwork_url ? { artwork: ep.artwork_url } : {}),
              albumArtist: "SERGIK",
              tracks: tracks
                .filter(t => t.folder_id === ep.id)
                .sort((a, b) => a.display_order - b.display_order)
                .map(buildTrackJson),
            })),
        },
        {
          id: genresContainer.id,
          name: genresContainer.name,
          type: "folder",
          parentId: artistRoot.id,
          children: genreFolders
            .sort((a, b) => a.display_order - b.display_order)
            .map(g => ({
              id: g.id,
              name: g.name,
              type: "album",
              year: g.year || 2026,
              genre: g.genre,
              albumArtist: "SERGIK",
              isCompilation: true,
              tracks: tracks
                .filter(t => t.folder_id === g.id)
                .sort((a, b) => a.display_order - b.display_order)
                .map(buildTrackJson),
            })),
        },
      ],
    },
  ],
  playlists: [
    {
      id: "playlist-vault-favorites",
      name: "Vault Favorites",
      description: "Curated selection of exclusive unreleased tracks",
      trackIds: [],
      createdAt: "2026-01-10T08:38:33.176Z",
    },
  ],
};

const output = JSON.stringify(json, null, 2);
const jsonPath = join(__dirname, '..', 'data', 'music-library.json');
writeFileSync(jsonPath, output);

// Summary
const totalTracks = tracks.length;
const epTrackCount = tracks.filter(t => epFolders.some(f => f.id === t.folder_id)).length;
const genreTrackCount = tracks.filter(t => genreFolders.some(f => f.id === t.folder_id)).length;

console.log('=== Updated music-library.json ===');
console.log(`File: ${jsonPath}`);
console.log(`Size: ${(output.length / 1024).toFixed(1)} KB`);
console.log(`Structure:`);
console.log(`  SERGIK`);
console.log(`  ├── EPs (${epFolders.length} folders, ${epTrackCount} tracks)`);
epFolders.sort((a, b) => a.display_order - b.display_order).forEach(ep => {
  const ct = tracks.filter(t => t.folder_id === ep.id).length;
  console.log(`  │   ├── ${ep.name} (${ct} tracks)`);
});
console.log(`  └── Genre Collections (${genreFolders.length} folders, ${genreTrackCount} tracks)`);
genreFolders.sort((a, b) => a.display_order - b.display_order).forEach(g => {
  const ct = tracks.filter(t => t.folder_id === g.id).length;
  console.log(`      ├── ${g.name} (${ct} tracks)`);
});
console.log(`\nTotal: ${totalTracks} deduplicated tracks`);
