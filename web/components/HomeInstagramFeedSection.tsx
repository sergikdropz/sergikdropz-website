'use client'

import InstagramEmbed from '@/components/InstagramEmbed'

interface HomeInstagramFeedSectionProps {
  username: string
  /** Resolved on the server — avoids a client round-trip to /api/public/homepage-flags */
  enabled?: boolean
}

const HOMEPAGE_INSTAGRAM_MAX_POSTS = 9

/**
 * Homepage Instagram block — visibility from server props, env, or admin toggle.
 */
export default function HomeInstagramFeedSection({
  username,
  enabled = true,
}: HomeInstagramFeedSectionProps) {
  if (!enabled) return null

  return (
    <section className="py-8 sm:py-12 md:py-16 lg:py-20 relative z-10 bg-gradient-to-b from-transparent via-black/30 to-transparent">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div
            className="max-h-[min(70vh,52rem)] overflow-y-auto overscroll-contain rounded-lg border border-white/10 [scrollbar-gutter:stable]"
            aria-label="Instagram feed"
          >
            <InstagramEmbed
              username={username}
              className="w-full"
              maxPosts={HOMEPAGE_INSTAGRAM_MAX_POSTS}
              gridClassName="grid-cols-2 sm:grid-cols-3"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
