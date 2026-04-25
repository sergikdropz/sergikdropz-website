#!/usr/bin/env node

/**
 * Save Instagram Credentials
 * Saves what we have and provides instructions for getting User ID
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ENV_FILE = join(__dirname, '../.env.local')
const APP_ID = '1186575606889765'
const APP_SECRET = 'c58e867a7ac7b380491aded06d536fad'
const ACCESS_TOKEN = 'EAAQ3LymMPSUBQes4lP4SwC2phJAadxMfFz11fDaRd6r7m6ZBUeco6lpLm5HziosNApUtZAWrWYp1Vb7RZChG8ef1pMpNdWEzUp4bda2iZArysqRJNXKaUnQxVYG3EnUoLoRsnCTgtM9jUVd5X7HvZCGolMMmMOu4ZCcZCY13vLTyLuOKhijHWUEZCY6tBHpdFTZC4I1FdMmiuDcuxBQZDZD'

async function main() {
  console.log('\n📸 Saving Instagram Credentials')
  console.log('='.repeat(60))
  
  // Try to get User ID from Facebook token
  console.log('\n🔍 Attempting to get Instagram User ID from Facebook token...\n')
  
  let userId = null
  
  try {
    // Try to get user info first
    const userResponse = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${ACCESS_TOKEN}`)
    if (userResponse.ok) {
      const userData = await userResponse.json()
      console.log(`✅ Facebook User ID: ${userData.id}`)
    }
    
    // Try to get Instagram accounts
    const accountsResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${ACCESS_TOKEN}&fields=instagram_business_account{id,username}`
    )
    
    if (accountsResponse.ok) {
      const accountsData = await accountsResponse.json()
      if (accountsData.data && accountsData.data.length > 0) {
        for (const account of accountsData.data) {
          if (account.instagram_business_account) {
            userId = account.instagram_business_account.id
            console.log(`✅ Found Instagram Business Account ID: ${userId}`)
            console.log(`   Username: ${account.instagram_business_account.username || 'N/A'}`)
            break
          }
        }
      }
    }
  } catch (error) {
    console.log('⚠️  Could not auto-fetch User ID:', error.message)
  }

  if (!userId) {
    console.log('\n⚠️  Could not automatically get Instagram User ID.')
    console.log('\n📋 To get your Instagram User ID manually:')
    console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
    console.log(`2. Select your app (ID: ${APP_ID})`)
    console.log('3. Use your access token')
    console.log('4. Make a GET request to: me?fields=id')
    console.log('5. Or check your Instagram account settings')
    console.log('\n💡 For Instagram Basic Display API, you may need a different token.')
    console.log('   The current token is a Facebook token.')
    console.log('\n📝 Credentials will be saved, but you\'ll need to add User ID manually.')
    console.log('   Edit web/.env.local and add: INSTAGRAM_USER_ID=your_user_id\n')
  }

  // Save credentials
  console.log('💾 Saving credentials to .env.local...\n')
  
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
    userId ? `INSTAGRAM_USER_ID=${userId}` : '# INSTAGRAM_USER_ID=your_user_id_here  # TODO: Add your User ID',
    ''
  ]

  writeFileSync(ENV_FILE, newLines.join('\n'), 'utf-8')

  console.log('✅ Credentials saved to .env.local!')
  console.log('\n📋 Summary:')
  console.log(`   App ID: ${APP_ID} ✅`)
  console.log(`   App Secret: ${APP_SECRET.substring(0, 10)}... ✅`)
  console.log(`   Access Token: ${ACCESS_TOKEN.substring(0, 20)}... ✅`)
  if (userId) {
    console.log(`   User ID: ${userId} ✅`)
  } else {
    console.log(`   User ID: ⚠️  Needs to be added manually`)
  }

  if (userId) {
    // Test connection
    console.log('\n🧪 Testing Instagram API connection...\n')
    try {
      const testUrl = `https://graph.instagram.com/${userId}/media?fields=id,permalink&access_token=${ACCESS_TOKEN}&limit=3`
      const response = await fetch(testUrl)

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Success! Instagram API is working!')
        if (data.data && data.data.length > 0) {
          console.log(`✅ Found ${data.data.length} post(s):\n`)
          data.data.forEach((post, i) => {
            console.log(`   ${i + 1}. ${post.permalink}`)
          })
        }
      } else {
        console.log('⚠️  Token may need to be an Instagram-specific token')
        console.log('   But credentials are saved!')
      }
    } catch (error) {
      console.log('⚠️  Could not test connection')
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Setup Complete!')
  console.log('='.repeat(60))
  console.log('\n📝 Next Steps:')
  if (!userId) {
    console.log('1. Add your Instagram User ID to .env.local')
    console.log('2. Or generate a new Instagram token via Graph API Explorer')
  }
  console.log('3. Restart your development server:')
  console.log('   cd web && npm run dev')
  console.log('\n4. Test the refresh:')
  console.log('   node scripts/refresh-instagram-posts.mjs')
  console.log('\n')
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})

