import videosData from '@/data/videos.json'
import VideoCard from '@/components/VideoCard'
import artistData from '@/data/artist.json'

export default function Videos() {
  const videos = videosData.videos

  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="max-w-4xl mx-auto mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 text-center font-six-caps" style={{ 
            fontSize: '81px', 
            letterSpacing: '6.3px', 
            lineHeight: '104px',
            backgroundImage: 'linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(255, 255, 255, 1) 63%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            borderWidth: '1px',
            borderColor: 'rgba(255, 255, 255, 1)'
          }}>Videos</h1>
          <p className="text-gray-400 text-lg leading-relaxed mb-6">
            Watch live performances, studio sessions, and behind-the-scenes content.
          </p>
        </div>

        {videos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-4">No videos added yet.</p>
            <p className="text-gray-500 text-sm">
              Add videos to <code className="bg-gray-900 px-2 py-1 rounded">web/data/videos.json</code>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

