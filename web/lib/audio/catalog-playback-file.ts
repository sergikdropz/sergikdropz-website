/**
 * Vault list rows sometimes keep a release-master URL that was copied onto
 * the wrong song. The linked audio_files row still names the real file.
 */

const ARTIST_OR_JOINER = /^(?:sergik|breauxx+|x|feat|ft|and|with)$/i

function slugifyMediaName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function stripTrailingVersion(slug: string): string {
  return slug
    .replace(/-v\d+$/i, '')
    .replace(/-\d+$/i, '')
    .replace(/\d+$/i, '')
    .replace(/-+$/g, '')
}

export function fileStem(value: string): string {
  const clean = value.split('?')[0].split('#')[0]
  let name = clean
  try {
    name = decodeURIComponent(clean)
  } catch {
    name = clean
  }
  const base = name.split('/').filter(Boolean).pop() || name
  return base.replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase()
}

/**
 * Filename belongs to this song. Same-folder neighbors (All Around on Walk Dat Walk)
 * do not match. A short artist prefix is allowed; a longer different title is not.
 */
export function mediaFileMatchesTrackTitle(fileRef: string, trackTitle: string): boolean {
  const titleSlug = stripTrailingVersion(slugifyMediaName(trackTitle || ''))
  const base = fileStem(fileRef).replace(/^[a-z0-9]{12}-/i, '')
  const nameSlug = stripTrailingVersion(slugifyMediaName(base))
  if (!titleSlug || !nameSlug) return false
  if (nameSlug === titleSlug) return true
  if (nameSlug.replace(/-/g, '') === titleSlug.replace(/-/g, '')) return true

  const nameWords = nameSlug.split('-').filter(Boolean)
  const titleWords = titleSlug.split('-').filter(Boolean)
  if (!nameWords.length || !titleWords.length) return false

  // DistroKid often shortens the filename ("everyday.wav" for Everyday Gratitude).
  // A different song ("all-around") is not a prefix of "walk-dat-walk".
  if (nameSlug.length >= 4 && (titleSlug === nameSlug || titleSlug.startsWith(`${nameSlug}-`))) {
    return true
  }

  if (nameWords.length < titleWords.length) return false
  const tail = nameWords.slice(-titleWords.length).join('-')
  if (tail !== titleSlug) return false

  const prefix = nameWords.slice(0, nameWords.length - titleWords.length)
  if (titleWords.length === 1) return prefix.every((word) => ARTIST_OR_JOINER.test(word))
  return prefix.length <= 4 && prefix.every((word) => ARTIST_OR_JOINER.test(word) || word.length <= 12)
}

/**
 * Automatic writers (DSP link, release merge) may store a file on a track only
 * when it is the same filename or it actually names that song.
 */
export function mayAssignTrackFile(opts: {
  trackTitle?: string | null
  nextUrl?: string | null
  currentUrl?: string | null
  isrc?: string | null
}): boolean {
  const nextUrl = String(opts.nextUrl || '').trim()
  if (!nextUrl) return false
  const currentUrl = String(opts.currentUrl || '').trim()
  if (currentUrl && fileStem(nextUrl) === fileStem(currentUrl)) return true
  const wantIsrc = String(opts.isrc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (wantIsrc.length >= 12 && fileStem(nextUrl).toUpperCase().includes(wantIsrc)) return true
  const title = String(opts.trackTitle || '').trim()
  if (title && mediaFileMatchesTrackTitle(nextUrl, title)) return true
  return !currentUrl && !title
}

export type VaultFileAlignment = {
  /** keep: stored URL already names this song. replace: catalog file does, stored URL does not. review: neither name matches. */
  action: 'keep' | 'replace' | 'review'
  reason: string
  /** Catalog path or URL to store when action is replace. */
  nextSource: string | null
}

/**
 * Stored vault file_url vs the linked audio_files row.
 * Replace only when the catalog file names this song and the stored URL does not.
 */
export function classifyVaultFileAlignment(opts: {
  title?: string | null
  libraryFileUrl?: string | null
  audioFilePath?: string | null
  audioFileUrl?: string | null
}): VaultFileAlignment {
  const title = String(opts.title || '').trim()
  const library = String(opts.libraryFileUrl || '').trim()
  const catalog = String(opts.audioFilePath || opts.audioFileUrl || '').trim()
  const libraryOk = Boolean(library && title && mediaFileMatchesTrackTitle(library, title))
  const catalogOk = Boolean(catalog && title && mediaFileMatchesTrackTitle(catalog, title))
  const sameStem = Boolean(library && catalog && fileStem(library) === fileStem(catalog))

  if (!library && !catalog) {
    return { action: 'review', reason: 'no file', nextSource: null }
  }
  if (sameStem) {
    return {
      action: 'keep',
      reason: libraryOk || catalogOk ? 'same file' : 'same file, title wording differs',
      nextSource: null,
    }
  }
  if (libraryOk && (!catalog || catalogOk)) {
    return { action: 'keep', reason: 'library names this song', nextSource: null }
  }
  if (!libraryOk && catalogOk) {
    return { action: 'replace', reason: 'stored url is a different song', nextSource: catalog }
  }
  if (libraryOk && catalog && !catalogOk) {
    return { action: 'keep', reason: 'catalog name drifts from title', nextSource: null }
  }
  if (!library && catalog) {
    return { action: 'review', reason: 'catalog file does not match title', nextSource: null }
  }
  return { action: 'review', reason: 'stored url does not match title', nextSource: null }
}

/** Library stream when it is the same song; otherwise the catalog audio file. */
export function catalogPlaybackSource(opts: {
  libraryFileUrl?: string | null
  audioFilePath?: string | null
  audioFileUrl?: string | null
}): string | null {
  const library = String(opts.libraryFileUrl || '').trim()
  const catalog = String(opts.audioFilePath || opts.audioFileUrl || '').trim()
  if (!library && !catalog) return null
  if (!catalog) return library
  if (!library) return catalog
  if (fileStem(library) === fileStem(catalog)) return library
  return catalog
}
