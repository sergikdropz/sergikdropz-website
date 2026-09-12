/**
 * Catalog list queries must never pull the whole `music_library_tracks.metadata`
 * jsonb. Analysis writers mirror `sonic_dna` and `waveform_data` into that blob,
 * so a full-column select detoasts megabytes per page and trips the Postgres
 * statement timeout. Select these aliased jsonb sub-fields instead and rebuild a
 * lean `metadata` object for the response.
 *
 * Per-track analysis stays on its own endpoints (`/api/audio/sonic-dna`,
 * `/api/audio/waveform`) and on the dedicated `sonic_dna` / `waveform` columns.
 */

/** PostgREST select fragment; pair with `catalogMetadataFromRow`. */
export const CATALOG_METADATA_SELECT = [
  'meta_original_date:metadata->original_date',
  'meta_original_date_source:metadata->original_date_source',
  'meta_original_date_export_path:metadata->original_date_export_path',
  'meta_catalog_overrides:metadata->catalog_overrides',
  'meta_primary_genre:metadata->primary_genre',
  'meta_genres:metadata->genres',
  'meta_key_signature:metadata->key_signature',
  'meta_album_artist:metadata->album_artist',
  'meta_references_all_tracks:metadata->referencesAllTracks',
  'meta_original_track_id:metadata->originalTrackId',
].join(',')

const ALIAS_TO_KEY: ReadonlyArray<readonly [string, string]> = [
  ['meta_original_date', 'original_date'],
  ['meta_original_date_source', 'original_date_source'],
  ['meta_original_date_export_path', 'original_date_export_path'],
  ['meta_catalog_overrides', 'catalog_overrides'],
  ['meta_primary_genre', 'primary_genre'],
  ['meta_genres', 'genres'],
  ['meta_key_signature', 'key_signature'],
  ['meta_album_artist', 'album_artist'],
  ['meta_references_all_tracks', 'referencesAllTracks'],
  ['meta_original_track_id', 'originalTrackId'],
]

/**
 * Rebuild the lean `metadata` object from a row selected with
 * `CATALOG_METADATA_SELECT`. Returns `undefined` when no sub-field is set so
 * tracks without catalog stamps stay absent rather than shipping `{}`.
 */
export function catalogMetadataFromRow(row: unknown): Record<string, unknown> | undefined {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const src = row as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [alias, key] of ALIAS_TO_KEY) {
    const value = src[alias]
    if (value != null) out[key] = value
  }
  return Object.keys(out).length ? out : undefined
}

/** Drop the alias columns so they don't leak into the response alongside `metadata`. */
export function stripCatalogMetadataAliases<T extends Record<string, unknown>>(row: T): T {
  for (const [alias] of ALIAS_TO_KEY) delete row[alias]
  return row
}
