/**
 * WAV masters were migrated to MP3 in Supabase `audio-files` bucket.
 * Stale clients may still hold .wav URLs (localStorage, SW, old bundles).
 * Rewrite known vault URLs/paths to .mp3 so playback hits existing objects.
 */
export function normalizeVaultAudioUrl(urlOrPath: string): string {
  if (!urlOrPath || typeof urlOrPath !== 'string') return urlOrPath
  if (!/\.wav(?=$|[?#])/i.test(urlOrPath)) return urlOrPath

  const isSupabaseAudioObject =
    urlOrPath.includes('supabase.co') &&
    urlOrPath.includes('/object/public/audio-files/')

  if (isSupabaseAudioObject || urlOrPath.startsWith('unreleased/') || urlOrPath.startsWith('/audio/')) {
    return urlOrPath.replace(/\.wav(?=$|[?#])/i, '.mp3')
  }

  return urlOrPath
}
