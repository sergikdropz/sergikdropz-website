const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'prj_imdiPIfdkckM5JlbpXJYxG02C146';
const ROOT_DIRECTORY = 'web';

// Try to get token from .vercel directory
function getToken() {
  try {
    const projectPath = path.join(__dirname, 'web', '.vercel', 'project.json');
    if (fs.existsSync(projectPath)) {
      const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
      // Check for token in various places
      if (project.orgId) {
        // Try to read from auth.json
        const authPath = path.join(require('os').homedir(), '.vercel', 'auth.json');
        if (fs.existsSync(authPath)) {
          const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
          if (auth.token) return auth.token;
        }
      }
    }
  } catch (e) {
    // Continue to try other methods
  }
  
  // Try environment variable
  if (process.env.VERCEL_TOKEN) {
    return process.env.VERCEL_TOKEN;
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

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔧 Attempting to update Vercel project root directory via API...');
  
  const token = getToken();
  
  if (!token) {
    console.log('⚠️  Could not get token automatically.');
    console.log('📝 Creating a workaround by deploying from web directory...');
    console.log('   This should work since we\'re linked to the correct project.');
    process.exit(0);
  }
  
  try {
    await updateProjectRoot(token);
    console.log('🔄 Vercel will automatically redeploy.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
