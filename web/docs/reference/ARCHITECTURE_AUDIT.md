# End-to-End Architecture Audit
## Music Library System - Complete Wiring Analysis

**Date**: 2025-01-XX  
**Purpose**: Identify all misconnections, field mismatches, and architectural issues between front-end, admin, API, and database

---

## 🔴 CRITICAL ISSUES

### 1. **Front-End Completely Disconnected from Database**

**Location**: `web/app/music-library/page.tsx`

**Problem**:
- Front-end imports JSON file directly: `import musicLibraryData from '@/data/music-library.json'`
- Line 116: Extracts tracks directly from JSON: `extractTracks(musicLibraryData.folders as FolderItem[])`
- Line 70: Playlists loaded from JSON: `musicLibraryData.playlists`
- **NO API CALLS** - Front-end never calls `/api/music-library/*` endpoints
- Changes in admin/database are NOT reflected in front-end

**Impact**: 
- Front-end shows stale data from JSON file
- Admin changes don't appear in front-end
- Two separate data sources (JSON vs Database)

**Fix Required**:
- Replace JSON import with API calls using `fetchMusicLibrary()` from `musicLibraryApi.ts`
- Use `fetchFolders()` and `fetchTracks()` instead of extracting from JSON
- Ensure `NEXT_PUBLIC_USE_MUSIC_LIBRARY_API=true` is set

---

### 2. **Field Name Mismatch: API Returns Wrong Format**

**Location**: `web/app/api/music-library/tracks/route.ts` (lines 27-48)

**Problem**:
- API returns **camelCase** fields: `keySignature`, `sonicDna`, `energyLevel`, `createdAt`, `displayOrder`
- Front-end expects **snake_case** fields: `key_signature`, `sonic_dna`, `energy_level`, `created_at`
- Front-end Track interface (line 23-24) expects: `key_signature?: string`, `sonic_dna?: any`

**Current API Response**:
```typescript
{
  keySignature: track.key_signature,  // ❌ WRONG - should be key_signature
  sonicDna: track.sonic_dna,          // ❌ WRONG - should be sonic_dna
  energyLevel: track.energy_level,   // ❌ WRONG - should be energy_level
  createdAt: track.created_at,        // ❌ WRONG - should be created_at
  displayOrder: track.display_order    // ❌ WRONG - should be display_order
}
```

**Expected Format** (matching front-end):
```typescript
{
  key_signature: track.key_signature,
  sonic_dna: track.sonic_dna,
  energy_level: track.energy_level,
  created_at: track.created_at,
  display_order: track.display_order
}
```

**Inconsistency**:
- `/api/music-library/sync` GET route (line 205) correctly returns `key_signature` (snake_case)
- `/api/music-library/tracks` GET route (line 38) incorrectly returns `keySignature` (camelCase)

**Impact**:
- If front-end switches to API, `track.key_signature` will be `undefined`
- Sonic DNA won't display correctly
- Sorting/filtering by key won't work

**Fix Required**:
- Update `/api/music-library/tracks/route.ts` to return snake_case field names
- OR update front-end Track interface to use camelCase (but this breaks JSON compatibility)

---

### 3. **Admin Uses API, Front-End Uses JSON - Not in Sync**

**Location**: 
- Admin: `web/app/admin/music-library/page.tsx` (line 48-56)
- Front-end: `web/app/music-library/page.tsx` (line 10, 116)

**Problem**:
- **Admin** calls: `fetchMusicLibrary()`, `fetchFolders()`, `fetchTracks()` → Uses API/Database
- **Front-end** imports: `musicLibraryData` from JSON → Uses static file
- They show **different data** - not synchronized

**Impact**:
- Admin makes changes → Database updates
- Front-end still shows old JSON data
- Users see outdated information

**Fix Required**:
- Make front-end use same API calls as admin
- Remove JSON import from front-end
- Ensure both use database as single source of truth

---

### 4. **Playlists Only in JSON - No Database Table**

**Location**: 
- JSON: `web/data/music-library.json` (line 11443-11451)
- Front-end: `web/app/music-library/page.tsx` (line 70)
- API: `web/app/api/music-library/sync/route.ts` (line 220) - returns empty array

**Problem**:
- Playlists exist only in JSON file
- No `music_library_playlists` table in database
- API sync route returns `playlists: []` (line 220)
- Admin cannot manage playlists via database

