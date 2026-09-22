# Migrate & keep streams

Switch distributors (or bring DistroKid catalog into Release Studio) **without losing stream history**.

Based on the LANDR stream-continuity model: identical ISRCs + identical metadata + original masters + dual-live until DSPs merge → then takedown.

## Capture (pick one or both)

| Path | Where | Best for |
| --- | --- | --- |
| **DistroKid JSON** | Create → Import → DistroKid | Precision: UPC, albumuuid, artwork, store links, ISRCs |
| **Store URL** | Create → Import → Store URL | LANDR-style: paste Spotify / Apple Music album or track URL |

Both mark `previously_released`, reuse codes (no new QTA53 mint on import), and stamp `marketing_copy._stream_continuity`.

### DistroKid

See [DISTROKID_IMPORT.md](./DISTROKID_IMPORT.md).

### Store URL

1. Open `/studio/create?tab=import` → **Store URL**
2. Paste `https://open.spotify.com/album/…` or Apple Music album/track URL
3. **Dry run**, then **Import release**
4. Optional: Match Music Vault by title for provisional WAV

API: `POST /api/studio/releases/from-store-url` with `{ seedUrl, dryRun?, fillEmptyOnly?, matchVault? }`.

Requires Spotify client credentials for full Spotify ISRC pull; Apple/iTunes lookup works without keys. Odesli/song.link enriches store links when configured.

## Continuity checklist (on the release)

Delivery and Launch show **Migrate & keep streams**:

1. Catalog captured  
2. ISRC / UPC / store identity verified  
3. Original master WAVs attached  
4. Writers / producers / attestations complete  
5. Submitted to new distributor  
6. Dual-live overlap (expected — do not panic)  
7. DSPs merged to one release  
8. Safe to takedown old distributor  

API: `GET|PATCH /api/studio/releases/[id]/stream-continuity`

Go-live / distribute auto-marks `submitted_new` + `overlap_live` when `previously_released`.

## Hard gates

For previously released titles, DSP ingest blocks go-live until:

- Every track has the **existing** ISRC (do not mint QTA53 for switch)
- Every track has a **master WAV** (exact original — remasters will not merge)
- UPC or live store links present
- Takedown is not marked safe until merge is confirmed

## Operator sequence

1. Capture (DistroKid and/or Store URL)  
2. Attach original masters (vault match / replace WAV / DistroKid WAV ingest)  
3. Complete Rights + attestations  
4. Delivery → DSP Connect to confirm live links  
5. Go live / distribute on SERGIK (or aggregator when configured)  
6. Wait for Spotify/Apple merge (dual-live is normal)  
7. Check **merged confirmed** → **safe to takedown** → DistroKid takedown  

## Notes

- Revelator aggregator submit remains env-gated / mock until real credentials are wired; self go-live on SERGIK still stamps continuity.
- Prefer DistroKid JSON when you still have DistroKid access; use Store URL when you only have store links.
