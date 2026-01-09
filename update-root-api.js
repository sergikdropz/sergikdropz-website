const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = 'prj_imdiPIfdkckM5JlbpXJYxG02C146';
const ROOT_DIRECTORY = 'web';

// Try to get token from Vercel CLI
function getToken() {
  try {
    // Try to get from vercel whoami to ensure we're logged in
    execSync('npx vercel whoami', { stdio: 'pipe' });
    
    // Try to read from common locations
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    
    // Check for token in environment
    if (process.env.VERCEL_TOKEN) {
      return process.env.VERCEL_TOKEN;
    }
    
    // Try to get from vercel config
    const configPath = path.join(os.homedir(), '.vercel', 'auth.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Vercel stores tokens differently, let's try to find it
      if (config.token) return config.token;
      if (config.tokens) {
        const tokenKey = Object.keys(config.tokens)[0];
        if (tokenKey) return config.tokens[tokenKey];
      }
    }
  } catch (e) {
    console.error('Error getting token:', e.message);
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
    console.error('\n❌ Could not automatically get Vercel token.');
    console.error('\n💡 Please update manually in Vercel Dashboard:');
    console.error('   1. Go to https://vercel.com/dashboard');
    console.error('   2. Open "sergikdropz-website" project');
    console.error('   3. Go to Settings → General');
    console.error('   4. Set Root Directory to "web"');
    console.error('   5. Click Save');
    process.exit(1);
  }
  
  try {
    await updateProjectRoot(token);
    console.log('\n✅ Root directory updated successfully!');
    console.log('🔄 Vercel will automatically redeploy with the new settings.');
  } catch (error) {
    console.error('\n❌ Error updating root directory:', error.message);
    console.error('\n💡 Please update manually in Vercel Dashboard (see above)');
    process.exit(1);
  }
}

main();
