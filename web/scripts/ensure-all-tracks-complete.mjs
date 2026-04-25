import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function ensureAllTracksComplete() {
  console.log('🔄 Ensuring "All Tracks" has all unique tracks...\n')

  // Get all tracks
  const { data: allTracks, error } = await supabase
    .from('music_library_tracks')
    .select('*')

  if (error) {
    console.error('❌ Error fetching tracks:', error)
    return
  }

  // Get tracks in "All Tracks"
  const allTracksFolderTracks = allTracks.filter(t => t.folder_id === 'folder-all-tracks')
  
  // Get tracks in subfolders of "All Tracks"
  const { data: subfolders } = await supabase
    .from('music_library_folders')
    .select('id')
    .eq('parent_id', 'folder-all-tracks')

  const subfolderIds = subfolders?.map(f => f.id) || []
  const subfolderTracks = allTracks.filter(t => subfolderIds.includes(t.folder_id))

  // Find unique tracks by title + artist
  const uniqueTracks = new Map()
  allTracks.forEach(track => {
    const key = `${track.title}-${track.artist}`
    if (!uniqueTracks.has(key)) {
      uniqueTracks.set(key, track)
    }
  })

  // Find tracks missing from "All Tracks"
  const missingTracks = []
  uniqueTracks.forEach((track, key) => {
    const inAllTracks = allTracksFolderTracks.some(t => 
      t.title === track.title && t.artist === track.artist
    )
    if (!inAllTracks) {
      missingTracks.push(track)
    }
  })

  if (missingTracks.length > 0) {
    console.log(`📊 Found ${missingTracks.length} tracks missing from "All Tracks"`)
    
    // Add missing tracks to "All Tracks"
    for (const track of missingTracks) {
      const trackData = {
        id: track.id.startsWith('track-') ? track.id : `track-${track.id}`,
        folder_id: 'folder-all-tracks',
        audio_file_id: track.audio_file_id,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        file_url: track.file_url,
        artwork_url: track.artwork_url,
        bpm: track.bpm,
        key_signature: track.key_signature,
        sonic_dna: track.sonic_dna,
        waveform: track.waveform,
        energy_level: track.energy_level,
        danceability: track.danceability,
        created_at: track.created_at,
        date: track.date,
        year: track.year,
        display_order: 0,
        metadata: {}
      }

      const { error: insertError } = await supabase
        .from('music_library_tracks')
        .upsert(trackData, { onConflict: 'id' })

      if (insertError) {
        console.error(`   ❌ Error adding "${track.title}":`, insertError.message)
      } else {
        console.log(`   ✅ Added "${track.title}" to "All Tracks"`)
      }
    }
  } else {
    console.log('✅ All unique tracks are already in "All Tracks"')
  }

  // Remove duplicates within "All Tracks" (keep first occurrence)
  console.log('\n🔄 Checking for duplicates in "All Tracks"...')
  const duplicates = new Map()
  allTracksFolderTracks.forEach(track => {
    const key = `${track.title}-${track.artist}`
    if (!duplicates.has(key)) {
      duplicates.set(key, [track])
    } else {
      duplicates.get(key).push(track)
    }
  })

  let removedCount = 0
  for (const [key, tracks] of duplicates.entries()) {
    if (tracks.length > 1) {
      // Keep first, remove others
      const toKeep = tracks[0]
      const toRemove = tracks.slice(1)
      
      for (const track of toRemove) {
        const { error: deleteError } = await supabase
          .from('music_library_tracks')
          .delete()
          .eq('id', track.id)

        if (!deleteError) {
          removedCount++
          console.log(`   ✅ Removed duplicate: "${track.title}"`)
        }
      }
    }
  }

  if (removedCount > 0) {
    console.log(`\n✅ Removed ${removedCount} duplicate tracks from "All Tracks"`)
  } else {
    console.log('✅ No duplicates found in "All Tracks"')
  }

  console.log('\n✅ Cleanup complete!')
}

ensureAllTracksComplete().catch(console.error)
