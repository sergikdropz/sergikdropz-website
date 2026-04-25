#!/usr/bin/env node

/**
 * Quick Add Instagram Posts
 * Paste post URLs and they'll be saved automatically
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const POSTS_FILE = join(__dirname, '../data/instagram-posts.json')
const USERNAME = 'sergikdropz'

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
  console.log('\n📸 Quick Add Instagram Posts')
  console.log('='.repeat(60))
  console.log(`\nProfile: @${USERNAME}\n`)

  // Read current posts
  let currentData = { username: USERNAME, posts: [] }
  try {
    const fileContent = readFileSync(POSTS_FILE, 'utf-8')
    currentData = JSON.parse(fileContent)
    const existing = currentData.posts.filter(p => !p.includes('EXAMPLE_POST'))
    if (existing.length > 0) {
      console.log(`✅ Found ${existing.length} existing post(s)\n`)
    }
  } catch (error) {
    // File doesn't exist
  }

  console.log('📋 Instructions:')
  console.log('   1. Go to: https://www.instagram.com/sergikdropz')
  console.log('   2. Scroll through your posts')
  console.log('   3. For each post, click three dots (⋯) → "Copy link"')
  console.log('   4. Paste URLs here (one per line, or comma-separated)')
  console.log('   5. Type "done" when finished\n')

  const posts = []
  let input = ''

  while (true) {
    const line = await question('Post URL (or "done" to finish): ')
    
    if (line.toLowerCase() === 'done') {
      break
    }

    if (line.trim() === '') {
      continue
    }

    // Handle comma-separated or newline-separated URLs
    const urls = line.split(/[,\n]/).map(u => u.trim()).filter(u => u)
    
    urls.forEach(url => {
      if (url.includes('instagram.com/p/')) {
        // Ensure full URL
        const fullUrl = url.startsWith('http') ? url : `https://www.instagram.com${url}`
        if (!posts.includes(fullUrl)) {
          posts.push(fullUrl)
          console.log(`   ✅ Added: ${fullUrl}`)
        }
      } else {
        console.log(`   ⚠️  Skipped (not an Instagram post URL): ${url}`)
      }
    })
  }

  if (posts.length === 0) {
    console.log('\n⚠️  No posts added. Exiting.\n')
    rl.close()
    return
  }

  // Merge with existing posts (remove duplicates)
  const existing = (currentData.posts || []).filter(p => !p.includes('EXAMPLE_POST'))
  const allPosts = [...new Set([...existing, ...posts])]

  // Update file
  const updatedData = {
    username: USERNAME,
    posts: allPosts,
    lastUpdated: new Date().toISOString(),
    note: 'Instagram posts for homepage display',
  }

  writeFileSync(POSTS_FILE, JSON.stringify(updatedData, null, 2) + '\n', 'utf-8')

  console.log(`\n✅ Successfully saved ${allPosts.length} post(s)!`)
  console.log(`   Added ${posts.length} new post(s)`)
  console.log(`\n📁 File: ${POSTS_FILE}`)
  console.log('\n🎉 Posts will now appear on your homepage!')
  console.log('   Visit: http://localhost:3000\n')

  rl.close()
}

main().catch(console.error)

