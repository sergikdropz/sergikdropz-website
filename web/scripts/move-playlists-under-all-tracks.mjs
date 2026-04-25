import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..', '..')
const dataFile = join(rootDir, 'web', 'data', 'music-library.json')

async function moveFoldersUnderAllTracks() {
  console.log('🔄 Moving playlists under "All Tracks"...\n')

  // Folders to move
  const foldersToMove = [
    'folder-playlists',    // Curated ID Playlists
    'artist-sergik'        // SERGIK EP Collection
  ]

  // Update JSON file
  console.log('📝 Updating JSON file...')
  const data = JSON.parse(readFileSync(dataFile, 'utf8'))
  
  const findFolder = (items, id) => {
    for (const item of items) {
      if (item.id === id) return { item, items }
      if (item.children) {
        const found = findFolder(item.children, id)
        if (found) return found
      }
    }
    return null
  }

  const discography = data.folders.find(f => f.id === 'folder-discography')
  if (!discography) {
    console.error('❌ Discography folder not found!')
    return
  }

  const allTracks = discography.children?.find(c => c.id === 'folder-all-tracks')
  if (!allTracks) {
    console.error('❌ "All Tracks" folder not found!')
    return
  }

  // Initialize children if needed
  if (!allTracks.children) {
    allTracks.children = []
  }

  // Move folders
  for (const folderId of foldersToMove) {
    const found = findFolder(discography.children || [], folderId)
    if (found) {
      // Remove from current location
      const index = found.items.findIndex(f => f.id === folderId)
      if (index !== -1) {
        const folder = found.items.splice(index, 1)[0]
        folder.parentId = 'folder-all-tracks'
        
        // Add to All Tracks children
        allTracks.children.push(folder)
        console.log(`   ✅ Moved "${folder.name}" to "All Tracks" in JSON`)
      }
    }
  }

  writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8')
  console.log('\n✅ JSON file reorganization complete!')
  console.log('\n💡 Next steps:')
  console.log('   1. Use the "Sync" button in /admin/music to sync JSON to database')
  console.log('   2. Or run: node web/scripts/ensure-all-tracks-complete.mjs to clean up duplicates')
}

moveFoldersUnderAllTracks().catch(console.error)
