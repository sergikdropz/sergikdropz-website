import releasesData from '@/data/releases.json'
import ReleaseCard from '@/components/ReleaseCard'

export default function Music() {
  const releases = releasesData.releases

  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold mb-12">Music</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {releases.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </div>
      </div>
    </div>
  )
}

