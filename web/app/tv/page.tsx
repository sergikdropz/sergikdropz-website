import videosData from '@/data/videos.json'
import releasesData from '@/data/releases.json'
import releaseSchedule from '@/data/release-schedule.json'
import playlistsData from '@/data/soundcloud-playlists.json'
import TvScreen from '@/components/tv/TvScreen'
import { buildTvListen, buildTvReleases, buildTvVideos } from '@/lib/tv/catalog'
import { attachTvPlayback } from '@/lib/tv/playback-server'
import { getPublicLiveReleaseById, getPublicLiveReleases } from '@/lib/marketing/public-releases'
import { normalizeCatalog, publicVideos, sortCatalogVideos } from '@/lib/videos/catalog-model'

export const revalidate = 300

export default async function TvPage() {
  const videos = sortCatalogVideos(publicVideos(normalizeCatalog(videosData)))
  const liveList = await getPublicLiveReleases()
  const detailed = await Promise.all(liveList.slice(0, 12).map((release) => getPublicLiveReleaseById(release.id)))
  const live = liveList.map((release, index) => {
    if (index >= 12) return release
    return detailed[index] || release
  })
  const today = new Date().toISOString().slice(0, 10)

  const releases = await attachTvPlayback(
    buildTvReleases({
      live,
      staticReleases: releasesData.releases,
      schedule: releaseSchedule.schedule,
      today,
    }),
  )

  const catalog = {
    videos: buildTvVideos(videos),
    listen: buildTvListen(playlistsData.playlists),
    releases,
  }

  return <TvScreen catalog={catalog} />
}
