#!/usr/bin/env node

/**
 * Fix Instagram Token - Try different methods to get User ID
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
const APP_ID = '1186575606889765'
const APP_SECRET = 'c58e867a7ac7b380491aded06d536fad'
const ACCESS_TOKEN = 'EAAQ3LymMPSUBQes4lP4SwC2phJAadxMfFz11fDaRd6r7m6ZBUeco6lpLm5HziosNApUtZAWrWYp1Vb7RZChG8ef1pMpNdWEzUp4bda2iZArysqRJNXKaUnQxVYG3EnUoLoRsnCTgtM9jUVd5X7HvZCGolMMmMOu4ZCcZCY13vLTyLuOKhijHWUEZCY6tBHpdFTZC4I1FdMmiuDcuxBQZDZD'

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
  console.log('\n📸 Instagram Token Setup - Troubleshooting')
  console.log('='.repeat(60))
  console.log('\nThe provided token appears to be a Facebook token.')
  console.log('For Instagram Basic Display API, we need an Instagram-specific token.\n')

  console.log('🔍 Trying different methods...\n')

  // Method 1: Try to get Instagram accounts from Facebook token
  console.log('Method 1: Getting Instagram accounts from Facebook token...')
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${ACCESS_TOKEN}&fields=instagram_business_account`
    )
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Found Facebook pages/accounts')
      if (data.data && data.data.length > 0) {
        console.log('   Accounts:', data.data.length)
        // This is for Instagram Business API, not Basic Display
      }
    }
  } catch (error) {
    console.log('   Not applicable (this is for Business API)')
  }

  // Method 2: Try Instagram Basic Display endpoint
  console.log('\nMethod 2: Trying Instagram Basic Display API...')
  try {
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${ACCESS_TOKEN}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Success! This is an Instagram token!')
      console.log(`   User ID: ${data.id}`)
      console.log(`   Username: ${data.username || 'N/A'}`)
      
      // Save credentials
      await saveCredentials(data.id)
      rl.close()
      return
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('❌ Not an Instagram token')
      console.log('   Error:', errorData.error?.message || 'Unknown')
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
  }

  // Method 3: Manual entry
  console.log('\n' + '='.repeat(60))
  console.log('⚠️  The token provided is not an Instagram Basic Display token.')
  console.log('='.repeat(60))
  console.log('\n📋 To get the correct token:')
  console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
  console.log(`2. Select your app (ID: ${APP_ID})`)
  console.log('3. Click "Generate Access Token"')
  console.log('4. Make sure you select: instagram_basic permission')
  console.log('5. Copy the NEW token (it should work with graph.instagram.com)')
  console.log('\nOR\n')
  console.log('If you have the User ID already, we can save it manually.\n')

  const hasUserId = await question('Do you have your Instagram User ID? (y/n): ')
  
  if (hasUserId.toLowerCase() === 'y') {
    const userId = await question('Enter your Instagram User ID: ')
    if (userId && userId.trim()) {
      await saveCredentials(userId.trim())
    } else {
      console.log('❌ User ID is required')
      rl.close()
      process.exit(1)
    }
  } else {
    console.log('\n💡 You need to:')
    console.log('1. Generate a new Instagram token via Graph API Explorer')
    console.log('2. Make sure it has instagram_basic permission')
    console.log('3. Run this script again with the new token')
    rl.close()
    process.exit(1)
  }

  rl.close()
}

async function saveCredentials(userId) {
  console.log('\n💾 Saving credentials...\n')
  
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

  console.log('✅ Credentials saved to .env.local!')
  console.log('\n📋 Summary:')
  console.log(`   App ID: ${APP_ID}`)
  console.log(`   App Secret: ${APP_SECRET.substring(0, 10)}...`)
  console.log(`   Access Token: ${ACCESS_TOKEN.substring(0, 20)}...`)
  console.log(`   User ID: ${userId}`)

  // Test
  console.log('\n🧪 Testing connection...\n')
  try {
    const testUrl = `https://graph.instagram.com/${userId}/media?fields=id,permalink&access_token=${ACCESS_TOKEN}&limit=3`
    const response = await fetch(testUrl)

    if (response.ok) {
      const data = await response.json()
      console.log('✅ API connection working!')
      if (data.data && data.data.length > 0) {
        console.log(`✅ Found ${data.data.length} post(s)`)
      }
    } else {
      console.log('⚠️  Token may still need to be refreshed')
      console.log('   But credentials are saved!')
    }
  } catch (error) {
    console.log('⚠️  Could not test, but credentials are saved')
  }

  console.log('\n✅ Setup complete! Restart your dev server to use it.\n')
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  rl.close()
  process.exit(1)
})

