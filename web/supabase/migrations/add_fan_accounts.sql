-- Fan accounts: profiles, personal playlists, purchase linkage
-- Run in Supabase SQL Editor or via migration tooling
-- ============================================
-- FAN PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS fan_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fan_profiles_created_at ON fan_profiles(created_at DESC);

-- ============================================
-- FAN PLAYLISTS (references public music library track ids)
-- ============================================
CREATE TABLE IF NOT EXISTS fan_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fan_playlists_user_id ON fan_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_fan_playlists_user_updated ON fan_playlists(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fan_playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES fan_playlists(id) ON DELETE CASCADE,
  library_track_id TEXT NOT NULL REFERENCES music_library_tracks(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (playlist_id, library_track_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_playlist_tracks_playlist ON fan_playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_fan_playlist_tracks_playlist_position ON fan_playlist_tracks(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_fan_playlist_tracks_track ON fan_playlist_tracks(library_track_id);

-- ============================================
-- PURCHASES / MERCH: link to Supabase auth user
-- ============================================
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);

ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_merch_orders_user_id ON merch_orders(user_id);

-- ============================================
-- RLS (for future direct client access; API uses service role today)
-- ============================================
ALTER TABLE fan_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fan_profiles_select_own"
  ON fan_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "fan_profiles_update_own"
  ON fan_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "fan_profiles_insert_own"
  ON fan_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

ALTER TABLE fan_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fan_playlists_select_own"
  ON fan_playlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "fan_playlists_insert_own"
  ON fan_playlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fan_playlists_update_own"
  ON fan_playlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "fan_playlists_delete_own"
  ON fan_playlists FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE fan_playlist_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fan_playlist_tracks_select"
  ON fan_playlist_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fan_playlists fp
      WHERE fp.id = fan_playlist_tracks.playlist_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY "fan_playlist_tracks_insert"
  ON fan_playlist_tracks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fan_playlists fp
      WHERE fp.id = playlist_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY "fan_playlist_tracks_update"
  ON fan_playlist_tracks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM fan_playlists fp
      WHERE fp.id = fan_playlist_tracks.playlist_id
        AND fp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fan_playlists fp
      WHERE fp.id = playlist_id
        AND fp.user_id = auth.uid()
    )
  );

CREATE POLICY "fan_playlist_tracks_delete"
  ON fan_playlist_tracks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM fan_playlists fp
      WHERE fp.id = fan_playlist_tracks.playlist_id
        AND fp.user_id = auth.uid()
    )
  );

-- Purchases: allow read by linked user id (in addition to existing email policy)
DROP POLICY IF EXISTS "Users can view own purchases by user id" ON purchases;
CREATE POLICY "Users can view own purchases by user id"
  ON purchases FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE fan_playlists IS 'Per-fan playlists referencing music_library_tracks ids';
COMMENT ON COLUMN purchases.user_id IS 'Supabase auth user when checkout was signed in';
COMMENT ON COLUMN merch_orders.user_id IS 'Supabase auth user when checkout was signed in';
