#!/usr/bin/env node

/**
 * Script to scrape Instagram media metadata and save to Supabase
 * Usage: node scripts/scrape-instagram-media.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Read Instagram posts from data file
let instagramPosts = []
try {
  const postsData = JSON.parse(
    readFileSync(join(__dirname, '..', 'data', 'instagram-posts.json'), 'utf-8')
  )
  instagramPosts = (postsData.posts || []).filter(
    (post) => !post.includes('EXAMPLE_POST')
  )
} catch (error) {
  console.error('Error reading instagram-posts.json:', error.message)
  process.exit(1)
}

if (instagramPosts.length === 0) {
  console.error('❌ No Instagram posts found in data/instagram-posts.json')
  process.exit(1)
}

console.log(`📸 Found ${instagramPosts.length} Instagram posts to scrape\n`)

// Call the scrape API
async function scrapePosts() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/instagram/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postUrls: instagramPosts,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API error: ${error}`)
    }

    const result = await response.json()
    console.log(`✅ ${result.message}`)
    
    if (result.results) {
      console.log(`   Success: ${result.results.success}`)
      console.log(`   Failed: ${result.results.failed}`)
      
      if (result.results.errors.length > 0) {
        console.log('\n❌ Errors:')
        result.results.errors.forEach((error) => console.log(`   - ${error}`))
      }
    }
    
    console.log('\n✨ Scraping complete!')
    console.log('   Media is now stored in Supabase and will be used for playback.')
  } catch (error) {
    console.error('❌ Error scraping posts:', error.message)
    
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure your Next.js dev server is running:')
      console.error('   cd web && npm run dev')
    }
    
    process.exit(1)
  }
}

scrapePosts()

