import Link from 'next/link'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import SocialLinks from '@/components/SocialLinks'
import ReleaseCard from '@/components/ReleaseCard'
import HomeInstagramFeedSection from '@/components/HomeInstagramFeedSection'
import HomeFollowCta from '@/components/HomeFollowCta'
import { getHomepageInstagramFeedEnabled } from '@/lib/marketing/homepage-flags'

export const revalidate = 300

function getLatestReleases() {
  const today = new Date().toISOString().slice(0, 10)
  const fromSchedule = releaseSchedule.schedule
    .filter((r) => r.release_date <= today)
    .sort((a, b) => b.release_date.localeCompare(a.release_date))
    .map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      year: Number(r.release_date.slice(0, 4)),
      platforms: ['Spotify', 'Apple Music', 'SoundCloud'],
      spotify_url: '',
      soundcloud_url: '',
      image: r.artwork || '',
      fetch_from_spotify: false,
    }))
  const merged = [...fromSchedule, ...releasesData.releases]
  const unique = Array.from(new Map(merged.map((r) => [r.id, r])).values())
  return unique.slice(0, 4)
}

export default async function Home() {
  const latestReleases = getLatestReleases()
  const instagramUsername = artistData.platforms.instagram
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\/$/, '')
    .replace('@', '')
  const instagramFeedEnabled = await getHomepageInstagramFeedEnabled()

  return (
    <div className="pt-20">
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/50 via-black/35 to-black/80" aria-hidden />

        <div className="relative z-10 container mx-auto px-4 text-center sm:px-6">
          <h1 className="font-six-caps-hero mb-4 text-5xl font-bold tracking-tight sm:mb-6 sm:text-7xl md:mb-8 md:text-[12rem] lg:text-[14rem]">
            SERGIK
          </h1>
          <p className="mx-auto mb-8 max-w-2xl px-2 text-base leading-relaxed text-ink-muted drop-shadow-lg sm:mb-10 sm:text-lg md:text-xl">
            {artistData.bio.short}
          </p>
          <div className="mx-auto mb-8 flex max-w-xl flex-col items-center justify-center gap-3 px-2 sm:mb-12">
            <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/music"
                className="touch-target inline-flex min-h-[48px] min-w-[12rem] items-center justify-center rounded-ui bg-ink px-8 py-3 text-base font-semibold text-ink-inverse transition hover:bg-ink-muted"
              >
                Listen
              </Link>
              <Link
                href="/videos"
                className="touch-target inline-flex min-h-[48px] min-w-[12rem] items-center justify-center rounded-ui border border-ink/80 bg-surface/90 px-8 py-3 text-base font-semibold text-ink transition hover:bg-ink hover:text-ink-inverse"
              >
                Watch
              </Link>
            </div>
            <HomeFollowCta />
          </div>
          <div className="mb-6 flex flex-wrap items-center justify-center gap-4 text-sm text-ink-subtle">
            <Link href="/epk" className="hover:text-ink">
              Press / EPK
            </Link>
            <Link href="/shop" className="hover:text-ink">
              Shop
            </Link>
          </div>
          <div className="animate-fade-in">
            <SocialLinks />
          </div>
        </div>
      </section>

      <HomeInstagramFeedSection username={instagramUsername} enabled={instagramFeedEnabled} />

      <section className="py-8 sm:py-12 md:py-16 lg:py-20 relative z-10">
        <div className="container mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 sm:mb-8 md:mb-12 text-center">
            Latest Releases
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-6 md:gap-8">
            {latestReleases.map((release, index) => (
              <ReleaseCard key={release.id} release={release} priority={index < 2} />
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="/music" className="text-gray-400 hover:text-white transition-colors">
              View All Releases →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
