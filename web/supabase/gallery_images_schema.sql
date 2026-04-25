-- ============================================
-- GALLERY IMAGES TABLE
-- Source of truth for gallery images metadata
-- ============================================

CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Image identification
  image_id TEXT UNIQUE NOT NULL, -- Human-readable ID (e.g., "desert-portrait-1")
  filename TEXT NOT NULL, -- Original filename
  
  -- Image metadata
  src TEXT NOT NULL, -- Path or URL to image (e.g., "/images/gallery/desert-portrait-1.jpg" or Supabase Storage URL)
  alt TEXT NOT NULL, -- Alt text for accessibility
  category TEXT NOT NULL CHECK (category IN ('portrait', 'performance', 'studio', 'landscape')),
  description TEXT, -- Optional description
  
  -- Storage information
  storage_url TEXT, -- Full URL if stored in Supabase Storage
  storage_path TEXT, -- Path in Supabase Storage bucket
  is_stored_in_supabase BOOLEAN DEFAULT false, -- Whether image is in Supabase Storage or local
  
  -- Image properties
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT,
  mime_type TEXT, -- e.g., "image/jpeg"
  
  -- Ordering and visibility
  display_order INTEGER DEFAULT 0, -- For custom ordering
  is_active BOOLEAN DEFAULT true, -- Can be hidden without deleting
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Additional metadata
  metadata JSONB -- For any extra data
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gallery_images_category ON gallery_images(category);
CREATE INDEX IF NOT EXISTS idx_gallery_images_active ON gallery_images(is_active);
CREATE INDEX IF NOT EXISTS idx_gallery_images_display_order ON gallery_images(display_order);
CREATE INDEX IF NOT EXISTS idx_gallery_images_created_at ON gallery_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_images_image_id ON gallery_images(image_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gallery_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_gallery_images_updated_at
  BEFORE UPDATE ON gallery_images
  FOR EACH ROW
  EXECUTE FUNCTION update_gallery_images_updated_at();

-- Comments
COMMENT ON TABLE gallery_images IS 'Source of truth for gallery images metadata. Links frontend and backend to database.';
COMMENT ON COLUMN gallery_images.image_id IS 'Human-readable unique identifier (e.g., "desert-portrait-1")';
COMMENT ON COLUMN gallery_images.src IS 'Path or URL to image - can be local path or Supabase Storage URL';
COMMENT ON COLUMN gallery_images.storage_url IS 'Full public URL if stored in Supabase Storage';
COMMENT ON COLUMN gallery_images.is_stored_in_supabase IS 'True if image is in Supabase Storage, false if local file';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active images (public gallery)
CREATE POLICY "Public can view active gallery images"
  ON gallery_images
  FOR SELECT
  USING (is_active = true);

-- Policy: Only authenticated admins can insert
-- Note: This assumes you have an admin_users table or similar
-- Adjust the policy based on your auth setup
CREATE POLICY "Admins can insert gallery images"
  ON gallery_images
  FOR INSERT
  WITH CHECK (true); -- Adjust based on your auth setup

-- Policy: Only authenticated admins can update
CREATE POLICY "Admins can update gallery images"
  ON gallery_images
  FOR UPDATE
  USING (true); -- Adjust based on your auth setup

-- Policy: Only authenticated admins can delete
CREATE POLICY "Admins can delete gallery images"
  ON gallery_images
  FOR DELETE
  USING (true); -- Adjust based on your auth setup
