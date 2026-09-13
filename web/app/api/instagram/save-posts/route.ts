import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { INSTAGRAM_MANUAL_POSTS_KEY } from '@/lib/site-settings-keys'

/** Must satisfy `instagram_media.media_url` NOT NULL before process-posts runs. */
const PENDING_MEDIA_PLACEHOLDER = '/images/gallery/logo.png'

function extractPostId(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^/?]+)/)
  return match ? match[1] : null
}

function extractUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/([^/]+)/)
  return match && !['p', 'reel', 'tv'].includes(match[1]) ? match[1] : null
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ])
}

export async function POST(request: Request) {
  try {
    const { posts } = await request.json()

    if (!Array.isArray(posts)) {
      return NextResponse.json(
        { error: 'Posts must be an array' },
        { status: 400 }
      )
    }

    const isValidInstagramUrl = (url: string): boolean => {
      if (!url || typeof url !== 'string' || url.trim() === '') return false
      return url.includes('instagram.com/p/') || url.includes('instagram.com/reel/')
    }

    const validPostsRaw = posts.filter((post: string) => isValidInstagramUrl(post))
    const seen = new Set<string>()
    const validPosts: string[] = []
    for (const p of validPostsRaw) {
      const key = p.split('?')[0].trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      validPosts.push(p)
    }

    const filePath = join(process.cwd(), 'data', 'instagram-posts.json')
    let currentData = { username: 'sergikdropz', posts: [] as string[] }

    try {
      const fileContent = readFileSync(filePath, 'utf-8')
      currentData = JSON.parse(fileContent)
    } catch {
      // File missing or invalid
    }

    const updatedData = {
      username: currentData.username || 'sergikdropz',
      posts: validPosts,
      note: (currentData as { note?: string }).note || 'Instagram posts for homepage display',
    }

    let fileSaved = false
    let fileError: string | null = null
    try {
      await withTimeout(
        writeFile(filePath, JSON.stringify(updatedData, null, 2) + '\n', 'utf-8'),
        12_000
      )
      fileSaved = true
    } catch (e) {
      fileError = e instanceof Error ? e.message : 'File write failed'
      console.error('instagram save-posts: data/instagram-posts.json not written:', e)
    }

    let dbSaved = 0
    let settingsSaved = false
    try {
      const supabase = createSupabaseServerClient()

      const { error: settingsError } = await supabase.from('settings').upsert(
        {
          key: INSTAGRAM_MANUAL_POSTS_KEY,
          value: {
            posts: validPosts,
            username: updatedData.username,
            updated_at: new Date().toISOString(),
          },
          description: 'Manual Instagram post URLs from Instagram Helper',
        },
        { onConflict: 'key' }
      )

      if (!settingsError) {
        settingsSaved = true
      } else {
        console.error('instagram save-posts: settings upsert failed:', settingsError)
      }

      if (validPosts.length > 0) {
        const rows = validPosts.map((postUrl: string) => {
          const cleanUrl = postUrl.split('?')[0].trim()
          const isVideo = cleanUrl.includes('/reel/')
          const postId = extractPostId(cleanUrl)
          const username =
            extractUsername(cleanUrl) || currentData.username || 'sergikdropz'

          return {
            post_url: cleanUrl,
            permalink: cleanUrl,
            media_type: isVideo ? ('video' as const) : ('image' as const),
            media_url: PENDING_MEDIA_PLACEHOLDER,
            thumbnail_url: null as string | null,
            video_url: null as string | null,
            caption: null as string | null,
            username,
            post_id: postId,
            width: null as number | null,
            height: null as number | null,
            duration_seconds: null as number | null,
            metadata: {} as Record<string, unknown>,
            is_active: true,
            error_message: null as string | null,
            updated_at: new Date().toISOString(),
          }
        })

        const { error: batchError } = await supabase
          .from('instagram_media')
          .upsert(rows, { onConflict: 'post_url' })

        if (!batchError) {
          dbSaved = validPosts.length
        } else {
          console.error('instagram save-posts: instagram_media batch upsert failed:', batchError)
        }
      }
    } catch (dbError) {
      console.error('Error saving to database / settings:', dbError)
    }

    if (!fileSaved && !settingsSaved) {
      return NextResponse.json(
        {
          error: 'Could not persist posts',
          details:
            fileError ||
            'Write to data/instagram-posts.json failed and Supabase settings save failed. Check server logs and env (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL).',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Saved ${validPosts.length} post(s)${dbSaved > 0 ? ` (${dbSaved} rows in instagram_media)` : ''}${settingsSaved ? '; list stored in site settings' : ''}${!fileSaved && fileError ? ` (file: ${fileError})` : ''}. Use "Process videos" if you need downloads to storage.`,
      posts: validPosts,
      dbSaved,
      fileSaved,
      settingsSaved,
    })
  } catch (error: unknown) {
    console.error('Error saving Instagram posts:', error)
    return NextResponse.json(
      {
        error: 'Failed to save posts',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
