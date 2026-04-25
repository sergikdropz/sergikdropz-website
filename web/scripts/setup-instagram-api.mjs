#!/usr/bin/env node

/**
 * Interactive Instagram API Setup Script
 * Guides you through getting all required credentials
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
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

function printStep(step, title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`STEP ${step}: ${title}`)
  console.log('='.repeat(60))
}

function printInstructions(text) {
  console.log(`\n📋 ${text}\n`)
}

async function main() {
  console.log('\n📸 Instagram API Setup')
  console.log('='.repeat(60))
  console.log('\nThis script will help you set up Instagram API credentials.')
  console.log('You\'ll need a Facebook Developer account.\n')

  // Check if .env.local exists
  let envContent = ''
  if (existsSync(ENV_FILE)) {
    envContent = readFileSync(ENV_FILE, 'utf-8')
  }

  // Step 1: App ID
  printStep(1, 'Get Instagram App ID')
  printInstructions('1. Go to: https://developers.facebook.com/apps/')
  printInstructions('2. Create a new app (or select existing)')
  printInstructions('3. Add "Instagram Basic Display" product')
  printInstructions('4. Go to Instagram Basic Display → Basic Display')
  printInstructions('5. Copy your App ID')

  const appId = await question('Enter your Instagram App ID: ')

  if (!appId || appId.trim() === '') {
    console.error('\n❌ App ID is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Step 2: App Secret
  printStep(2, 'Get Instagram App Secret')
  printInstructions('1. In the same Instagram Basic Display page')
  printInstructions('2. Click "Show" next to App Secret')
  printInstructions('3. Copy your App Secret')

  const appSecret = await question('Enter your Instagram App Secret: ')

  if (!appSecret || appSecret.trim() === '') {
    console.error('\n❌ App Secret is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Step 3: Access Token
  printStep(3, 'Get Instagram Access Token')
  printInstructions('Method 1: Using Graph API Explorer (Easiest)')
  printInstructions('1. Go to: https://developers.facebook.com/tools/explorer/')
  printInstructions('2. Select your app from the dropdown')
  printInstructions('3. Click "Generate Access Token"')
  printInstructions('4. Select permissions: instagram_basic, pages_read_engagement')
  printInstructions('5. Copy the access token')
  console.log('\nOR\n')
  printInstructions('Method 2: Using OAuth URL')
  printInstructions(`Visit: https://api.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=http://localhost:3000/api/instagram/callback&scope=user_profile,user_media&response_type=code`)
  printInstructions('Then exchange the code for a token')

  const accessToken = await question('Enter your Instagram Access Token: ')

  if (!accessToken || accessToken.trim() === '') {
    console.error('\n❌ Access Token is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Step 4: User ID
  printStep(4, 'Get Instagram User ID')
  printInstructions('1. Go to: https://developers.facebook.com/tools/explorer/')
  printInstructions('2. Select your app')
  printInstructions('3. Use the access token from Step 3')
  printInstructions('4. Make a GET request to: me?fields=id')
  printInstructions('5. Copy the "id" value')
  console.log('\nOR\n')
  printInstructions('We can try to fetch it automatically using your access token...')

  const tryAutoFetch = await question('Try to auto-fetch User ID? (y/n): ')

  let userId = ''
  if (tryAutoFetch.toLowerCase() === 'y') {
    try {
      console.log('\n🔍 Attempting to fetch User ID...')
      const response = await fetch(`https://graph.instagram.com/me?fields=id&access_token=${accessToken}`)
      
      if (response.ok) {
        const data = await response.json()
        userId = data.id
        console.log(`✅ Found User ID: ${userId}`)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.log('⚠️  Could not auto-fetch. Please enter manually.')
        console.log('Error:', errorData)
      }
    } catch (error) {
      console.log('⚠️  Could not auto-fetch. Please enter manually.')
    }
  }

  if (!userId || userId.trim() === '') {
    userId = await question('Enter your Instagram User ID: ')
  }

  if (!userId || userId.trim() === '') {
    console.error('\n❌ User ID is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Update .env.local
  printStep(5, 'Saving Credentials')
  
  const envVars = {
    INSTAGRAM_APP_ID: appId.trim(),
    INSTAGRAM_APP_SECRET: appSecret.trim(),
    INSTAGRAM_ACCESS_TOKEN: accessToken.trim(),
    INSTAGRAM_USER_ID: userId.trim(),
  }

  // Remove old Instagram vars if they exist
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
    `INSTAGRAM_APP_ID=${envVars.INSTAGRAM_APP_ID}`,
    `INSTAGRAM_APP_SECRET=${envVars.INSTAGRAM_APP_SECRET}`,
    `INSTAGRAM_ACCESS_TOKEN=${envVars.INSTAGRAM_ACCESS_TOKEN}`,
    `INSTAGRAM_USER_ID=${envVars.INSTAGRAM_USER_ID}`,
    ''
  ]

  writeFileSync(ENV_FILE, newLines.join('\n'), 'utf-8')

  console.log('\n✅ Credentials saved to .env.local!')
  console.log('\n📋 Summary:')
  console.log(`   App ID: ${appId.trim()}`)
  console.log(`   App Secret: ${appSecret.trim().substring(0, 10)}...`)
  console.log(`   Access Token: ${accessToken.trim().substring(0, 20)}...`)
  console.log(`   User ID: ${userId.trim()}`)

  // Test the credentials
  printStep(6, 'Testing Credentials')
  console.log('\n🧪 Testing Instagram API connection...\n')

  try {
    const testUrl = `https://graph.instagram.com/${userId}/media?fields=id,permalink&access_token=${accessToken}&limit=1`
    const response = await fetch(testUrl)

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Success! Instagram API is working!')
      if (data.data && data.data.length > 0) {
        console.log(`✅ Found ${data.data.length} post(s)`)
        console.log(`   Example post: ${data.data[0].permalink}`)
      } else {
        console.log('⚠️  No posts found, but API connection is working.')
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('⚠️  API test failed, but credentials are saved.')
      console.log('   Status:', response.status)
      console.log('   Error:', errorData)
      console.log('\n   This might be normal if:')
      console.log('   - Your access token needs to be refreshed')
      console.log('   - Your app is in development mode')
      console.log('   - You need to add test users')
    }
  } catch (error) {
    console.log('⚠️  Could not test API connection:', error.message)
    console.log('   Credentials are saved, but please verify manually.')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Setup Complete!')
  console.log('='.repeat(60))
  console.log('\n📝 Next Steps:')
  console.log('1. Restart your development server:')
  console.log('   cd web && npm run dev')
  console.log('\n2. Test the refresh script:')
  console.log('   node scripts/refresh-instagram-posts.mjs')
  console.log('\n3. Visit your homepage to see Instagram posts!')
  console.log('\n📚 For more info, see: web/INSTAGRAM_SETUP_GUIDE.md\n')

  rl.close()
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  rl.close()
  process.exit(1)
})

