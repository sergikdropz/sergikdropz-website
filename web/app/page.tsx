import Link from 'next/link'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import SocialLinks from '@/components/SocialLinks'
import ReleaseCard from '@/components/ReleaseCard'
import HeroImage from '@/components/HeroImage'

export default function Home() {
  const latestReleases = releasesData.releases.slice(0, 3)

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <HeroImage 
          src="/images/gallery/desert-portrait-1.jpg" 
          alt="SERGIK desert portrait"
          priority
        />
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h1 className="text-7xl md:text-9xl font-bold mb-6 tracking-tight">
            SERGIK
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto">
            {artistData.bio.short}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12 max-w-3xl mx-auto">
            <Link
              href="/music"
              className="flex-1 px-8 py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors text-lg text-center"
            >
              Listen
            </Link>
            <Link
              href="/book"
              className="flex-1 px-8 py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors text-lg text-center"
            >
              Book
            </Link>
            <Link
              href="/epk"
              className="flex-1 px-8 py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-black transition-colors text-lg text-center"
            >
              Press / EPK
            </Link>
          </div>
          <SocialLinks />
        </div>
      </section>

      {/* Latest Releases */}
      <section className="py-20 bg-black">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold mb-12 text-center">Latest Releases</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {latestReleases.map((release) => (
              <ReleaseCard key={release.id} release={release} />
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              href="/music"
              className="text-gray-400 hover:text-white transition-colors"
            >
              View All Releases →
            </Link>
          </div>
        </div>
      </section>

      {/* Genres */}
      <section className="py-20 bg-gray-900">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold mb-12 text-center">Sound</h2>
          <div className="max-w-3xl mx-auto">
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">Primary Genres</h3>
              <div className="flex flex-wrap gap-3">
                {artistData.genres.primary.map((genre) => (
                  <span
                    key={genre}
                    className="px-4 py-2 bg-white text-black rounded-full text-sm font-medium"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Tags</h3>
              <div className="flex flex-wrap gap-3">
                {artistData.genres.secondary.map((tag) => (
                  <span
                    key={tag}
                    className="px-4 py-2 bg-gray-800 text-white rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

