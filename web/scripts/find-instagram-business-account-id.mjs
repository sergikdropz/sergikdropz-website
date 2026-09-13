#!/usr/bin/env node

/**
 * Script to find Instagram Business Account ID
 * This helps when the current INSTAGRAM_USER_ID is a Facebook User ID instead
 */

import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: join(__dirname, '../.env.local') })

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
const currentUserId = process.env.INSTAGRAM_USER_ID

if (!accessToken) {
  console.error('❌ INSTAGRAM_ACCESS_TOKEN not found in .env.local')
  process.exit(1)
}

console.log('\n🔍 Finding Instagram Business Account ID...\n')
console.log(`Current INSTAGRAM_USER_ID: ${currentUserId || 'not set'}\n`)

async function findInstagramBusinessAccountId() {
  try {
    // Method 1: Check if current user_id is already an Instagram Business Account ID
    if (currentUserId) {
      console.log('📋 Method 1: Testing if current user_id is an Instagram Business Account ID...')
      const testResponse = await fetch(
        `https://graph.facebook.com/v18.0/${currentUserId}/media?fields=id&access_token=${accessToken}&limit=1`
      )
      
      if (testResponse.ok) {
        console.log('✅ Current user_id IS an Instagram Business Account ID!')
        console.log(`   Instagram Business Account ID: ${currentUserId}\n`)
        return currentUserId
      } else {
        const errorData = await testResponse.json().catch(() => ({}))
        if (errorData.error?.code === 100) {
          console.log('❌ Current user_id is NOT an Instagram Business Account ID (it\'s a Facebook User ID)\n')
        }
      }
    }

    // Method 2: Try to get via Facebook Pages
    console.log('📋 Method 2: Trying to find via Facebook Pages...')
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    )
    
    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json()
      if (pagesData.data && pagesData.data.length > 0) {
        console.log(`   Found ${pagesData.data.length} Facebook Page(s)\n`)
        for (const page of pagesData.data) {
          console.log(`   Checking page: ${page.name} (${page.id})...`)
          const instagramResponse = await fetch(
            `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${accessToken}`
          )
          if (instagramResponse.ok) {
            const instagramData = await instagramResponse.json()
            if (instagramData.instagram_business_account?.id) {
              const instagramId = instagramData.instagram_business_account.id
              const username = instagramData.instagram_business_account.username
              console.log(`\n✅ Found Instagram Business Account ID!`)
              console.log(`   ID: ${instagramId}`)
              console.log(`   Username: @${username || 'N/A'}\n`)
              return instagramId
            }
          }
        }
        console.log('   ❌ No Instagram Business Account found on any Facebook Page\n')
      } else {
        console.log('   ❌ No Facebook Pages found\n')
      }
    } else {
      const errorData = await pagesResponse.json().catch(() => ({}))
      console.log(`   ❌ Could not fetch Facebook Pages: ${errorData.error?.message || 'Unknown error'}\n`)
    }

    // Method 3: Try to query /me to see what we have
    console.log('📋 Method 3: Checking token permissions and user info...')
    const meResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`
    )
    if (meResponse.ok) {
      const meData = await meResponse.json()
      console.log(`   Facebook User ID: ${meData.id}`)
      console.log(`   Name: ${meData.name || 'N/A'}\n`)
    }

    console.log('❌ Could not automatically find Instagram Business Account ID\n')
    console.log('💡 Solutions:')
    console.log('   1. Re-connect using Instagram Login method on /instagram-helper page')
    console.log('   2. Connect your Instagram account to a Facebook Page, then try again')
    console.log('   3. Find it manually:')
    console.log('      - Go to your Facebook Page → Settings → Instagram')
    console.log('      - Copy the numeric Instagram Business Account ID')
    console.log('      - Update INSTAGRAM_USER_ID in .env.local\n')
    
    return null
  } catch (error) {
    console.error('❌ Error:', error.message)
    return null
  }
}

const instagramId = await findInstagramBusinessAccountId()

if (instagramId && instagramId !== currentUserId) {
  console.log('📝 To update your .env.local file, run:')
  console.log(`   node scripts/set-instagram-credentials.mjs --token=${accessToken.substring(0, 20)}... --user-id=${instagramId}\n`)
}
