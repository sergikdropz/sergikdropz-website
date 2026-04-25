# Music Library Admin - iTunes-Style Management Guide

## Overview

The Music Library Admin interface provides an iTunes-style hierarchical folder management system with drag-and-drop functionality, making it easy to organize your music library structure.

## Features

### 🎯 iTunes-Style Interface
- **Hierarchical Tree View**: Visual folder structure matching the frontend
- **Drag & Drop**: Move folders by dragging them to new parent folders
- **Expand/Collapse**: Click chevrons to expand or collapse folder trees
- **Visual Hierarchy**: Indented folders show parent-child relationships

### 📁 Folder Management
- **Create Folders**: Add new folders at any level
- **Edit Folders**: Update name, type, and hidden status
- **Delete Folders**: Remove folders (cascades to children and tracks)
- **Move to Root**: Quick button to move folders to root level
- **Search**: Filter folders by name

### 🎵 Track Management
- **View Tracks**: See all tracks in selected folder
- **Create Tracks**: Add new tracks to folders
- **Edit Tracks**: Update track metadata
- **Delete Tracks**: Remove tracks from folders

### 🔄 Sync & Refresh
- **Sync JSON to DB**: Import your JSON file to database
- **Refresh**: Reload data from database

## Access

Navigate to:
```
http://localhost:3000/admin/music-library
```

## Usage

### Viewing Folder Structure

1. **Left Sidebar**: Shows the complete folder hierarchy
2. **Expand Folders**: Click the chevron (▶/▼) to expand/collapse
3. **Select Folder**: Click a folder to view its details and tracks
4. **Search**: Type in the search box to filter folders

### Creating a Folder

1. Click the **+** button in the Library header
2. Fill in:
   - **ID**: Unique identifier (e.g., `folder-my-collection`)
   - **Name**: Display name
   - **Type**: Folder, Album, EP, or Single
   - **Parent Folder**: Select parent or leave as "Root"
   - **Hidden**: Check to hide from frontend
3. Click **Create**

### Moving Folders (Drag & Drop)

1. **Start Drag**: Click and hold the grip icon (⋮⋮) on a folder
2. **Drag Over**: Hover over the target folder (it will highlight)
3. **Drop**: Release to move the folder under the target

**Rules:**
- Cannot move folder into itself
- Cannot move folder into its own descendant
- Can move to root (no parent)

### Editing a Folder

1. Select a folder
2. Click **Edit** button
3. Modify:
   - Name
   - Type
   - Hidden status
4. Click **Save**

### Managing Tracks

1. **View Tracks**: Select a folder to see its tracks
2. **Add Track**: Click **Add Track** button
3. **Edit Track**: Click edit icon on a track
4. **Delete Track**: Click delete icon on a track

### Syncing Data

1. Click **Sync JSON to DB** button
2. Wait for sync to complete
3. View statistics (folders and tracks imported)

## Folder Hierarchy

The interface reflects the same structure as the frontend:

```
Discography (root)
├── All Tracks (295 tracks)
├── SERGIK EP Collection
│   ├── Are We Awake EP
│   ├── Daze EP
│   └── ...
├── Curated ID Playlists
│   └── ...
└── Collaborations
    └── ...
```

## Visual Indicators

- **Blue Folder Icon**: Regular folder
- **Yellow Folder Icon**: Hidden folder (not visible in frontend)
- **Folder Count**: Shows number of child folders
- **Track Count**: Shows number of tracks (including nested)
- **Selected Folder**: Highlighted in blue
- **Drag Over**: Highlighted with border when dragging

## Keyboard Shortcuts

- **Click**: Select folder
- **Double-click**: Expand/collapse (on chevron)
- **Drag**: Move folder (on grip icon)

## Tips

1. **Organize First**: Plan your folder structure before creating
2. **Use Hidden Folders**: Create hidden "father folders" for backend organization
3. **Sync Regularly**: Keep database in sync with JSON file
4. **Search**: Use search to quickly find folders in large libraries
5. **Move to Root**: Use "Move to Root" button for quick reorganization

## Troubleshooting

### Folders Not Showing
- Check if folders are hidden (yellow icon)
- Refresh the page
- Verify database connection

### Drag & Drop Not Working
- Make sure you're dragging from the grip icon (⋮⋮)
- Check browser console for errors
- Verify folder isn't trying to move into itself

### Sync Fails
- Check Supabase connection
- Verify environment variables
- Check server logs for errors

## API Endpoints Used

- `GET /api/music-library/folders` - List folders
- `POST /api/music-library/folders` - Create folder
- `PUT /api/music-library/folders` - Update folder
- `DELETE /api/music-library/folders` - Delete folder
- `POST /api/music-library/folders/move` - Move folder
- `GET /api/music-library/tracks` - List tracks
- `POST /api/music-library/tracks` - Create track
- `PUT /api/music-library/tracks` - Update track
- `DELETE /api/music-library/tracks` - Delete track
- `POST /api/music-library/sync` - Sync JSON to DB

## Best Practices

1. **Naming**: Use consistent naming (e.g., `folder-`, `album-`, `ep-`)
2. **Structure**: Keep hierarchy shallow (3-4 levels max)
3. **Hidden Folders**: Use for backend organization only
4. **Backup**: Export to JSON regularly
5. **Testing**: Test changes in admin before deploying

---

**Ready to organize your music library!** 🎵
