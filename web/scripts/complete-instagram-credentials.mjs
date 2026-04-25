#!/usr/bin/env node

/**
 * Complete Instagram Setup with All Credentials
 * Non-interactive version that completes setup automatically
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '../.env.local') })

const ENV_FILE = join(__dirname, '../.env.local')
const APP_ID = '1186575606889765'
const APP_SECRET = 'c58e867a7ac7b380491aded06d536fad'
const ACCESS_TOKEN = 'EAAQ3LymMPSUBQes4lP4SwC2phJAadxMfFz11fDaRd6r7m6ZBUeco6lpLm5HziosNApUtZAWrWYp1Vb7RZChG8ef1pMpNdWEzUp4bda2iZArysqRJNXKaUnQxVYG3EnUoLoRsnCTgtM9jUVd5X7HvZCGolMMmMOu4ZCcZCY13vLTyLuOKhijHWUEZCY6tBHpdFTZC4I1FdMmiuDcuxBQZDZD'

async function main() {
  console.log('\n📸 Completing Instagram API Setup')
  console.log('='.repeat(60))
  console.log(`\n✅ App ID: ${APP_ID}`)
  console.log(`✅ App Secret: ${APP_SECRET.substring(0, 10)}...`)
  console.log(`✅ Access Token: ${ACCESS_TOKEN.substring(0, 20)}...`)
  console.log('\n🔍 Fetching User ID...\n')

  // Fetch User ID
  let userId = ''
  try {
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${ACCESS_TOKEN}`)
    
    if (response.ok) {
      const data = await response.json()
      userId = data.id
      console.log(`✅ Auto-fetched User ID: ${userId}`)
      if (data.username) {
        console.log(`✅ Username: ${data.username}`)
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ Could not fetch User ID')
      console.error('   Error:', errorData.error?.message || 'Unknown error')
      console.error('   Status:', response.status)
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error fetching User ID:', error.message)
    process.exit(1)
  }

  // Save credentials
  console.log('\n💾 Saving credentials to .env.local...\n')
  
  let envContent = ''
  if (existsSync(ENV_FILE)) {
    envContent = readFileSync(ENV_FILE, 'utf-8')
  }

  // Remove old Instagram vars
  const lines = envContent.split('\n').filter(line => {
    return !line.startsWith('INSTAGRAM_APP_ID=') &&
           !line.startsWith('INSTAGRAM_APP_SECRET=') &&
           !line.startsWith('INSTAGRAM_ACCESS_TOKEN=') &&
           !line.startsWith('INSTAGRAM_USER_ID=')
  })

  // Add new vars
  const newLines = [
    ...lines.filter(line => line.trim() !== ''),
    '',
    '# Instagram API Configuration',
    `INSTAGRAM_APP_ID=${APP_ID}`,
    `INSTAGRAM_APP_SECRET=${APP_SECRET}`,
    `INSTAGRAM_ACCESS_TOKEN=${ACCESS_TOKEN}`,
    `INSTAGRAM_USER_ID=${userId}`,
    ''
  ]

  writeFileSync(ENV_FILE, newLines.join('\n'), 'utf-8')

  console.log('✅ Credentials saved!')
  console.log('\n📋 Summary:')
  console.log(`   App ID: ${APP_ID}`)
  console.log(`   App Secret: ${APP_SECRET.substring(0, 10)}...`)
  console.log(`   Access Token: ${ACCESS_TOKEN.substring(0, 20)}...`)
  console.log(`   User ID: ${userId}`)

  // Test connection
  console.log('\n🧪 Testing Instagram API connection...\n')

  try {
    const testUrl = `https://graph.instagram.com/${userId}/media?fields=id,permalink,timestamp&access_token=${ACCESS_TOKEN}&limit=5`
    const response = await fetch(testUrl)

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Success! Instagram API is working!')
      if (data.data && data.data.length > 0) {
        console.log(`✅ Found ${data.data.length} post(s):\n`)
        data.data.forEach((post, i) => {
          console.log(`   ${i + 1}. ${post.permalink}`)
        })
        console.log('')
      } else {
        console.log('⚠️  No posts found, but API connection is working.')
        console.log('   This might be normal if your account has no posts yet.\n')
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('⚠️  API test had issues, but credentials are saved.')
      console.log('   Status:', response.status)
      console.log('   Error:', errorData.error?.message || errorData)
      
      if (response.status === 401) {
        console.log('\n💡 Your access token may need to be refreshed.')
        console.log('   Short-lived tokens expire in 1 hour.')
        console.log('   Consider exchanging for a long-lived token (60 days).\n')
      }
    }
  } catch (error) {
    console.log('⚠️  Could not test API connection:', error.message)
    console.log('   Credentials are saved, but please verify manually.\n')
  }

  console.log('='.repeat(60))
  console.log('✅ Setup Complete!')
  console.log('='.repeat(60))
  console.log('\n📝 Next Steps:')
  console.log('1. Restart your development server:')
  console.log('   cd web && npm run dev')
  console.log('\n2. Test the refresh:')
  console.log('   node scripts/refresh-instagram-posts.mjs')
  console.log('\n3. Visit your homepage to see Instagram posts!')
  console.log('\n💡 Pro Tip: Exchange your token for a long-lived one (60 days):')
  console.log(`   https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${ACCESS_TOKEN}`)
  console.log('\n')
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})

