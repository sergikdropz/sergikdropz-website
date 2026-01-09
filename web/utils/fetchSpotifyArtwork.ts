// Utility to fetch Spotify album artwork
// This can be used in Next.js API routes or server components

export interface SpotifyTrack {
  id: string;
  name: string;
  album: {
    images: Array<{
      url: string;
      height: number;
      width: number;
    }>;
  };
}

/**
 * Fetch album artwork from Spotify using track/album name
 * Note: Requires Spotify Web API access token
 */
export async function fetchSpotifyArtwork(
  trackName: string,
  artistName: string = 'SERGIK'
): Promise<string | null> {
  // This would require Spotify Web API authentication
  // For now, returns null - implement with actual API call
  return null;
}

/**
 * Get Spotify image URL from embed API
 * Uses Spotify's oEmbed API which doesn't require authentication
 */
export async function getSpotifyImageFromEmbed(
  spotifyUrl: string
): Promise<string | null> {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
    const response = await fetch(oembedUrl);
    const data = await response.json();
    return data.thumbnail_url || null;
  } catch (error) {
    console.error('Error fetching Spotify embed:', error);
    return null;
  }
}

/**
 * Direct Spotify CDN URL format
 * Format: https://i.scdn.co/image/{image_hash}
 */
export function getSpotifyImageUrl(imageHash: string): string {
  return `https://i.scdn.co/image/${imageHash}`;
}

