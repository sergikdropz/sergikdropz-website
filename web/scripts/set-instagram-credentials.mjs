#!/usr/bin/env node

/**
 * Set Instagram API Credentials
 * Adds INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID to .env.local
 * Can automatically fetch Instagram Business Account ID from token
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get values from command line arguments or prompt
const args = process.argv.slice(2)
let accessToken = args.find(arg => arg.startsWith('--token='))?.split('=')[1]
let userId = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1]
const autoFetch = args.includes('--auto-fetch') || args.includes('--auto')

// If token provided but no user ID, try to fetch it automatically
if (accessToken && !userId && autoFetch) {
  console.log('\n🔍 Attempting to fetch Instagram Business Account ID from token...\n')
  
  try {
    // First, get Facebook Pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    )
    
    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json()
      if (pagesData.data && pagesData.data.length > 0) {
        // Try each page to find one with Instagram Business Account
        for (const page of pagesData.data) {
          const instagramResponse = await fetch(
            `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${accessToken}`
          )
          if (instagramResponse.ok) {
            const instagramData = await instagramResponse.json()
            if (instagramData.instagram_business_account?.id) {
              userId = instagramData.instagram_business_account.id
              console.log(`✅ Found Instagram Business Account ID: ${userId}`)
              if (instagramData.instagram_business_account.username) {
                console.log(`   Username: @${instagramData.instagram_business_account.username}\n`)
              }
              break
            }
          }
        }
      }
    }
    
    if (!userId) {
      console.log('⚠️  Could not automatically fetch Instagram Business Account ID')
      console.log('   Make sure your Instagram account is connected to a Facebook Page\n')
    }
  } catch (error) {
    console.log('⚠️  Error fetching Instagram Business Account ID:', error.message)
    console.log('   You may need to provide it manually\n')
  }
}

// If not provided, prompt for them
if (!accessToken) {
  console.log('\n📝 Instagram API Credentials Setup\n')
  console.log('You can provide values via command line:')
  console.log('  node scripts/set-instagram-credentials.mjs --token=YOUR_TOKEN [--user-id=YOUR_USER_ID] [--auto-fetch]\n')
  console.log('Or enter them when prompted below.\n')
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  accessToken = await new Promise((resolve) => {
    readline.question('Enter INSTAGRAM_ACCESS_TOKEN: ', (answer) => {
      readline.close()
      resolve(answer.trim())
    })
  })
  
  // Try to auto-fetch if token provided
  if (accessToken && !userId) {
    console.log('\n🔍 Attempting to fetch Instagram Business Account ID...\n')
    try {
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      )
      if (pagesResponse.ok) {
        const pagesData = await pagesResponse.json()
        if (pagesData.data && pagesData.data.length > 0) {
          for (const page of pagesData.data) {
            const instagramResponse = await fetch(
              `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${accessToken}`
            )
            if (instagramResponse.ok) {
              const instagramData = await instagramResponse.json()
              if (instagramData.instagram_business_account?.id) {
                userId = instagramData.instagram_business_account.id
                console.log(`✅ Found Instagram Business Account ID: ${userId}`)
                if (instagramData.instagram_business_account.username) {
                  console.log(`   Username: @${instagramData.instagram_business_account.username}\n`)
                }
                break
              }
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠️  Could not auto-fetch, will prompt for user ID\n')
    }
  }
  
  if (!userId) {
    const readline2 = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    userId = await new Promise((resolve) => {
      readline2.question('Enter INSTAGRAM_USER_ID (Instagram Business Account ID): ', (answer) => {
        readline2.close()
        resolve(answer.trim())
      })
    })
  }
}

if (!accessToken) {
  console.error('❌ Error: INSTAGRAM_ACCESS_TOKEN is required')
  process.exit(1)
}

// If we still don't have userId, try one more method: check if token has user_id field
if (!userId) {
  try {
    // Try to get user info from token
    const userInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id&access_token=${accessToken}`
    )
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json()
      // This is a Facebook user ID, not Instagram, but we can try to use it as fallback
      console.log(`\n⚠️  Found Facebook User ID: ${userInfo.id}`)
      console.log('   This is not your Instagram Business Account ID.')
      console.log('   You need to provide your Instagram Business Account ID manually.\n')
    }
  } catch (error) {
    // Ignore
  }
}

// If still no userId, we'll save without it and let user add it later
if (!userId) {
  console.log('⚠️  Warning: INSTAGRAM_USER_ID not found.')
  console.log('   The access token has been saved, but you\'ll need to add INSTAGRAM_USER_ID manually.')
  console.log('   To find your Instagram Business Account ID:')
  console.log('   1. Go to your Facebook Page')
  console.log('   2. Settings → Instagram')
  console.log('   3. Your Instagram Business Account ID will be shown there\n')
}

// Path to .env.local
const envFile = join(__dirname, '..', '.env.local')
let envContent = ''

// Read existing .env.local if it exists
try {
  envContent = readFileSync(envFile, 'utf-8')
} catch (error) {
  // File doesn't exist, will create it
  console.log('📄 Creating new .env.local file...')
}

// Remove old Instagram vars
const lines = envContent.split('\n').filter((line) => {
  return (
    !line.startsWith('INSTAGRAM_APP_ID=') &&
    !line.startsWith('INSTAGRAM_APP_SECRET=') &&
    !line.startsWith('INSTAGRAM_ACCESS_TOKEN=') &&
    !line.startsWith('INSTAGRAM_USER_ID=')
  )
})

// Add new vars
const newLines = [
  ...lines.filter((line) => line.trim() !== ''),
  '',
  '# Instagram API Configuration',
  `INSTAGRAM_ACCESS_TOKEN=${accessToken}`,
  ...(userId ? [`INSTAGRAM_USER_ID=${userId}`] : ['# INSTAGRAM_USER_ID=YOUR_INSTAGRAM_BUSINESS_ACCOUNT_ID  # Add this manually']),
  '',
]

// Write to file
writeFileSync(envFile, newLines.join('\n'), 'utf-8')

console.log('\n✅ Successfully saved Instagram credentials to .env.local')
console.log(`   INSTAGRAM_ACCESS_TOKEN: ${accessToken.substring(0, 20)}...`)
console.log(`   INSTAGRAM_USER_ID: ${userId}\n`)
console.log('💡 Note: You may need to restart your Next.js dev server for changes to take effect.\n')

