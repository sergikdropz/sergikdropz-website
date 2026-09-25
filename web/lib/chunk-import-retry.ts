/** Retry dynamic import after stale dev chunks / CDN hiccups (ChunkLoadError). */
export function importWithChunkRetry<T>(
  importer: () => Promise<{ default: T }>,
  attempt = 0,
): Promise<{ default: T }> {
  return importer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const isChunkLoadError =
      (error instanceof Error && error.name === 'ChunkLoadError') ||
      /Loading chunk .+ failed/i.test(message) ||
      /Failed to fetch dynamically imported module/i.test(message) ||
      /__webpack_require__\.f\.j/i.test(message)

    if (!isChunkLoadError || attempt >= 2) throw error

    return new Promise<{ default: T }>((resolve, reject) => {
      window.setTimeout(() => {
        importWithChunkRetry(importer, attempt + 1).then(resolve).catch(reject)
      }, 600 + attempt * 400)
    })
  })
}

export function isLikelyChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    (error instanceof Error && error.name === 'ChunkLoadError') ||
    /Loading chunk .+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /__webpack_require__\.f\.j/i.test(message)
  )
}
