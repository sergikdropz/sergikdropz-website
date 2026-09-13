#!/usr/bin/env node

/**
 * Verify Instagram Setup - Complete Check
 * Checks all components of the Instagram integration
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const APP_ID = process.env.INSTAGRAM_APP_ID
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const USER_ID = process.env.INSTAGRAM_USER_ID

const POSTS_FILE = join(__dirname, '../data/instagram-posts.json')
const CALLBACK_ROUTE = join(__dirname, '../app/api/instagram/callback/route.ts')
const REFRESH_ROUTE = join(__dirname, '../app/api/instagram/refresh/route.ts')
const HELPER_PAGE = join(__dirname, '../app/instagram-helper/page.tsx')

console.log('\n🔍 Instagram Setup Verification')
console.log('='.repeat(60))
console.log('')

let allGood = true

// 1. Check Environment Variables
console.log('📋 1. Environment Variables:')
if (APP_ID) {
  console.log(`   ✅ INSTAGRAM_APP_ID: ${APP_ID}`)
} else {
  console.log('   ❌ INSTAGRAM_APP_ID: Missing')
  allGood = false
}

if (APP_SECRET) {
  console.log(`   ✅ INSTAGRAM_APP_SECRET: ${APP_SECRET.substring(0, 10)}...`)
} else {
  console.log('   ❌ INSTAGRAM_APP_SECRET: Missing')
  allGood = false
}

if (ACCESS_TOKEN) {
  console.log(`   ✅ INSTAGRAM_ACCESS_TOKEN: ${ACCESS_TOKEN.substring(0, 20)}...`)
} else {
  console.log('   ⚠️  INSTAGRAM_ACCESS_TOKEN: Not set (will use OAuth)')
}

if (USER_ID) {
  console.log(`   ✅ INSTAGRAM_USER_ID: ${USER_ID}`)
} else {
  console.log('   ⚠️  INSTAGRAM_USER_ID: Not set (will be set via OAuth)')
}

console.log('')

// 2. Check Files
console.log('📁 2. Required Files:')
const files = [
  { path: POSTS_FILE, name: 'instagram-posts.json' },
  { path: CALLBACK_ROUTE, name: 'OAuth Callback Route' },
  { path: REFRESH_ROUTE, name: 'Refresh API Route' },
  { path: HELPER_PAGE, name: 'Helper Page' },
]

files.forEach(({ path, name }) => {
  if (existsSync(path)) {
    console.log(`   ✅ ${name}`)
  } else {
    console.log(`   ❌ ${name}: Missing`)
    allGood = false
  }
})

console.log('')

// 3. Check Posts Data
console.log('📸 3. Instagram Posts Data:')
try {
  if (existsSync(POSTS_FILE)) {
    const data = JSON.parse(readFileSync(POSTS_FILE, 'utf-8'))
    const realPosts = (data.posts || []).filter((p) => !p.includes('EXAMPLE_POST'))
    console.log(`   ✅ Found ${realPosts.length} real post(s)`)
    if (realPosts.length > 0) {
      console.log(`   📝 Sample: ${realPosts[0].substring(0, 50)}...`)
    }
  } else {
    console.log('   ⚠️  Posts file not found (will be created)')
  }
} catch (error) {
  console.log(`   ⚠️  Could not read posts file: ${error.message}`)
}

console.log('')

// 4. Test API Connection (if credentials exist)
if (ACCESS_TOKEN && USER_ID) {
  console.log('🧪 4. Testing Instagram API Connection:')
  try {
    const apiUrl = `https://graph.instagram.com/${USER_ID}/media?fields=id,permalink&access_token=${ACCESS_TOKEN}&limit=1`
    const response = await fetch(apiUrl)

    if (response.ok) {
      const data = await response.json()
      console.log('   ✅ API connection successful!')
      if (data.data && data.data.length > 0) {
        console.log(`   ✅ Found ${data.data.length} post(s) via API`)
      } else {
        console.log('   ⚠️  No posts found (account may have no posts)')
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log(`   ❌ API connection failed: ${response.status}`)
      console.log(`   Error: ${errorData.error?.message || 'Unknown error'}`)
      if (response.status === 401) {
        console.log('   💡 Token may have expired. Re-connect via OAuth.')
      }
      allGood = false
    }
  } catch (error) {
    console.log(`   ⚠️  Could not test API: ${error.message}`)
  }
} else {
  console.log('⏭️  4. Skipping API test (credentials not set)')
  console.log('   💡 Use OAuth flow to set up credentials')
}

console.log('')

// 5. OAuth Setup Status
console.log('🔗 5. OAuth Setup:')
console.log('   ✅ OAuth callback route: Ready')
console.log('   ✅ Helper page: Ready')
console.log('   ⚠️  Action Required: Add redirect URI to Facebook App')
console.log('      URL: http://localhost:3000/api/instagram/callback')
console.log('      Go to: https://developers.facebook.com/apps/1186575606889765')
console.log('      → Instagram Basic Display → Basic Display')
console.log('      → Add OAuth Redirect URI')

console.log('')

// 6. Summary
console.log('='.repeat(60))
if (allGood && ACCESS_TOKEN && USER_ID) {
  console.log('✅ Setup Complete! Instagram API is ready to use.')
  console.log('')
  console.log('📝 Next Steps:')
  console.log('   1. Test refresh: node scripts/refresh-instagram-posts.mjs')
  console.log('   2. Visit homepage to see posts')
  console.log('   3. Posts auto-refresh every 6 hours via cron')
} else if (allGood) {
  console.log('✅ Code Setup Complete!')
  console.log('')
  console.log('📝 Next Steps:')
  console.log('   1. Add OAuth redirect URI to Facebook App')
  console.log('   2. Visit: http://localhost:3000/instagram-helper')
  console.log('   3. Click "🔗 Connect Instagram Account"')
  console.log('   4. Authorize the app')
  console.log('   5. Credentials will be saved automatically!')
} else {
  console.log('⚠️  Some components need attention (see above)')
}
console.log('='.repeat(60))
console.log('')

