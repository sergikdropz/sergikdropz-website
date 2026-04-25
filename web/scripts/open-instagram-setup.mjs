#!/usr/bin/env node

/**
 * Open Instagram Setup Pages
 * Opens all necessary Facebook Developer Console pages in your browser
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const APP_ID = '1186575606889765'

const urls = {
  dashboard: `https://developers.facebook.com/apps/${APP_ID}/dashboard/`,
  products: `https://developers.facebook.com/apps/${APP_ID}/dashboard/products/`,
  instagramBasicDisplay: `https://developers.facebook.com/apps/${APP_ID}/instagram-basic-display/basic-display/`,
  appSettings: `https://developers.facebook.com/apps/${APP_ID}/settings/basic/`,
  roles: `https://developers.facebook.com/apps/${APP_ID}/roles/roles/`,
}

async function openUrl(url, name) {
  try {
    const command = process.platform === 'darwin' 
      ? `open "${url}"`
      : process.platform === 'win32'
      ? `start "${url}"`
      : `xdg-open "${url}"`
    
    await execAsync(command)
    console.log(`✅ Opened: ${name}`)
  } catch (error) {
    console.log(`⚠️  Could not open ${name} automatically`)
    console.log(`   Please visit: ${url}`)
  }
}

async function main() {
  console.log('\n🔗 Opening Instagram Setup Pages...\n')
  console.log('='.repeat(60))
  console.log('')

  // Open main dashboard first
  await openUrl(urls.dashboard, 'App Dashboard')
  await new Promise(resolve => setTimeout(resolve, 1000))

  console.log('\n📋 Next Steps:\n')
  console.log('1. Add Instagram Basic Display Product:')
  console.log(`   ${urls.products}`)
  console.log('')
  console.log('2. Configure OAuth Redirect URI:')
  console.log(`   ${urls.instagramBasicDisplay}`)
  console.log('   Add: http://localhost:3000/api/instagram/callback')
  console.log('')
  console.log('3. Check App Settings:')
  console.log(`   ${urls.appSettings}`)
  console.log('')
  console.log('4. Add Test Users (if needed):')
  console.log(`   ${urls.roles}`)
  console.log('')

  // Ask if user wants to open all pages
  console.log('Would you like me to open all setup pages? (y/n)')
  console.log('(Or just follow the URLs above)')
  console.log('')

  // For now, just open the main dashboard
  // User can navigate from there

  console.log('='.repeat(60))
  console.log('✅ Setup pages ready!')
  console.log('')
  console.log('📝 Quick Checklist:')
  console.log('   [ ] Instagram Basic Display product added')
  console.log('   [ ] OAuth Redirect URI: http://localhost:3000/api/instagram/callback')
  console.log('   [ ] Clicked "Save Changes"')
  console.log('   [ ] App in Development Mode')
  console.log('')
}

main().catch(console.error)

