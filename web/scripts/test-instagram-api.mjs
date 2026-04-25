#!/usr/bin/env node

/**
 * Test Instagram API Credentials
 * Verifies that your Instagram API setup is working correctly
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID

async function testCredentials() {
  console.log('\n🧪 Testing Instagram API Credentials\n')
  console.log('='.repeat(60))

  // Check if credentials exist
  const missing = []
  if (!INSTAGRAM_APP_ID) missing.push('INSTAGRAM_APP_ID')
  if (!INSTAGRAM_APP_SECRET) missing.push('INSTAGRAM_APP_SECRET')
  if (!INSTAGRAM_ACCESS_TOKEN) missing.push('INSTAGRAM_ACCESS_TOKEN')
  if (!INSTAGRAM_USER_ID) missing.push('INSTAGRAM_USER_ID')

  if (missing.length > 0) {
    console.error('\n❌ Missing credentials:')
    missing.forEach(key => console.error(`   - ${key}`))
    console.error('\n💡 Run: node scripts/setup-instagram-api.mjs')
    process.exit(1)
  }

  console.log('\n✅ All credentials found in .env.local')
  console.log(`   App ID: ${INSTAGRAM_APP_ID.substring(0, 10)}...`)
  console.log(`   App Secret: ${INSTAGRAM_APP_SECRET.substring(0, 10)}...`)
  console.log(`   Access Token: ${INSTAGRAM_ACCESS_TOKEN.substring(0, 20)}...`)
  console.log(`   User ID: ${INSTAGRAM_USER_ID}`)

  // Test 1: Get User Info
  console.log('\n📡 Test 1: Getting Instagram Business Account info...')
  console.log('   Note: Instagram Graph API doesn\'t support /me endpoint')
  console.log(`   Using Instagram Business Account ID: ${INSTAGRAM_USER_ID}`)
  
  // Test 2: Get Media
  console.log('\n📡 Test 2: Fetching recent posts...')
  try {
    // Instagram Graph API uses graph.facebook.com, not graph.instagram.com
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v18.0/${INSTAGRAM_USER_ID}/media?fields=id,media_type,permalink,timestamp&access_token=${INSTAGRAM_ACCESS_TOKEN}&limit=5`
    )

    if (mediaResponse.ok) {
      const mediaData = await mediaResponse.json()
      if (mediaData.data && mediaData.data.length > 0) {
        console.log(`✅ Found ${mediaData.data.length} post(s):`)
        mediaData.data.forEach((post, i) => {
          console.log(`   ${i + 1}. ${post.permalink}`)
          console.log(`      Type: ${post.media_type}, Date: ${post.timestamp}`)
        })
      } else {
        console.log('⚠️  No posts found')
        console.log('   This might be normal if:')
        console.log('   - Your account has no posts')
        console.log('   - Your app is in development mode')
        console.log('   - You need to add test users')
      }
    } else {
      const errorData = await mediaResponse.json().catch(() => ({}))
      console.log('❌ Failed to get posts')
      console.log(`   Status: ${mediaResponse.status}`)
      console.log(`   Error:`, errorData)
      
      if (mediaResponse.status === 401) {
        console.log('\n⚠️  Your access token may have expired.')
        console.log('   Instagram tokens expire after 60 days.')
        console.log('   See: web/INSTAGRAM_SETUP_GUIDE.md for refresh instructions.')
      }
    }
  } catch (error) {
    console.log('❌ Error fetching posts:', error.message)
  }

  // Test 3: Check Token Expiry
  console.log('\n📡 Test 3: Checking token expiry...')
  try {
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${INSTAGRAM_APP_ID}&client_secret=${INSTAGRAM_APP_SECRET}&fb_exchange_token=${INSTAGRAM_ACCESS_TOKEN}`
    )

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json()
      if (tokenData.expires_in) {
        const days = Math.floor(tokenData.expires_in / 86400)
        console.log(`✅ Token expires in: ${days} days`)
        if (days < 7) {
          console.log('⚠️  Token expires soon! Consider refreshing it.')
        }
      }
    } else {
      // This is normal - the endpoint is for exchanging tokens
      console.log('ℹ️  Token expiry check skipped (normal)')
    }
  } catch (error) {
    console.log('ℹ️  Token expiry check skipped (normal)')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Testing Complete!')
  console.log('='.repeat(60))
  console.log('\n💡 If tests passed, your Instagram API is ready!')
  console.log('   Try: node scripts/refresh-instagram-posts.mjs\n')
}

testCredentials().catch((error) => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})

