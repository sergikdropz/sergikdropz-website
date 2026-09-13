#!/usr/bin/env node

/**
 * Create Instagram Media Table via Supabase API
 * 
 * This script creates the instagram_media table using Supabase's REST API
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Execute SQL via Supabase REST API
 * Note: This uses the PostgREST API which has limitations
 */
async function executeSQL(sql) {
  try {
    // Use the REST API to execute SQL
    // Note: Supabase doesn't allow arbitrary SQL execution via JS client for security
    // We'll need to use the Management API or SQL Editor
    
    // Try using rpc if available, otherwise we'll need manual setup
    console.log('⚠️  Supabase requires SQL to be executed via the Dashboard SQL Editor')
    console.log('   for security reasons.\n')
    
    return false
  } catch (error) {
    console.error('Error executing SQL:', error.message)
    return false
  }
}

/**
 * Check if table exists by trying to query it
 */
async function tableExists(tableName) {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('count')
      .limit(1)
    
    return !error
  } catch (error) {
    return false
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Checking Instagram media table...\n')
  
  const exists = await tableExists('instagram_media')
  
  if (exists) {
    console.log('✅ instagram_media table already exists!')
    return
  }
  
  console.log('❌ instagram_media table does not exist')
  console.log('\n📋 To create the table, run this SQL in Supabase Dashboard:\n')
  console.log('='.repeat(70))
  console.log(`
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

CREATE INDEX IF NOT EXISTS idx_instagram_media_post_url ON instagram_media(post_url);
CREATE INDEX IF NOT EXISTS idx_instagram_media_username ON instagram_media(username);
CREATE INDEX IF NOT EXISTS idx_instagram_media_type ON instagram_media(media_type);
CREATE INDEX IF NOT EXISTS idx_instagram_media_active ON instagram_media(is_active);
CREATE INDEX IF NOT EXISTS idx_instagram_media_scraped_at ON instagram_media(scraped_at DESC);

CREATE OR REPLACE FUNCTION update_instagram_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_instagram_media_updated_at
  BEFORE UPDATE ON instagram_media
  FOR EACH ROW
  EXECUTE FUNCTION update_instagram_media_updated_at();
`)
  console.log('='.repeat(70))
  console.log('\n📝 Steps:')
  console.log('1. Go to: https://supabase.com/dashboard')
  console.log('2. Select your project')
  console.log('3. Click "SQL Editor" in left sidebar')
  console.log('4. Click "New query"')
  console.log('5. Copy the SQL above and paste it')
  console.log('6. Click "Run" (or Cmd/Ctrl + Enter)')
  console.log('\n💡 Or run the full schema: web/supabase/schema.sql\n')
}

main().catch(console.error)

