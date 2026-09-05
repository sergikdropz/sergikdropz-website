/** Human-readable countdown from Release Studio `releaseDate` (ISO or parseable). */
export function formatReleaseCountdownLabel(releaseDate: string | null | undefined): string | null {
  const s = releaseDate?.trim()
  if (!s) return null
  const end = Date.parse(s)
  if (!Number.isFinite(end)) return null
  const days = Math.round((end - Date.now()) / 86_400_000)
  if (days > 1) return `${days}d to release`
  if (days === 1) return '1d to release'
  if (days === 0) return 'Release today'
  if (days < 0) return `${Math.abs(days)}d past target`
  return null
}
