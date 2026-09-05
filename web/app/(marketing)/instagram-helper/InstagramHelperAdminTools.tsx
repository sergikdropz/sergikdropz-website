'use client'

import Image from 'next/image'

export type AdminMediaPost = Record<string, unknown>

type Props = {
  adminPosts: AdminMediaPost[]
  loadingAdminPosts: boolean
  scraping: boolean
  processing: boolean
  onScrape: () => void
  onProcessVideos: () => void
  onRefreshAdmin: () => void
  onDeletePost: (id: string) => void
}

export default function InstagramHelperAdminTools({
  adminPosts,
  loadingAdminPosts,
  scraping,
  processing,
  onScrape,
  onProcessVideos,
  onRefreshAdmin,
  onDeletePost,
}: Props) {
  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-700/30 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">🔧 Admin Tools</h2>
          <p className="text-gray-300 text-sm">Manage all Instagram posts in the database</p>
        </div>
        <a
          href="/admin"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition"
        >
          Admin Dashboard →
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          type="button"
          onClick={onScrape}
          disabled={scraping}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {scraping ? '⏳ Scraping...' : '🔍 Scrape Posts'}
        </button>
        <button
          type="button"
          onClick={onProcessVideos}
          disabled={processing}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {processing ? '⏳ Processing...' : '🎬 Process Videos'}
        </button>
      </div>

      <div className="bg-gray-900/50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">All Posts ({adminPosts.length})</h3>
          <button
            type="button"
            onClick={onRefreshAdmin}
            disabled={loadingAdminPosts}
            className="text-gray-400 hover:text-white transition text-sm"
          >
            {loadingAdminPosts ? 'Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {loadingAdminPosts ? (
          <div className="text-center py-8 text-gray-400">Loading posts...</div>
        ) : adminPosts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No posts found in database.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {adminPosts.map((post, idx: number) => {
              const thumb =
                (post.mediaUrl as string) ||
                (post.thumbnail_url as string) ||
                (post.thumbnailUrl as string)
              const permalink =
                (post.permalink as string) ||
                (post.post_url as string) ||
                (post.url as string) ||
                ''
              const caption = (post.caption as string) || ''
              const isVideo =
                post.type === 'video' ||
                post.media_type === 'VIDEO' ||
                post.media_type === 'video'
              const videoSrc = (post.videoUrl as string) || (post.video_url as string)
              const rowId = (post.id as string) || permalink || String(idx)

              return (
                <div
                  key={rowId}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden hover:border-pink-500 transition"
                >
                  <div className="aspect-square bg-gray-900 relative">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt={caption || 'Instagram'}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 25vw"
                        unoptimized
                      />
                    ) : isVideo && videoSrc ? (
                      <video
                        src={videoSrc}
                        className="w-full h-full object-cover"
                        controls
                        playsInline
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2">
                        <span className="text-gray-500 text-xs text-center">No preview</span>
                      </div>
                    )}
                    {isVideo && (
                      <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                        VIDEO
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-400 mb-2 line-clamp-2">{caption || '—'}</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => permalink && window.open(permalink, '_blank')}
                        className="text-pink-400 hover:text-pink-300 text-xs transition flex-1 text-left"
                      >
                        View on IG
                      </button>
                      {post.id ? (
                        <button
                          type="button"
                          onClick={() => onDeletePost(post.id as string)}
                          className="text-red-400 hover:text-red-300 text-xs transition"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
