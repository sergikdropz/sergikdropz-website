#!/usr/bin/env node

/**
 * Extract Instagram Post URLs from Browser
 * This script provides instructions for extracting post URLs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const POSTS_FILE = join(__dirname, '../data/instagram-posts.json')
const USERNAME = 'sergikdropz'

console.log('\n📸 Instagram Post URL Extractor')
console.log('='.repeat(60))
console.log(`\nProfile: @${USERNAME}`)
console.log('URL: https://www.instagram.com/sergikdropz\n')

console.log('🔍 Method: Browser Console Extraction\n')
console.log('Since Instagram requires login, use this method:\n')
console.log('1. Open Instagram in your browser: https://www.instagram.com/sergikdropz')
console.log('2. Log in to your account')
console.log('3. Open browser console (F12 or Cmd+Option+I)')
console.log('4. Paste and run this JavaScript:\n')
console.log(`
// Extract all post URLs from Instagram profile
const posts = []
const links = document.querySelectorAll('a[href*="/p/"]')
links.forEach(link => {
  const href = link.getAttribute('href')
  if (href && href.includes('/p/') && !posts.includes(href)) {
    const fullUrl = href.startsWith('http') ? href : 'https://www.instagram.com' + href
    posts.push(fullUrl)
  }
})
console.log('Found', posts.length, 'posts:')
posts.forEach((url, i) => console.log(\`\${i+1}. \${url}\`))
console.log('\\nCopy this array:')
console.log(JSON.stringify(posts, null, 2))
`)

console.log('\n5. Copy the array of URLs')
console.log('6. Paste them here when prompted\n')

// For now, let's try to read any existing posts
let currentData = { username: USERNAME, posts: [] }
try {
  const fileContent = readFileSync(POSTS_FILE, 'utf-8')
  currentData = JSON.parse(fileContent)
  const realPosts = currentData.posts.filter(p => !p.includes('EXAMPLE_POST'))
  if (realPosts.length > 0) {
    console.log(`\n✅ Found ${realPosts.length} existing post(s) in file:`)
    realPosts.slice(0, 5).forEach((url, i) => {
      console.log(`   ${i + 1}. ${url}`)
    })
    if (realPosts.length > 5) {
      console.log(`   ... and ${realPosts.length - 5} more`)
    }
    console.log('\n💡 These posts are already configured!')
    console.log('   Visit: http://localhost:3000 to see them on your homepage\n')
  }
} catch (error) {
  // File doesn't exist
}

console.log('\n📝 Alternative: Manual Method')
console.log('   1. Visit: http://localhost:3000/instagram-helper')
console.log('   2. Add post URLs one by one')
console.log('   3. Click Save\n')

