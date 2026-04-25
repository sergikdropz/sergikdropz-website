-- Migration: Add Instagram media table
-- Stores scraped Instagram post metadata including video/image URLs

CREATE TABLE IF NOT EXISTS instagram_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_url TEXT UNIQUE NOT NULL,
  permalink TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL, -- Direct URL to media (image or video)
  thumbnail_url TEXT, -- Thumbnail for videos
  video_url TEXT, -- Direct video URL if type is video
  caption TEXT,
  username TEXT,
  post_id TEXT, -- Instagram post ID extracted from URL
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER, -- For videos
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB, -- Additional metadata (likes, comments, etc.)
  is_active BOOLEAN DEFAULT true,
  error_message TEXT -- If scraping failed
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_instagram_media_post_url ON instagram_media(post_url);
CREATE INDEX IF NOT EXISTS idx_instagram_media_username ON instagram_media(username);
CREATE INDEX IF NOT EXISTS idx_instagram_media_type ON instagram_media(media_type);
CREATE INDEX IF NOT EXISTS idx_instagram_media_active ON instagram_media(is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_media_scraped_at ON instagram_media(scraped_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_instagram_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_instagram_media_updated_at
  BEFORE UPDATE ON instagram_media
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_media_updated_at();

-- Comments
COMMENT ON TABLE instagram_media IS 'Stores scraped Instagram post metadata including direct media URLs';
COMMENT ON COLUMN instagram_media.media_url IS 'Direct URL to image or video (proxied through /api/instagram/proxy-image)';
COMMENT ON COLUMN instagram_media.video_url IS 'Direct video URL for video posts (used for playback)';
COMMENT ON COLUMN instagram_media.thumbnail_url IS 'Thumbnail image URL for video posts';