**Impact**:
- Playlists can't be created/edited in admin
- Playlists not synced to database
- No way to manage playlists through API

**Fix Required**:
- Create `music_library_playlists` table in Supabase
- Add playlist CRUD API endpoints
- Update sync route to handle playlists
- Add playlist management to admin

---

### 5. **API Field Mapping Inconsistencies**

**Location**: `web/app/api/music-library/tracks/route.ts`

**Problem**: Mixed naming conventions

**Current Mapping** (lines 28-48):
```typescript
{
  // ✅ Correct (matches front-end)
  id: track.id,
  title: track.title,
  artist: track.artist,
  duration: track.duration,
  file: track.file_url,           // ✅ Correct mapping
  artwork: track.artwork_url,     // ✅ Correct mapping
  bpm: track.bpm,
  date: track.date,
  year: track.year,
  
  // ❌ WRONG - camelCase but front-end expects snake_case
  folderId: track.folder_id,      // Should be folder_id?
  audioFileId: track.audio_file_id, // Should be audio_file_id?
  keySignature: track.key_signature,  // Should be key_signature
  sonicDna: track.sonic_dna,         // Should be sonic_dna
  energyLevel: track.energy_level,   // Should be energy_level
  createdAt: track.created_at,        // Should be created_at
  displayOrder: track.display_order   // Should be display_order
}
```

**Front-End Track Interface** (line 15-28):
```typescript
interface Track {
  id: string
  title: string
  artist: string
  duration: number
  file: string
  artwork?: string
  bpm?: number
  key_signature?: string    // ✅ Expects snake_case
  sonic_dna?: any           // ✅ Expects snake_case
  created_at?: string        // ✅ Expects snake_case
  date?: string
  year?: number
  // Missing: folderId, audioFileId, energyLevel, displayOrder
}
```

**Impact**:
- Field name mismatches cause undefined values
- Missing fields not available in front-end
- Inconsistent data structure

---

### 6. **USE_API Flag Not Set - API Disabled by Default**

**Location**: `web/utils/musicLibraryApi.ts` (line 45)

**Problem**:
```typescript
const USE_API = process.env.NEXT_PUBLIC_USE_MUSIC_LIBRARY_API === 'true'
```

- Defaults to `false` if env var not set
- Admin uses API functions but they fall back to JSON if flag is false
- No clear indication if API is enabled

**Impact**:
- Admin might be using JSON fallback without knowing
- Inconsistent behavior based on environment

**Fix Required**:
- Set `NEXT_PUBLIC_USE_MUSIC_LIBRARY_API=true` in `.env.local`
- OR force API usage in admin (bypass the flag)
- Add logging to show which mode is active

---

## 🟡 MEDIUM ISSUES

### 7. **Folder API Returns Database Format, Not Front-End Format**

**Location**: `web/app/api/music-library/folders/route.ts` (line 35)

**Problem**:
- Returns raw database fields: `parent_id`, `artwork_url`, `display_order`
- Front-end expects: `parentId`, `artwork`, `displayOrder` (camelCase) OR `parent_id`, `artwork`, `display_order` (snake_case)
- Inconsistent with tracks API

**Current Response**:
```typescript
{
  id: folder.id,
  name: folder.name,
  type: folder.type,
  parent_id: folder.parent_id,      // ❌ Should be parentId or parentId?
  artwork_url: folder.artwork_url,  // ❌ Should be artwork or artwork_url?
  display_order: folder.display_order, // ❌ Should be displayOrder?
  hidden: folder.hidden,
  year: folder.year
}
```

**Fix Required**:
- Map database fields to front-end format consistently
- Decide on naming convention (camelCase vs snake_case) and stick to it

---

### 8. **Sync Route GET vs Tracks Route GET - Different Formats**

**Location**: 
- `web/app/api/music-library/sync/route.ts` (line 197-213)
- `web/app/api/music-library/tracks/route.ts` (line 28-48)

**Problem**:
- **Sync route** returns snake_case: `key_signature`, `sonic_dna`, `energy_level`, `created_at`
- **Tracks route** returns camelCase: `keySignature`, `sonicDna`, `energyLevel`, `createdAt`
- Same data, different formats

**Impact**:
- `fetchMusicLibrary()` (uses sync route) returns one format
- `fetchTracks()` (uses tracks route) returns different format
- Incompatible data structures

**Fix Required**:
- Standardize on one format (prefer snake_case to match front-end)
- Update tracks route to match sync route format

---

