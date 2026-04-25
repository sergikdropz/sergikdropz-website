#!/usr/bin/env node

/**
 * Script to update Vercel project root directory via API
 * This requires VERCEL_TOKEN environment variable or Vercel CLI authentication
 */

const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = 'prj_imdiPIfdkckM5JlbpXJYxG02C146';
const ORG_ID = 'team_P4lPsgGf0YY1um2XFIudRtLU';
const ROOT_DIRECTORY = 'web';

// Try to get token from environment or Vercel CLI config
function getToken() {
  // Check environment variable first
  if (process.env.VERCEL_TOKEN) {
    return process.env.VERCEL_TOKEN;
  }
  
  // Try to get from Vercel CLI config
  try {
    const configPath = require('os').homedir() + '/.vercel/auth.json';
    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const tokens = config.tokens || {};
      const tokenKey = Object.keys(tokens).find(key => 
        tokens[key].includes('vercel.com')
      );
      if (tokenKey && tokens[tokenKey]) {
        return tokens[tokenKey];
      }
    }
  } catch (e) {
    console.error('Could not read Vercel config:', e.message);
  }
  
  return null;
}

function updateProjectRoot(token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      rootDirectory: ROOT_DIRECTORY
    });

    const options = {
      hostname: 'api.vercel.com',
      path: `/v9/projects/${PROJECT_ID}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✅ Successfully updated root directory to:', ROOT_DIRECTORY);
          console.log('Response:', JSON.parse(body));
          resolve(JSON.parse(body));
        } else {
          console.error('❌ Failed to update root directory');
          console.error('Status:', res.statusCode);
          console.error('Response:', body);
          reject(new Error(`API returned ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔧 Attempting to update Vercel project root directory...');
  console.log('Project ID:', PROJECT_ID);
  console.log('Root Directory:', ROOT_DIRECTORY);
  
  const token = getToken();
  
  if (!token) {
    console.error('❌ No Vercel token found.');
    console.error('Please set VERCEL_TOKEN environment variable or ensure you are logged in via Vercel CLI.');
    console.error('\nTo get your token:');
    console.error('1. Go to https://vercel.com/account/tokens');
    console.error('2. Create a new token');
    console.error('3. Run: export VERCEL_TOKEN=your_token_here');
    console.error('4. Then run this script again');
    process.exit(1);
  }
  
  try {
    await updateProjectRoot(token);
    console.log('\n✅ Root directory updated successfully!');
    console.log('🔄 Vercel will automatically redeploy with the new settings.');
  } catch (error) {
    console.error('\n❌ Error updating root directory:', error.message);
    console.error('\n💡 Alternative: Update manually in Vercel Dashboard:');
    console.error('   1. Go to https://vercel.com/dashboard');
    console.error('   2. Open "sergikdropz-website" project');
    console.error('   3. Go to Settings → General');
    console.error('   4. Set Root Directory to "web"');
    process.exit(1);
  }
}

main();

