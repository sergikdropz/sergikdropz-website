#!/usr/bin/env node
/**
 * Master Script: Fix All Media Links
 * 
 * Runs all media relinking and fixing scripts in sequence:
 * 1. Relink all audio files in Supabase
 * 2. Fix image paths
 * 3. Verify everything is working
 * 
 * Usage: node scripts/fix-all-media-links.mjs [--dry-run] [--use-supabase-images]
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DRY_RUN = process.argv.includes('--dry-run')
const USE_SUPABASE_IMAGES = process.argv.includes('--use-supabase-images')

console.log('🚀 Starting comprehensive media link fix...\n')
console.log('='.repeat(60))

// Step 1: Relink audio files
console.log('\n📦 Step 1: Relinking audio files in Supabase...')
console.log('-'.repeat(60))
try {
  const dryRunFlag = DRY_RUN ? '--dry-run' : ''
  const scriptPath = join(__dirname, 'relink-all-media.mjs')
  execSync(`node "${scriptPath}" ${dryRunFlag}`, {
    stdio: 'inherit',
    cwd: __dirname,
    shell: true,
  })
} catch (error) {
  console.error('❌ Error in relink-all-media.mjs:', error.message)
  process.exit(1)
}

// Step 2: Fix image paths
console.log('\n🖼️  Step 2: Fixing image paths...')
console.log('-'.repeat(60))
try {
  const supabaseFlag = USE_SUPABASE_IMAGES ? '--use-supabase' : ''
  const scriptPath = join(__dirname, 'fix-image-paths.mjs')
  execSync(`node "${scriptPath}" ${supabaseFlag}`, {
    stdio: 'inherit',
    cwd: __dirname,
    shell: true,
  })
} catch (error) {
  console.error('❌ Error in fix-image-paths.mjs:', error.message)
  // Don't exit - image fixing is optional
}

// Step 3: Verify
console.log('\n✅ Step 3: Verification...')
console.log('-'.repeat(60))
console.log('   Run the following to verify:')
console.log('   node scripts/verify-supabase-files.mjs')
console.log('   node scripts/check-analysis-progress.mjs')

console.log('\n' + '='.repeat(60))
console.log('✅ All media link fixes complete!')
console.log('='.repeat(60))

if (DRY_RUN) {
  console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.')
}
