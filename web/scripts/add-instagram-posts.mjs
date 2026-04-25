#!/usr/bin/env node

/**
 * Helper script to add Instagram post URLs to instagram-posts.json
 * 
 * Usage:
 *   node scripts/add-instagram-posts.mjs
 * 
 * This will open the file and guide you through adding post URLs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const POSTS_FILE = path.join(__dirname, '../data/instagram-posts.json')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function main() {
  console.log('\n📸 Instagram Posts URL Adder\n')
  console.log('This script will help you add Instagram post URLs to your website.\n')
  
  // Read current file
  let data
  try {
    const fileContent = fs.readFileSync(POSTS_FILE, 'utf-8')
    data = JSON.parse(fileContent)
  } catch (error) {
    console.error('Error reading file:', error.message)
    process.exit(1)
  }

  console.log(`Current username: ${data.username}`)
  console.log(`Current posts: ${data.posts.filter(p => !p.includes('EXAMPLE_POST')).length} real posts\n`)

  const posts = []
  let addMore = true
  let postNumber = 1

  console.log('Enter your Instagram post URLs (one at a time).')
  console.log('To get a post URL:')
  console.log('  1. Open the post on Instagram')
  console.log('  2. Click the three dots (⋯) menu')
  console.log('  3. Select "Copy link"')
  console.log('  4. Paste it here\n')
  console.log('Type "done" when finished, or "skip" to keep existing posts.\n')

  while (addMore) {
    const url = await question(`Post ${postNumber} URL (or "done"/"skip"): `)
    
    if (url.toLowerCase() === 'done') {
      addMore = false
      break
    }
    
    if (url.toLowerCase() === 'skip') {
      // Keep existing posts
      posts.push(...data.posts.filter(p => !p.includes('EXAMPLE_POST')))
      addMore = false
      break
    }

    if (url.trim() === '') {
      console.log('⚠️  Empty URL, skipping...\n')
      continue
    }

    // Validate URL format
    if (!url.includes('instagram.com/p/')) {
      console.log('⚠️  This doesn\'t look like an Instagram post URL.')
      const confirm = await question('Add anyway? (y/n): ')
      if (confirm.toLowerCase() !== 'y') {
        continue
      }
    }

    posts.push(url.trim())
    console.log(`✅ Added post ${postNumber}\n`)
    postNumber++
  }

  // Update data
  data.posts = posts.length > 0 ? posts : data.posts

  // Write back to file
  try {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
    console.log(`\n✅ Successfully updated ${POSTS_FILE}`)
    console.log(`📊 Total posts: ${data.posts.filter(p => !p.includes('EXAMPLE_POST')).length}`)
    console.log('\nYour Instagram posts will now appear on the homepage! 🎉\n')
  } catch (error) {
    console.error('Error writing file:', error.message)
    process.exit(1)
  }

  rl.close()
}

main().catch(console.error)

