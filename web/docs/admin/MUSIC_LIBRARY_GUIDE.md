# Music Library Vault Guide

Your website now has a comprehensive **Music Library Vault** for exclusive unreleased tracks, demos, and works-in-progress that aren't available on streaming services!

## Features

### 1. **Folder & Subfolder Organization**
- Organize music into folders (Albums, EPs, Singles, Remixes)
- Nested subfolders for detailed organization
- Visual folder tree with expand/collapse
- Support for Albums, EPs, Singles, and Remixes

### 2. **Playlist Management**
- Create custom playlists
- Add tracks from any folder to playlists
- Edit and delete playlists
- View playlist details (track count, duration)

### 3. **Global Music Player**
- Fixed bottom player that stays visible
- Queue management (play entire folders/playlists)
- Shuffle and repeat modes (off, all, one)
- Volume control
- Progress bar with seek functionality
- Previous/Next track navigation

### 4. **Queue System**
- View current queue
- See which track is playing
- Automatic progression through queue
- Loop back to start when queue ends

## How to Use

### Accessing the Music Library Vault

1. Go to the `/music` page
2. Click the "Music Library Vault" button in the top right
3. Or navigate directly to `/music-library`

### Organizing Unreleased Music

1. **Edit `web/data/music-library.json`** to add your unreleased music structure:
   ```json
   {
     "folders": [
       {
         "id": "folder-albums",
         "name": "Albums",
         "type": "folder",
         "parentId": null,
         "children": [
           {
             "id": "album-1",
             "name": "My Album",
             "type": "album",
             "year": 2025,
             "artwork": "/images/albums/my-album.jpg",
             "tracks": [
               {
                 "id": "track-1",
                 "title": "Track Name",
                 "artist": "SERGIK",
                 "duration": 240,
                 "file": "/audio/albums/my-album/track-1.mp3",
                 "artwork": "/images/albums/my-album.jpg"
               }
             ]
           }
         ]
       }
     ]
   }
   ```

### Creating Playlists

1. Click "Create Playlist" button
2. Enter playlist name and optional description
3. Click "Create"
4. Click "Edit" on the playlist to add tracks
5. Click "Add Tracks" to see available tracks
6. Click on any track to add it to the playlist

### Playing Music

1. **Play a single track**: Click on any track in the folder tree
2. **Play a folder/album**: Click on a folder or album to play all tracks
3. **Play a playlist**: Click the play button (▶) on any playlist
4. **Control playback**: Use the bottom player controls

### Player Controls

- **Play/Pause**: Center button
- **Previous/Next**: Skip tracks in queue
- **Shuffle**: Randomize playback order
- **Repeat**: 
  - Off: Stop at end of queue
  - All: Loop entire queue
  - One: Loop current track
- **Volume**: Adjust volume slider
- **Seek**: Click/drag on progress bar

## File Structure

Place your audio files in:
- `/web/public/audio/albums/` - Album tracks
- `/web/public/audio/eps/` - EP tracks
- `/web/public/audio/singles/` - Single tracks
- `/web/public/audio/remixes/` - Remix tracks

## Data Structure

### Track Object
```typescript
{
  id: string          // Unique track ID
  title: string       // Track title
  artist: string      // Artist name
  duration: number    // Duration in seconds
  file: string        // Path to audio file
  artwork?: string    // Optional artwork URL
}
```

### Folder/Album Object
```typescript
{
  id: string          // Unique ID
  name: string        // Display name
  type: 'folder' | 'album' | 'ep' | 'single' | 'remix'
  parentId: string | null
  children?: FolderItem[]  // Subfolders/albums
  tracks?: Track[]    // Direct tracks
  artwork?: string    // Cover art
  year?: number       // Release year
}
```

### Playlist Object
```typescript
{
  id: string          // Unique ID
  name: string        // Playlist name
  description?: string // Optional description
  artwork?: string    // Optional cover art
  trackIds: string[] // Array of track IDs
  createdAt: string   // ISO date string
}
```

## Tips

1. **Organize by Type**: Use folders to separate Albums, EPs, Singles, etc.
2. **Use Artwork**: Add artwork to folders/albums for better visual organization
3. **Create Themed Playlists**: Group related tracks into playlists
4. **Queue Management**: Play entire albums/folders to build a queue automatically
5. **Track Duration**: Make sure to include accurate duration for better UX

## Customization

### Styling
- All components use Tailwind CSS
- Colors match your existing dark theme
- Player is fixed at bottom with z-50

### Adding More Features
- The structure supports adding more folder types
- Easy to extend with search functionality
- Can add track metadata (genre, BPM, etc.)

## Troubleshooting

### Tracks not playing
- Check that audio files exist at specified paths
- Verify file paths in `music-library.json` match actual files
- Check browser console for errors

### Playlist not saving
- Playlists are stored in component state (client-side)
- For persistence, consider adding backend/database
- Currently resets on page refresh

### Folder not expanding
- Check that folder has `children` or `tracks` array
- Verify folder structure in JSON is valid

## Future Enhancements

Consider adding:
- Backend API for persistent playlists
- Search functionality
- Track metadata (genre, BPM, key)
- Sharing playlists
- Import/export playlists
- Last.fm scrobbling
- Equalizer
- Lyrics display

