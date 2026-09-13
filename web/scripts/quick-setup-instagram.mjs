#!/usr/bin/env node

/**
 * Quick Instagram API Credentials Setup
 * For Instagram Graph API (Business/Creator accounts)
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: join(__dirname, '../.env.local') })

const ENV_FILE = join(__dirname, '../.env.local')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  console.log('\n📸 Instagram API Quick Setup')
  console.log('='.repeat(60))
  console.log('\nThis will set up Instagram Graph API credentials.')
  console.log('You need an Instagram Business or Creator account.\n')

  // Check existing credentials
  let envContent = ''
  if (existsSync(ENV_FILE)) {
    envContent = readFileSync(ENV_FILE, 'utf-8')
  }

  const hasExisting = envContent.includes('INSTAGRAM_ACCESS_TOKEN') || envContent.includes('INSTAGRAM_USER_ID')
  if (hasExisting) {
    console.log('⚠️  Found existing Instagram credentials in .env.local')
    const overwrite = await question('Overwrite existing credentials? (y/n): ')
    if (overwrite.toLowerCase() !== 'y') {
      console.log('\n✅ Keeping existing credentials. Exiting.')
      rl.close()
      return
    }
  }

  console.log('\n📋 What You Need:')
  console.log('1. Instagram Access Token (from Facebook Graph API)')
  console.log('2. Instagram User ID\n')

  console.log('🔗 How to Get These:')
  console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
  console.log('2. Select your Facebook App')
  console.log('3. Generate token with permissions: instagram_basic, pages_read_engagement')
  console.log('4. Use the token to get your User ID (we can auto-fetch this)\n')

  // Get Access Token
  const accessToken = await question('Enter Instagram Access Token: ')
  if (!accessToken || accessToken.trim() === '') {
    console.error('\n❌ Access Token is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Try to auto-fetch User ID
  console.log('\n🔍 Attempting to fetch User ID from token...')
  let userId = ''
  try {
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken.trim()}`)
    
    if (response.ok) {
      const data = await response.json()
      userId = data.id
      console.log(`✅ Found User ID: ${userId}`)
      if (data.username) {
        console.log(`✅ Username: ${data.username}`)
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('⚠️  Could not auto-fetch User ID')
      console.log('   Error:', errorData.error?.message || 'Unknown error')
    }
  } catch (error) {
    console.log('⚠️  Could not auto-fetch User ID:', error.message)
  }

  // If auto-fetch failed, ask for User ID
  if (!userId || userId.trim() === '') {
    console.log('\n📝 Please get your User ID manually:')
    console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
    console.log('2. Use your access token')
    console.log('3. Make GET request to: me?fields=id')
    console.log('4. Copy the "id" value\n')
    
    userId = await question('Enter Instagram User ID: ')
    if (!userId || userId.trim() === '') {
      console.error('\n❌ User ID is required. Exiting.')
      rl.close()
      process.exit(1)
    }
  }

  // Save credentials
  console.log('\n💾 Saving credentials to .env.local...\n')
  
  // Remove old Instagram vars
  const lines = envContent.split('\n').filter(line => {
    return !line.startsWith('INSTAGRAM_ACCESS_TOKEN=') &&
           !line.startsWith('INSTAGRAM_USER_ID=')
  })

  // Add new vars
  const newLines = [
    ...lines.filter(line => line.trim() !== ''),
    '',
    '# Instagram Graph API Configuration',
    `INSTAGRAM_ACCESS_TOKEN=${accessToken.trim()}`,
    `INSTAGRAM_USER_ID=${userId.trim()}`,
    ''
  ]

  writeFileSync(ENV_FILE, newLines.join('\n'), 'utf-8')

  console.log('✅ Credentials saved!')
  console.log('\n📋 Summary:')
  console.log(`   Access Token: ${accessToken.trim().substring(0, 20)}...`)
  console.log(`   User ID: ${userId.trim()}`)

  // Test the credentials
  console.log('\n🧪 Testing credentials...\n')
  try {
    const testUrl = `https://graph.instagram.com/${userId.trim()}/media?fields=id,permalink&access_token=${accessToken.trim()}&limit=1`
    const response = await fetch(testUrl)

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Success! Instagram API is working!')
      if (data.data && data.data.length > 0) {
        console.log(`✅ Found ${data.data.length} post(s)`)
        console.log(`   Example: ${data.data[0].permalink}`)
      } else {
        console.log('⚠️  No posts found, but API connection is working.')
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('⚠️  API test failed.')
      console.log('   Status:', response.status)
      console.log('   Error:', errorData.error?.message || JSON.stringify(errorData))
      console.log('\n   Common issues:')
      console.log('   - Token may need different permissions')
      console.log('   - Account may need to be Business/Creator type')
      console.log('   - Token may be expired')
    }
  } catch (error) {
    console.log('⚠️  Could not test API:', error.message)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Setup Complete!')
  console.log('='.repeat(60))
  console.log('\n📝 Next Steps:')
  console.log('1. Restart your dev server:')
  console.log('   cd web && npm run dev')
  console.log('\n2. Test the refresh button on /instagram-helper')
  console.log('\n3. Posts will auto-refresh every 6 hours (if using Vercel cron)\n')

  rl.close()
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  rl.close()
  process.exit(1)
})