### 9. **No Real-Time Sync Between Admin and Front-End**

**Problem**:
- Admin changes database
- Front-end doesn't know about changes
- Requires manual refresh or page reload
- No WebSocket/SSE for real-time updates

**Impact**:
- Stale data in front-end
- Poor user experience

**Fix Required**:
- Add real-time subscriptions (Supabase Realtime)
- OR add refresh mechanism
- OR make front-end use API with polling

---

### 10. **Missing Audio File Linking in Front-End**

**Location**: `web/app/music-library/page.tsx`

**Problem**:
- Front-end tracks don't have `audioFileId` field
- Can't link to `audio_files` table
- No way to access full audio metadata from front-end

**Impact**:
- Limited track information
- Can't access waveform, frequency bands, etc. from front-end

---

## 🟢 MINOR ISSUES

### 11. **PlaylistManager Component Not Connected to Database**

**Location**: `web/components/PlaylistManager.tsx`

**Problem**:
- PlaylistManager receives playlists as props
- No API endpoints for playlist CRUD
- Playlists only stored in JSON

**Fix Required**:
- Create playlist API endpoints
- Add database table
- Connect PlaylistManager to API

---

### 12. **SonicDNA Component May Not Work with API Data**

**Location**: `web/components/SonicDNA.tsx`

**Problem**:
- Expects `sonic_dna` field (snake_case)
- API returns `sonicDna` (camelCase) if using tracks route
- May cause undefined errors

**Fix Required**:
- Ensure consistent field naming
- Update API to return `sonic_dna`

---

## 📊 DATA FLOW DIAGRAM

### Current (Broken) Flow:

```
┌─────────────────┐
│   Front-End     │
│ music-library/  │
└────────┬────────┘
         │
         │ ❌ Direct JSON Import
         ▼
┌─────────────────┐
│ music-library   │
│    .json        │
└─────────────────┘

┌─────────────────┐
│   Admin         │
│ admin/music/    │
└────────┬────────┘
         │
         │ ✅ API Calls
         ▼
┌─────────────────┐      ┌─────────────────┐
│ musicLibraryApi │─────▶│  API Routes      │
│     .ts         │      │  /api/music-*    │
└─────────────────┘      └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   Supabase DB   │
                          │ music_library_* │
                          └─────────────────┘
```

**Problem**: Front-end and Admin use different data sources!

---

### Desired (Fixed) Flow:

```
┌─────────────────┐      ┌─────────────────┐
│   Front-End     │      │   Admin         │
│ music-library/  │      │ admin/music/    │
└────────┬────────┘      └────────┬────────┘
         │                         │
         │ ✅ API Calls            │ ✅ API Calls
         │                         │
         └──────────┬──────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ musicLibraryApi   │
         │      .ts          │
         └────────┬──────────┘
                   │
                   ▼
         ┌──────────────────┐
         │   API Routes      │
         │  /api/music-*     │
         └────────┬──────────┘
                   │
                   ▼
         ┌──────────────────┐
         │   Supabase DB    │
         │ music_library_*  │
         └──────────────────┘
```

---

## 🔧 FIXES REQUIRED (Priority Order)

### Priority 1: Critical - Fix Field Name Mismatches

**File**: `web/app/api/music-library/tracks/route.ts`

**Change** (lines 38-47):
```typescript
// BEFORE (WRONG):
keySignature: track.key_signature,
sonicDna: track.sonic_dna,
energyLevel: track.energy_level,
createdAt: track.created_at,
displayOrder: track.display_order,

// AFTER (CORRECT):
key_signature: track.key_signature,
sonic_dna: track.sonic_dna,
energy_level: track.energy_level,
created_at: track.created_at,
display_order: track.display_order,
```

---

### Priority 2: Critical - Connect Front-End to Database

**File**: `web/app/music-library/page.tsx`

**Changes**:
1. Remove line 10: `import musicLibraryData from '@/data/music-library.json'`
2. Add API calls:
```typescript
const [libraryData, setLibraryData] = useState<MusicLibraryData | null>(null)

useEffect(() => {
  const loadData = async () => {
    const data = await fetchMusicLibrary()
    setLibraryData(data)
  }
  loadData()
}, [])
```

3. Replace line 116:
```typescript
// BEFORE:
extractTracks(musicLibraryData.folders as FolderItem[])

// AFTER:
extractTracks(libraryData?.folders || [])
```

