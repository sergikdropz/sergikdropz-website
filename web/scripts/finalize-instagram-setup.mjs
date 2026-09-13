#!/usr/bin/env node

/**
 * Finalize Instagram Setup with New Token
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ENV_FILE = join(__dirname, '../.env.local')
const APP_ID = '1186575606889765'
const APP_SECRET = 'c58e867a7ac7b380491aded06d536fad'
const ACCESS_TOKEN = 'EAAQ3LymMPSUBQeWrykz6bo0ZAJPeoBoufGWbuQmZCalQ361U3zJpMDcQEM2bpLn7n00X907ZBDM2JK8C70OB6HLPKslULV3tl8qTZBXSnHJjNw0gwoXzI5CX8Czfc3dukgDvogt381VO0ccjEHEZCI8Yc0Sa1aQi0R8FGFdZAXUlfqsUHk6gZAV2urZB5ks85j5SHfwDChXD2wYi3CoMTj33XHMqkAqVb46gHQDxbwZAYCVDaIMad'

async function main() {
  console.log('\n📸 Finalizing Instagram API Setup')
  console.log('='.repeat(60))
  console.log(`\n✅ App ID: ${APP_ID}`)
  console.log(`✅ App Secret: ${APP_SECRET.substring(0, 10)}...`)
  console.log(`✅ Access Token: ${ACCESS_TOKEN.substring(0, 20)}...`)
  console.log('\n🔍 Attempting to get Instagram User ID...\n')

  let userId = null
  let username = null

  // Method 1: Try Instagram Basic Display API
  try {
    console.log('Method 1: Trying Instagram Basic Display API...')
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${ACCESS_TOKEN}`)
    
    if (response.ok) {
      const data = await response.json()
      userId = data.id
      username = data.username
      console.log(`✅ Success! Found Instagram User ID: ${userId}`)
      if (username) {
        console.log(`✅ Username: ${username}`)
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.log('❌ Not an Instagram token')
      console.log('   Error:', errorData.error?.message || 'Unknown')
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
  }

  // Method 2: Try Facebook Graph API to find Instagram account
  if (!userId) {
    try {
      console.log('\nMethod 2: Checking Facebook pages for Instagram account...')
      const response = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${ACCESS_TOKEN}&fields=instagram_business_account{id,username}`
      )
      
      if (response.ok) {
        const data = await response.json()
        if (data.data && data.data.length > 0) {
          for (const account of data.data) {
            if (account.instagram_business_account) {
              userId = account.instagram_business_account.id
              username = account.instagram_business_account.username
              console.log(`✅ Found Instagram Business Account ID: ${userId}`)
              if (username) {
                console.log(`✅ Username: ${username}`)
              }
              break
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠️  Could not find Instagram account via Facebook pages')
    }
  }

  // Method 3: Try to get from user's Instagram account directly
  if (!userId) {
    try {
      console.log('\nMethod 3: Trying alternative Instagram endpoints...')
      // Some tokens work with different endpoints
      const response = await fetch(`https://graph.facebook.com/v18.0/me?fields=id&access_token=${ACCESS_TOKEN}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`ℹ️  Facebook User ID: ${data.id}`)
        console.log('   (This is a Facebook token, not Instagram)')
      }
    } catch (error) {
      // Ignore
    }
  }

  // Save credentials
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
    if (username) {
      console.log(`   Username: ${username} ✅`)
    }
  } else {
    console.log(`   User ID: ⚠️  Not found - needs to be added manually`)
  }

  // Test connection if we have User ID
  if (userId) {
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
        console.log('⚠️  API test had issues')
        console.log('   Status:', response.status)
        console.log('   Error:', errorData.error?.message || errorData)
        console.log('\n💡 The token may need to be an Instagram-specific token.')
        console.log('   Or it may need different permissions.\n')
      }
    } catch (error) {
      console.log('⚠️  Could not test connection:', error.message)
      console.log('   But credentials are saved!\n')
    }
  } else {
    console.log('\n⚠️  Could not automatically get Instagram User ID.')
    console.log('\n📋 To get your Instagram User ID:')
    console.log('1. Go to: https://developers.facebook.com/tools/explorer/')
    console.log(`2. Select your app (ID: ${APP_ID})`)
    console.log('3. Use your access token')
    console.log('4. Make a GET request to: me?fields=id')
    console.log('5. Or check your Instagram account connected to Facebook')
    console.log('\nThen edit web/.env.local and add:')
    console.log('INSTAGRAM_USER_ID=your_user_id\n')
  }

  console.log('='.repeat(60))
  console.log('✅ Setup Complete!')
  console.log('='.repeat(60))
  console.log('\n📝 Next Steps:')
  if (!userId) {
    console.log('1. Add your Instagram User ID to .env.local')
  }
  console.log('2. Restart your development server:')
  console.log('   cd web && npm run dev')
  console.log('\n3. Test the refresh:')
  console.log('   node scripts/refresh-instagram-posts.mjs')
  console.log('\n4. Visit your homepage to see Instagram posts!')
  console.log('\n')
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message)
  process.exit(1)
})

