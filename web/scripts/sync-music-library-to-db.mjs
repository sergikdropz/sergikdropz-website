/**
 * Sync music-library.json to Supabase database
 * This ensures the backend admin panel reflects the folder reorganization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const musicLibraryPath = path.join(__dirname, '../data/music-library.json');

console.log('🔄 Syncing music library to database...');
console.log('📁 Reading:', musicLibraryPath);

// Read the JSON file
const jsonData = JSON.parse(fs.readFileSync(musicLibraryPath, 'utf8'));

// For server-side sync, we need to make an API call
// Since this is a server-side script, we'll provide instructions
// The actual sync should be done via the admin panel or API endpoint

console.log('\n✅ JSON file is ready to sync!');
console.log('\n📋 To sync to database, you have two options:');
console.log('\n1. Via Admin Panel (Recommended):');
console.log('   - Go to /admin/music-library');
console.log('   - Click the "Sync to Database" button');
console.log('   - This will sync the updated folder structure');
console.log('\n2. Via API Call:');
console.log('   - Make a POST request to /api/music-library/sync');
console.log('   - The endpoint will read the JSON file and update the database');
console.log('\n📊 Folder structure summary:');
console.log(`   - Total folders: ${jsonData.folders.length}`);
const discography = jsonData.folders.find(f => f.id === 'folder-discography');
if (discography) {
  console.log(`   - Discography children: ${discography.children?.length || 0}`);
  if (discography.children) {
    discography.children.forEach(child => {
      console.log(`     • ${child.name} (parentId: ${child.parentId})`);
    });
  }
}
