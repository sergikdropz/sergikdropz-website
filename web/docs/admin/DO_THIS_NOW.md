# ⚡ DO THIS NOW - Instagram Table Setup

## 🎯 What You Need to Do (2 minutes)

Supabase blocks automated SQL execution for security, so you need to create the table manually. Here's exactly what to do:

### Step 1: Open Supabase Dashboard
Go to: **https://supabase.com/dashboard**

### Step 2: Select Your Project
Click on your project (or create one if needed)

### Step 3: Open SQL Editor
1. Click **"SQL Editor"** in the left sidebar
2. Click **"New query"** button

### Step 4: Copy This SQL

```sql
-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Instagram Media Table
CREATE TABLE IF NOT EXISTS instagram_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_url TEXT UNIQUE NOT NULL,
  permalink TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  video_url TEXT,
  caption TEXT,
  username TEXT,
  post_id TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_instagram_media_post_url ON instagram_media(post_url);
CREATE INDEX IF NOT EXISTS idx_instagram_media_username ON instagram_media(username);
CREATE INDEX IF NOT EXISTS idx_instagram_media_type ON instagram_media(media_type);
CREATE INDEX IF NOT EXISTS idx_instagram_media_active ON instagram_media(is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_media_scraped_at ON instagram_media(scraped_at DESC);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_instagram_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to use the function
CREATE TRIGGER update_instagram_media_updated_at
  BEFORE UPDATE ON instagram_media
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_media_updated_at();
```

### Step 5: Paste and Run
1. Paste the SQL above into the SQL Editor
2. Click the **"Run"** button (or press Cmd/Ctrl + Enter)
3. Wait for "Success" message ✅

### Step 6: Verify It Worked
```bash
cd web
node scripts/verify-instagram-media.mjs
```

You should see: `✅ Found X media item(s)` or confirmation that the table exists.

## ✅ After Table is Created

Everything else is automated! You can now:

1. **Download and upload videos:**
   ```bash
   node scripts/download-instagram-videos-to-supabase.mjs
   ```

2. **Test video playback:**
   - Start dev server: `npm run dev`
   - Visit homepage
   - Click video thumbnails to verify they play

## 🎉 That's It!

Once the table is created, all the code is ready to work. Videos will play directly from Supabase Storage when clicked.

---

**Note:** This is the ONLY manual step required. Supabase intentionally blocks automated SQL execution for security - this is a safety feature, not a limitation of our code.

