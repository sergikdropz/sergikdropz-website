#!/usr/bin/env node

/**
 * Fetch Instagram Post URLs
 * Extracts post URLs from Instagram profile page
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const POSTS_FILE = join(__dirname, '../data/instagram-posts.json')
const USERNAME = 'sergikdropz'

async function fetchPostUrls() {
  console.log('\n📸 Fetching Instagram Post URLs')
  console.log('='.repeat(60))
  console.log(`\nProfile: @${USERNAME}`)
  console.log('URL: https://www.instagram.com/sergikdropz\n')

  try {
    // Method 1: Try to fetch from Instagram profile page
    console.log('🔍 Attempting to fetch posts from Instagram...\n')
    
    const response = await fetch(`https://www.instagram.com/${USERNAME}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    
    // Extract post URLs from Instagram's embedded JSON data
    const postUrls = []
    
    // Look for Instagram's embedded JSON data
    const jsonMatch = html.match(/window\._sharedData\s*=\s*({.+?});/)
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1])
        const user = data?.entry_data?.ProfilePage?.[0]?.graphql?.user
        
        if (user?.edge_owner_to_timeline_media?.edges) {
          const posts = user.edge_owner_to_timeline_media.edges
          console.log(`✅ Found ${posts.length} post(s) in profile data\n`)
          
          posts.forEach((edge, index) => {
            const post = edge.node
            const shortcode = post.shortcode
            const url = `https://www.instagram.com/p/${shortcode}/`
            postUrls.push(url)
            console.log(`   ${index + 1}. ${url}`)
          })
        }
      } catch (parseError) {
        console.log('⚠️  Could not parse Instagram JSON data')
      }
    }

    // Alternative: Look for post links in HTML
    if (postUrls.length === 0) {
      console.log('🔍 Trying alternative method: extracting from HTML...\n')
      
      // Look for post links in the HTML
      const postLinkRegex = /https:\/\/www\.instagram\.com\/p\/([A-Za-z0-9_-]+)\//g
      const matches = html.matchAll(postLinkRegex)
      const seen = new Set()
      
      for (const match of matches) {
        const url = match[0]
        if (!seen.has(url)) {
          seen.add(url)
          postUrls.push(url)
        }
      }
      
      if (postUrls.length > 0) {
        console.log(`✅ Found ${postUrls.length} post URL(s) in HTML\n`)
        postUrls.forEach((url, index) => {
          console.log(`   ${index + 1}. ${url}`)
        })
      }
    }

    if (postUrls.length === 0) {
      console.log('⚠️  Could not automatically extract post URLs')
      console.log('\n📝 Manual Method:')
      console.log('   1. Visit: https://www.instagram.com/sergikdropz')
      console.log('   2. Scroll through your posts')
      console.log('   3. For each post, click three dots (⋯) → "Copy link"')
      console.log('   4. Add them via: http://localhost:3000/instagram-helper\n')
      return
    }

    // Save to file
    let currentData = { username: USERNAME, posts: [] }
    try {
      const fileContent = readFileSync(POSTS_FILE, 'utf-8')
      currentData = JSON.parse(fileContent)
    } catch (error) {
      // File doesn't exist, use defaults
    }

    const updatedData = {
      username: USERNAME,
      posts: postUrls,
      lastUpdated: new Date().toISOString(),
      note: 'Automatically fetched from Instagram profile',
    }

    writeFileSync(POSTS_FILE, JSON.stringify(updatedData, null, 2) + '\n', 'utf-8')

    console.log(`\n✅ Successfully saved ${postUrls.length} post URL(s) to:`)
    console.log(`   ${POSTS_FILE}\n`)
    console.log('🎉 Posts will now appear on your homepage!')
    console.log('   Visit: http://localhost:3000\n')

  } catch (error) {
    console.error('\n❌ Error fetching posts:', error.message)
    console.log('\n📝 Alternative: Use Manual Method')
    console.log('   1. Visit: https://www.instagram.com/sergikdropz')
    console.log('   2. Open each post')
    console.log('   3. Click three dots (⋯) → "Copy link"')
    console.log('   4. Add via: http://localhost:3000/instagram-helper\n')
  }
}

fetchPostUrls()

