// Quick script to get Spotify album artwork URLs
// Uses Spotify's public embed/oEmbed API

const releases = [
  { id: 'soul-candy', title: 'Soul Candy', search: 'SERGIK Soul Candy' },
  { id: 'ftp', title: 'FTP', search: 'SERGIK FTP' },
  { id: 'a-good-day', title: 'A Good Day', search: 'SERGIK A Good Day Be Janis' },
  { id: 'repeat-cozy-catz', title: 'Repeat', search: 'SERGIK Repeat Cozy Catz' },
  { id: 'say-yeah-remix', title: 'Say Yeah', search: 'SERGIK Say Yeah Remix' },
  { id: 'funky-bounce', title: 'Funky Bounce', search: 'SERGIK Funky Bounce' },
];

console.log('Spotify Album Artwork URLs');
console.log('==========================\n');
console.log('To get album artwork:');
console.log('1. Visit: https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H');
console.log('2. Find each release and get the album artwork URL');
console.log('3. Or use Spotify Web API with authentication\n');

// Spotify image URL format: https://i.scdn.co/image/{image_id}
// We need the actual image IDs from Spotify

