#!/usr/bin/env node

/**
 * Complete Instagram Setup with App ID
 * Streamlined setup process
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
const APP_ID = '1186575606889765'
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

console.log('\n📸 Instagram API Setup - Quick Mode')
console.log('='.repeat(60))
console.log(`\n✅ App ID: ${APP_ID}`)
console.log('\nLet\'s get the remaining credentials...\n')

async function main() {
  // Step 1: App Secret
  printStep(1, 'Get App Secret')
  console.log('\n📋 Instructions:')
  console.log('1. Go to: https://developers.facebook.com/apps/')
  console.log(`2. Select your app (ID: ${APP_ID})`)
  console.log('3. Go to: Instagram Basic Display → Basic Display')
  console.log('4. Click "Show" next to App Secret')
  console.log('5. Copy the App Secret\n')

  const appSecret = await question('Enter your App Secret: ')

  if (!appSecret || appSecret.trim() === '') {
    console.error('\n❌ App Secret is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Step 2: Access Token
  printStep(2, 'Get Access Token')
  console.log('\n📋 Method 1: Graph API Explorer (Easiest)')
  console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
  console.log(`2. Select your app (ID: ${APP_ID}) from dropdown`)
  console.log('3. Click "Generate Access Token"')
  console.log('4. Select permissions: instagram_basic, pages_read_engagement')
  console.log('5. Copy the access token\n')

  const accessToken = await question('Enter your Access Token: ')

  if (!accessToken || accessToken.trim() === '') {
    console.error('\n❌ Access Token is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Step 3: User ID (try auto-fetch)
  printStep(3, 'Get User ID')
  console.log('\n🔍 Attempting to auto-fetch User ID...\n')

  let userId = ''
  try {
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken.trim()}`)
    
    if (response.ok) {
      const data = await response.json()
      userId = data.id
      console.log(`✅ Auto-fetched User ID: ${userId}`)
      if (data.username) {
        console.log(`✅ Username: ${data.username}`)
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('⚠️  Could not auto-fetch User ID')
      console.log('   Error:', errorData.error?.message || 'Unknown error')
      console.log('\n📋 Manual method:')
      console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
      console.log('2. Select your app')
      console.log('3. Use your access token')
      console.log('4. Make GET request to: me?fields=id')
      console.log('5. Copy the "id" value\n')
      
      userId = await question('Enter your User ID manually: ')
    }
  } catch (error) {
    console.log('⚠️  Could not auto-fetch User ID:', error.message)
    console.log('\n📋 Please enter it manually:')
    userId = await question('Enter your User ID: ')
  }

  if (!userId || userId.trim() === '') {
    console.error('\n❌ User ID is required. Exiting.')
    rl.close()
    process.exit(1)
  }

  // Step 4: Save credentials
  printStep(4, 'Saving Credentials')
  
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
    `INSTAGRAM_APP_SECRET=${appSecret.trim()}`,
    `INSTAGRAM_ACCESS_TOKEN=${accessToken.trim()}`,
    `INSTAGRAM_USER_ID=${userId.trim()}`,
    ''
  ]

  writeFileSync(ENV_FILE, newLines.join('\n'), 'utf-8')

  console.log('\n✅ Credentials saved to .env.local!')
  console.log('\n📋 Summary:')
  console.log(`   App ID: ${APP_ID}`)
  console.log(`   App Secret: ${appSecret.trim().substring(0, 10)}...`)
  console.log(`   Access Token: ${accessToken.trim().substring(0, 20)}...`)
  console.log(`   User ID: ${userId.trim()}`)

  // Step 5: Test
  printStep(5, 'Testing Connection')
  console.log('\n🧪 Testing Instagram API...\n')

  try {
    const testUrl = `https://graph.instagram.com/${userId.trim()}/media?fields=id,permalink&access_token=${accessToken.trim()}&limit=3`
    const response = await fetch(testUrl)

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Success! Instagram API is working!')
      if (data.data && data.data.length > 0) {
        console.log(`✅ Found ${data.data.length} post(s):`)
        data.data.forEach((post, i) => {
          console.log(`   ${i + 1}. ${post.permalink}`)
        })
      } else {
        console.log('⚠️  No posts found, but API connection is working.')
        console.log('   This might be normal if your account has no posts yet.')
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('⚠️  API test had issues, but credentials are saved.')
      console.log('   Status:', response.status)
      console.log('   Error:', errorData.error?.message || errorData)
      
      if (response.status === 401) {
        console.log('\n💡 Your access token may need to be refreshed.')
        console.log('   Short-lived tokens expire in 1 hour.')
        console.log('   Consider exchanging for a long-lived token (60 days).')
      }
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
  console.log('\n2. Test the refresh:')
  console.log('   node scripts/refresh-instagram-posts.mjs')
  console.log('\n3. Visit your homepage to see Instagram posts!')
  console.log('\n💡 Pro Tip: Exchange your token for a long-lived one (60 days):')
  console.log(`   https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret.trim()}&access_token=${accessToken.trim()}`)
  console.log('\n')

  rl.close()
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  rl.close()
  process.exit(1)
})

