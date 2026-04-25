#!/usr/bin/env node

/**
 * Check AI API Keys Configuration
 * This script checks if OpenAI and Anthropic API keys are configured
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync } from 'fs'

// Load .env.local explicitly
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const envPath = join(projectRoot, '.env.local')

if (existsSync(envPath)) {
  config({ path: envPath })
}

console.log('🔍 Checking AI API Keys Configuration\n')
console.log('=' .repeat(60))

// Check if .env.local exists
const envExists = existsSync(envPath)
console.log(`📁 .env.local file: ${envExists ? '✅ Found' : '❌ Not found'}`)

if (envExists) {
  try {
    const envContent = readFileSync(envPath, 'utf-8')
    const hasOpenAI = envContent.includes('OPENAI_API_KEY=')
    const hasAnthropic = envContent.includes('ANTHROPIC_API_KEY=')
    
    console.log(`\n📝 Environment file contains:`)
    console.log(`   OPENAI_API_KEY: ${hasOpenAI ? '✅ Present' : '❌ Missing'}`)
    console.log(`   ANTHROPIC_API_KEY: ${hasAnthropic ? '✅ Present' : '❌ Missing'}`)
  } catch (error) {
    console.log(`\n⚠️  Could not read .env.local: ${error.message}`)
  }
}

console.log('\n🔑 Runtime Environment Variables:')
console.log('=' .repeat(60))

// Check environment variables (from process.env)
const openaiKey = process.env.OPENAI_API_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

const openaiStatus = openaiKey 
  ? (openaiKey.length > 20 ? `✅ Configured (${openaiKey.substring(0, 10)}...${openaiKey.substring(openaiKey.length - 4)})` : '⚠️  Present but seems invalid')
  : '❌ Not set'

const anthropicStatus = anthropicKey
  ? (anthropicKey.length > 20 ? `✅ Configured (${anthropicKey.substring(0, 10)}...${anthropicKey.substring(anthropicKey.length - 4)})` : '⚠️  Present but seems invalid')
  : '❌ Not set'

console.log(`OPENAI_API_KEY: ${openaiStatus}`)
console.log(`ANTHROPIC_API_KEY: ${anthropicStatus}`)

console.log('\n📊 Configuration Summary:')
console.log('=' .repeat(60))

const hasOpenAI = !!openaiKey && openaiKey.length > 20
const hasAnthropic = !!anthropicKey && anthropicKey.length > 20

if (hasOpenAI && hasAnthropic) {
  console.log('✅ Both API keys are configured')
  console.log('   → System will use OpenAI first, then Anthropic as fallback')
} else if (hasOpenAI) {
  console.log('✅ OpenAI API key is configured')
  console.log('   → System will use OpenAI, with basic fallback if it fails')
} else if (hasAnthropic) {
  console.log('✅ Anthropic API key is configured')
  console.log('   → System will use Anthropic, with basic fallback if it fails')
} else {
  console.log('⚠️  No AI API keys are configured')
  console.log('   → System will use basic fallback analysis (no AI)')
  console.log('   → MusicBrainz and comprehensive data will still be included')
}

console.log('\n💡 Next Steps:')
console.log('=' .repeat(60))

if (!hasOpenAI && !hasAnthropic) {
  console.log('To enable AI-powered Sonic DNA analysis:')
  console.log('')
  console.log('1. Get an API key:')
  console.log('   - OpenAI: https://platform.openai.com/api-keys')
  console.log('   - Anthropic: https://console.anthropic.com/settings/keys')
  console.log('')
  console.log('2. Add to web/.env.local:')
  console.log('   OPENAI_API_KEY=sk-...')
  console.log('   # OR')
  console.log('   ANTHROPIC_API_KEY=sk-ant-api03-...')
  console.log('')
  console.log('3. Restart your development server')
} else {
  console.log('✅ API keys are configured!')
  console.log('   → Sonic DNA analysis will use AI when regenerating tracks')
  console.log('   → Check server logs during analysis to see which provider is used')
}

console.log('\n' + '=' .repeat(60))
console.log('')

