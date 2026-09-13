import { NextResponse } from 'next/server'
import instagramPostsData from '@/data/instagram-posts.json'
import { loadManualPostsFromSettings } from '@/lib/instagram/manual-posts-settings'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username')
  const limit = parseInt(searchParams.get('limit') || '6', 10)
  /** Instagram Helper form: only saved URLs (settings + JSON), never Graph API permalinks */
  const manualOnly =
    searchParams.get('manualOnly') === '1' ||
    searchParams.get('manualOnly') === 'true' ||
    searchParams.get('manual') === '1'

  try {
    // Try to fetch from Instagram API if credentials are available
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const userId = process.env.INSTAGRAM_USER_ID

    if (!manualOnly && accessToken && userId) {
      try {
        // Fetch recent media from Instagram Graph API
        // Instagram Graph API uses graph.facebook.com, not graph.instagram.com
        // Note: Includes collaboration posts where you are the original author
        // Posts where you were added as a collaborator (not the author) are not accessible via API
        const apiUrl = `https://graph.facebook.com/v18.0/${userId}/media?fields=id,media_type,media_url,permalink,timestamp,caption,username&access_token=${accessToken}&limit=${limit}`
        const response = await fetch(apiUrl)
        
        if (response.ok) {
          const data = await response.json()
          if (data.data && data.data.length > 0) {
            const posts = data.data.map((item: any) => item.permalink)
            return NextResponse.json({
              posts,
              total: posts.length,
              source: 'api',
            })
          }
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('Instagram API error:', response.status, errorData)
          // Fall through to use data file
        }
      } catch (apiError) {
        console.error('Instagram API request error:', apiError)
        // Fall through to use data file
      }
    }

    // Fallback: Site settings (Instagram Helper) then data file
    const manual = await loadManualPostsFromSettings()
    const posts = manual?.posts ?? instagramPostsData.posts ?? []

    const realPosts = posts.filter(
      (post: string) => !post.includes('EXAMPLE_POST')
    )

    if (realPosts.length === 0) {
      return NextResponse.json({
        posts: [],
        message: 'No posts configured. Add post URLs to web/data/instagram-posts.json or set up Instagram API credentials.',
        source: 'file',
      })
    }

    return NextResponse.json({
      posts: realPosts.slice(0, limit),
      total: realPosts.length,
      source: 'file',
    })
  } catch (error) {
    console.error('Error fetching Instagram posts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Instagram posts' },
      { status: 500 }
    )
  }
}

