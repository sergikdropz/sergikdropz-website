#!/usr/bin/env node

/**
 * Supabase Setup Helper Script
 * 
 * This script helps you set up Supabase step by step
 * 
 * Usage:
 *   node scripts/setup-supabase.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

console.log('🚀 Supabase Setup Helper\n')
console.log('This script will help you set up Supabase for your project.\n')

// Check if .env.local exists
const envPath = join(__dirname, '../.env.local')
const envExists = existsSync(envPath)

if (envExists) {
  console.log('✅ .env.local file already exists')
  const overwrite = await question('Do you want to update it? (y/n): ')
  if (overwrite.toLowerCase() !== 'y') {
    console.log('Skipping environment variable setup.')
    rl.close()
    process.exit(0)
  }
}

console.log('\n📝 Setting up environment variables...\n')
console.log('You can get these from: https://supabase.com/dashboard')
console.log('→ Your Project → Settings → API\n')

const supabaseUrl = await question('Enter your Supabase URL (https://xxxxx.supabase.co): ')
const anonKey = await question('Enter your Supabase Anon Key: ')
const serviceKey = await question('Enter your Supabase Service Role Key: ')

// Read existing .env.local if it exists
let envContent = ''
if (envExists) {
  envContent = readFileSync(envPath, 'utf-8')
}

// Update or add Supabase variables
const lines = envContent.split('\n')
const newLines = []
let foundSupabase = false

for (const line of lines) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL') || 
      line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
      line.startsWith('SUPABASE_SERVICE_ROLE_KEY')) {
    if (!foundSupabase) {
      newLines.push('# Supabase Configuration')
      foundSupabase = true
    }
    // Skip old values, we'll add new ones
    continue
  }
  newLines.push(line)
}

// Add Supabase variables
if (!foundSupabase) {
  newLines.push('')
  newLines.push('# Supabase Configuration')
}
newLines.push(`NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`)
newLines.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`)
newLines.push(`SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`)

writeFileSync(envPath, newLines.join('\n') + '\n')

console.log('\n✅ Environment variables saved to .env.local\n')

console.log('📋 Next Steps:')
console.log('   1. Run database schema:')
console.log('      - Go to Supabase Dashboard → SQL Editor')
console.log('      - Copy/paste contents of supabase/schema.sql')
console.log('      - Click "Run"')
console.log('')
console.log('   2. Create storage bucket:')
console.log('      - Go to Supabase Dashboard → Storage')
console.log('      - Click "Create bucket"')
console.log('      - Name: audio-files')
console.log('      - Set to Public')
console.log('')
console.log('   3. Test connection:')
console.log('      node scripts/test-supabase-connection.mjs')
console.log('')
console.log('   4. Upload audio files:')
console.log('      node scripts/upload-audio-to-supabase.mjs')

rl.close()

