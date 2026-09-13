#!/usr/bin/env node

/**
 * Script to check if Supabase environment variables are set in Vercel
 * and provide instructions for adding them
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env.local')

console.log('🔍 Checking Supabase Environment Variables...\n')

// Read local .env.local file
let localEnv = {}
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      localEnv[key] = value
    }
  })
} catch (error) {
  console.log('⚠️  Could not read .env.local file')
  process.exit(1)
}

// Check for required variables
const requiredVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
]

console.log('📋 Local Environment Variables:')
requiredVars.forEach(key => {
  if (localEnv[key]) {
    const value = localEnv[key]
    const displayValue = value.length > 50 
      ? `${value.substring(0, 47)}...` 
      : value
    console.log(`   ✅ ${key}: ${displayValue}`)
  } else {
    console.log(`   ❌ ${key}: Missing`)
  }
})

console.log('\n📝 To add these to Vercel Production:')
console.log('\n1. Go to: https://vercel.com/jordan-cabogas-projects/sergikdropz-website/settings/environment-variables')
console.log('\n2. Add each variable:')
console.log('\n   Variable Name: NEXT_PUBLIC_SUPABASE_URL')
console.log(`   Value: ${localEnv.NEXT_PUBLIC_SUPABASE_URL || '<not set>'}`)
console.log('   Environment: Production (and optionally Preview, Development)')
console.log('   Click "Save"')

console.log('\n   Variable Name: NEXT_PUBLIC_SUPABASE_ANON_KEY')
console.log(`   Value: ${localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || '<not set>'}`)
console.log('   Environment: Production (and optionally Preview, Development)')
console.log('   Click "Save"')

console.log('\n   Variable Name: SUPABASE_SERVICE_ROLE_KEY')
console.log(`   Value: ${localEnv.SUPABASE_SERVICE_ROLE_KEY || '<not set>'}`)
console.log('   Environment: Production (and optionally Preview, Development)')
console.log('   Click "Save"')

console.log('\n3. After adding all variables:')
console.log('   - Go to "Deployments" tab')
console.log('   - Click "Redeploy" on the latest deployment')
console.log('   - Or push a new commit to trigger automatic deployment')

console.log('\n4. Verify the fix:')
console.log('   - Visit: https://sergikdropz.com/api/supabase-check')
console.log('   - Should show all ✅ green checkmarks')

console.log('\n💡 Quick Copy-Paste Values:\n')
requiredVars.forEach(key => {
  if (localEnv[key]) {
    console.log(`${key}=${localEnv[key]}`)
  }
})

console.log('\n✅ After adding to Vercel, files should load from Supabase!')
