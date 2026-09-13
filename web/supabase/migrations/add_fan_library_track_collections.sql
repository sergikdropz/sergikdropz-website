-- Per-fan wishlist, cart, and vault favorites (library track ids)
CREATE TABLE IF NOT EXISTS fan_library_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  library_track_id TEXT NOT NULL REFERENCES music_library_tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, library_track_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_library_wishlist_user ON fan_library_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_fan_library_wishlist_track ON fan_library_wishlist(library_track_id);

CREATE TABLE IF NOT EXISTS fan_library_cart (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  library_track_id TEXT NOT NULL REFERENCES music_library_tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, library_track_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_library_cart_user ON fan_library_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_fan_library_cart_track ON fan_library_cart(library_track_id);

CREATE TABLE IF NOT EXISTS fan_vault_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  library_track_id TEXT NOT NULL REFERENCES music_library_tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, library_track_id)
);

CREATE INDEX IF NOT EXISTS idx_fan_vault_favorites_user ON fan_vault_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_fan_vault_favorites_track ON fan_vault_favorites(library_track_id);

ALTER TABLE fan_library_wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_library_cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_vault_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fan_library_wishlist_own"
  ON fan_library_wishlist FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "fan_library_cart_own"
  ON fan_library_cart FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "fan_vault_favorites_own"
  ON fan_vault_favorites FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE fan_library_wishlist IS 'Signed-in fan wishlist for music library tracks';
COMMENT ON TABLE fan_library_cart IS 'Signed-in fan cart (library tracks) before checkout';
COMMENT ON TABLE fan_vault_favorites IS 'Signed-in fan favorites inside the music vault';
