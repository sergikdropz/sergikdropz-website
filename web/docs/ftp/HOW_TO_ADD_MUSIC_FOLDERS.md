# How to Add Music Folders to the Vault

There are **two places** you need to work with to add music folders:

## 1. Physical File Structure (Where Audio Files Go)

Create folders in `/web/public/audio/` for your actual audio files:

```
web/public/audio/
├── demos/                    # Demo tracks
│   └── demo-1.mp3
├── unreleased/
│   ├── eps/
│   │   └── ep-2025/
│   │       └── track-1.mp3
│   ├── singles/
│   │   └── single-2025.mp3
│   └── remixes/
│       └── remix-2025.mp3
└── [your-custom-folder]/     # Create your own folders here
    └── your-track.mp3
```

### Example: Adding a New Folder

If you want to add a "Live Sessions" folder:

1. **Create the physical folder:**
   ```bash
   mkdir -p web/public/audio/live-sessions
   ```

2. **Add your audio files:**
   ```
   web/public/audio/live-sessions/
   ├── session-1.mp3
   ├── session-2.mp3
   └── session-3.mp3
   ```

## 2. JSON Data File (Where Folder Structure is Defined)

Edit `/web/data/music-library.json` to add your folder structure:

### Current Structure:
```json
{
  "folders": [
    {
      "id": "folder-demos",
      "name": "Demos & Works in Progress",
      "type": "folder",
      "parentId": null,
      "children": [...]
    }
  ]
}
```

### Adding a New Folder:

**Example: Adding "Live Sessions" folder**

```json
{
  "folders": [
    {
      "id": "folder-demos",
      "name": "Demos & Works in Progress",
      "type": "folder",
      "parentId": null,
      "children": [...]
    },
    {
      "id": "folder-live-sessions",
      "name": "Live Sessions",
      "type": "folder",
      "parentId": null,
      "children": [
        {
          "id": "live-session-2025",
          "name": "Live Session 2025",
          "type": "album",
          "year": 2025,
          "artwork": "/images/live/session-2025.jpg",
          "tracks": [
            {
              "id": "live-track-1",
              "title": "Live Track 1",
              "artist": "SERGIK",
              "duration": 300,
              "file": "/audio/live-sessions/session-1.mp3",
              "artwork": "/images/live/session-2025.jpg"
            },
            {
              "id": "live-track-2",
              "title": "Live Track 2",
              "artist": "SERGIK",
              "duration": 280,
              "file": "/audio/live-sessions/session-2.mp3",
              "artwork": "/images/live/session-2025.jpg"
            }
          ]
        }
      ]
    }
  ]
}
```

## Step-by-Step Guide

### Step 1: Create Physical Folders
```bash
# Navigate to your project
cd "/Users/machd/Documents/SERGIK Web and app/web/public/audio"

# Create your folder structure
mkdir -p my-new-folder/subfolder
```

### Step 2: Add Audio Files
Place your `.mp3`, `.wav`, or other audio files in the folders you created.

### Step 3: Add Artwork (Optional)
Place artwork images in `/web/public/images/`:
```
web/public/images/
├── demos/
├── unreleased/
└── [your-folder]/
    └── artwork.jpg
```

### Step 4: Update JSON File
Edit `web/data/music-library.json` and add your folder structure following the format above.

## Folder Types

You can use these types for your collections:
- `"folder"` - Main category folder
- `"album"` - Full album
- `"ep"` - Extended play
- `"single"` - Single track release
- `"remix"` - Remix collection

## File Path Format

When referencing files in JSON, use paths relative to `/public`:

✅ **Correct:**
```json
"file": "/audio/demos/demo-1.mp3"
"artwork": "/images/demos/demo-1.jpg"
```

❌ **Wrong:**
```json
"file": "audio/demos/demo-1.mp3"  // Missing leading slash
"file": "/public/audio/demos/demo-1.mp3"  // Don't include /public
```

## Quick Example: Adding a Complete Folder

Let's say you want to add "Studio Sessions":

1. **Create folder:**
   ```bash
   mkdir -p web/public/audio/studio-sessions
   ```

2. **Add files:**
   - `web/public/audio/studio-sessions/take-1.mp3`
   - `web/public/audio/studio-sessions/take-2.mp3`

3. **Add artwork:**
   - `web/public/images/studio/session-cover.jpg`

4. **Update JSON** (`web/data/music-library.json`):
   ```json
   {
     "folders": [
       // ... existing folders ...
       {
         "id": "folder-studio-sessions",
         "name": "Studio Sessions",
         "type": "folder",
         "parentId": null,
         "children": [
           {
             "id": "studio-session-jan-2025",
             "name": "January 2025 Session",
             "type": "album",
             "year": 2025,
             "artwork": "/images/studio/session-cover.jpg",
             "tracks": [
               {
                 "id": "studio-take-1",
                 "title": "Take 1",
                 "artist": "SERGIK",
                 "duration": 240,
                 "file": "/audio/studio-sessions/take-1.mp3",
                 "artwork": "/images/studio/session-cover.jpg"
               },
               {
                 "id": "studio-take-2",
                 "title": "Take 2",
                 "artist": "SERGIK",
                 "duration": 220,
                 "file": "/audio/studio-sessions/take-2.mp3",
                 "artwork": "/images/studio/session-cover.jpg"
               }
             ]
           }
         ]
       }
     ]
   }
   ```

## Tips

1. **Keep IDs unique** - Use descriptive IDs like `"folder-my-name"` or `"track-unique-id"`
2. **Match file paths** - Make sure the `file` path in JSON matches where you actually put the file
3. **Duration in seconds** - The `duration` field should be the track length in seconds (e.g., 240 = 4 minutes)
4. **Artwork is optional** - You can omit the `artwork` field if you don't have cover art
5. **Nested folders** - You can create subfolders by adding `children` arrays

## Current Folder Structure

Based on your current setup, you have:
- `/web/public/audio/unreleased/` - For unreleased tracks
- `/web/public/audio/demos/` - For demo tracks (create if needed)
- `/web/public/audio/unreleased/eps/` - For unreleased EPs
- `/web/public/audio/unreleased/singles/` - For unreleased singles
- `/web/public/audio/unreleased/remixes/` - For exclusive remixes

You can add any new folders you want following the same pattern!

