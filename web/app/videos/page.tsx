import videosData from '@/data/videos.json'
import VideoCard from '@/components/VideoCard'
import artistData from '@/data/artist.json'

export default function Videos() {
  const videos = videosData.videos

  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">Videos</h1>
          <p className="text-gray-400 text-lg leading-relaxed mb-6">
            Watch live performances, studio sessions, and behind-the-scenes content.
          </p>
          {videosData.youtube_channel && (
            <a
              href={videosData.youtube_channel}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-white hover:text-gray-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>View All on YouTube</span>
            </a>
          )}
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