4. Replace line 70:
```typescript
// BEFORE:
const [playlists, setPlaylists] = useState<Playlist[]>(musicLibraryData.playlists as Playlist[])

// AFTER:
const [playlists, setPlaylists] = useState<Playlist[]>(libraryData?.playlists || [])
```

---

### Priority 3: High - Create Playlist Database Table

**File**: `web/supabase/music_library_schema.sql` (new section)

**Add**:
```sql
CREATE TABLE IF NOT EXISTS music_library_playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  artwork_url TEXT,
  track_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Add API endpoints**: `/api/music-library/playlists/route.ts`

---

### Priority 4: High - Standardize Field Naming

**Decision Required**: Choose one convention:
- **Option A**: snake_case everywhere (matches front-end, JSON, database)
- **Option B**: camelCase everywhere (matches JavaScript conventions)

**Recommendation**: **snake_case** because:
- Front-end already uses it
- Database uses it
- JSON uses it
- Less refactoring needed

**Files to Update**:
- `web/app/api/music-library/tracks/route.ts` - Change camelCase to snake_case
- `web/app/api/music-library/folders/route.ts` - Ensure consistency
- `web/utils/musicLibraryApi.ts` - Update Track interface if needed

---

### Priority 5: Medium - Force API Usage in Admin

**File**: `web/utils/musicLibraryApi.ts`

**Change** (line 45):
```typescript
// BEFORE:
const USE_API = process.env.NEXT_PUBLIC_USE_MUSIC_LIBRARY_API === 'true'

// AFTER (for admin):
const USE_API = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  ? true  // Always use API in admin
  : process.env.NEXT_PUBLIC_USE_MUSIC_LIBRARY_API === 'true'
```

---

### Priority 6: Medium - Add Environment Variable Check

**File**: `.env.local` (create if missing)

**Add**:
```
NEXT_PUBLIC_USE_MUSIC_LIBRARY_API=true
```

---

## 📋 FIELD MAPPING REFERENCE

### Database → API → Front-End

| Database Field | API Response (Current) | Front-End Expects | Status |
|----------------|------------------------|-------------------|--------|
| `folder_id` | `folderId` | `folderId`? | ⚠️ Inconsistent |
| `audio_file_id` | `audioFileId` | Missing | ❌ Not in front-end |
| `file_url` | `file` | `file` | ✅ Correct |
| `artwork_url` | `artwork` | `artwork` | ✅ Correct |
| `key_signature` | `keySignature` | `key_signature` | ❌ Mismatch |
| `sonic_dna` | `sonicDna` | `sonic_dna` | ❌ Mismatch |
| `energy_level` | `energyLevel` | Missing | ❌ Not in front-end |
| `created_at` | `createdAt` | `created_at` | ❌ Mismatch |
| `display_order` | `displayOrder` | Missing | ❌ Not in front-end |

---

## 🔗 MISSING CONNECTIONS

1. **Front-End ↔ Database**: ❌ No connection (uses JSON)
2. **Front-End ↔ API**: ❌ No API calls
3. **Playlists ↔ Database**: ❌ No table exists
4. **Playlists ↔ API**: ❌ No endpoints exist
5. **Audio Files ↔ Music Library**: ⚠️ Partial (linking exists but not used in front-end)

---

## ✅ WHAT'S WORKING

1. **Admin ↔ Database**: ✅ Working (uses API)
2. **Admin ↔ API Routes**: ✅ Working
3. **API Routes ↔ Database**: ✅ Working
4. **Folder Hierarchy**: ✅ Working (buildFolderHierarchy utility)
5. **Track Linking**: ✅ Working (link-tracks API exists)

---

## 🎯 RECOMMENDED ACTION PLAN

1. **Fix hooks error** ✅ (Already done)
2. **Fix field name mismatches** in tracks API route
3. **Connect front-end to database** (replace JSON import with API)
4. **Create playlist database table** and API endpoints
5. **Standardize field naming** across all APIs
6. **Add environment variable** for API usage
7. **Test end-to-end** flow: Admin → Database → Front-End

---

## 📝 NOTES

- The `musicLibraryApi.ts` utility has fallback logic, but front-end doesn't use it
- Admin page uses the utility correctly
- Sync route correctly exports database to JSON format
- Need to decide on single source of truth: Database (recommended) or JSON

---

**Next Steps**: 
1. Fix field name mismatches
2. Connect front-end to API
3. Create playlist database support
4. Test complete flow
