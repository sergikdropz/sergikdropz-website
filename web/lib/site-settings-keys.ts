/** Stored in `settings` table (JSONB `value`). */
export const HOMEPAGE_INSTAGRAM_FEED_ENABLED_KEY = 'homepage_instagram_feed_enabled' as const

/** Manual post URL list from Instagram Helper — value shape `{ posts: string[], username?: string }`. */
export const INSTAGRAM_MANUAL_POSTS_KEY = 'instagram_manual_posts' as const

/** Bumped when admin publishes the music catalog to the live site. Value: number or `{ version: number }`. */
export const MUSIC_LIBRARY_PUBLISH_VERSION_KEY = 'music_library_publish_version' as const

