#!/usr/bin/env node

/**
 * Script to refresh Instagram posts from API
 * Can be run manually or via cron
 * 
 * Usage:
 *   node scripts/refresh-instagram-posts.mjs
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID
const POSTS_FILE = join(__dirname, '../data/instagram-posts.json')
const MAX_POSTS = 12

async function refreshPosts() {
  console.log('\n🔄 Refreshing Instagram posts from API...\n')

  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_USER_ID) {
    console.error('❌ Instagram API credentials not configured!')
    console.error('\nPlease add to web/.env.local:')
    console.error('  INSTAGRAM_ACCESS_TOKEN=your_access_token')
    console.error('  INSTAGRAM_USER_ID=your_user_id')
    console.error('\nSee: web/INSTAGRAM_SETUP_GUIDE.md for setup instructions\n')
    process.exit(1)
  }

  try {
    // Fetch from Instagram Graph API
    // Instagram Graph API uses graph.facebook.com, not graph.instagram.com
    const apiUrl = `https://graph.facebook.com/v18.0/${INSTAGRAM_USER_ID}/media?fields=id,media_type,media_url,permalink,timestamp,caption&access_token=${INSTAGRAM_ACCESS_TOKEN}&limit=${MAX_POSTS}`
    
    console.log('📡 Fetching posts from Instagram API...')
    const response = await fetch(apiUrl)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ Instagram API error:', response.status)
      console.error('Error details:', errorData)
      
      if (response.status === 401) {
        console.error('\n⚠️  Your access token may have expired.')
        console.error('   Instagram access tokens expire after 60 days.')
        console.error('   You need to refresh your token. See: web/INSTAGRAM_SETUP_GUIDE.md\n')
      }
      
      process.exit(1)
    }

    const data = await response.json()

    if (!data.data || data.data.length === 0) {
      console.error('❌ No posts found in Instagram account')
      process.exit(1)
    }

    // Extract post URLs
    const posts = data.data.map((item) => item.permalink)
    console.log(`✅ Fetched ${posts.length} post(s) from Instagram\n`)

    // Read current file to preserve username
    let currentData = { username: 'sergikdropz', posts: [] }
    try {
      const fileContent = readFileSync(POSTS_FILE, 'utf-8')
      currentData = JSON.parse(fileContent)
    } catch (error) {
      // File doesn't exist or is invalid, use defaults
    }

    // Update with fresh data
    const updatedData = {
      username: currentData.username || 'sergikdropz',
      posts: posts,
      lastUpdated: new Date().toISOString(),
      source: 'api',
      total: posts.length,
      note: 'Automatically fetched from Instagram API. Posts update automatically.'
    }

    // Write to file
    writeFileSync(POSTS_FILE, JSON.stringify(updatedData, null, 2) + '\n', 'utf-8')

    console.log('✅ Successfully updated instagram-posts.json')
    console.log(`📊 Total posts: ${posts.length}`)
    console.log(`🕐 Last updated: ${updatedData.lastUpdated}\n`)

    // Show first few post URLs
    console.log('📸 Post URLs:')
    posts.slice(0, 3).forEach((url, i) => {
      console.log(`   ${i + 1}. ${url}`)
    })
    if (posts.length > 3) {
      console.log(`   ... and ${posts.length - 3} more\n`)
    }

  } catch (error) {
    console.error('❌ Error refreshing posts:', error.message)
    process.exit(1)
  }
}

refreshPosts()

