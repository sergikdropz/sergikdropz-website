import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Scrape Instagram profile page to get ALL post URLs (including collaborations)
 * Uses multiple extraction methods to handle Instagram's changing HTML structure
 */
async function scrapeProfilePosts(username: string): Promise<string[]> {
  try {
    const profileUrl = `https://www.instagram.com/${username}/`
    
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
      },
    })
    
    if (!response.ok) {
      console.error(`Failed to fetch profile ${profileUrl}: ${response.status}`)
      return []
    }
    
    const html = await response.text()
    const postUrls: string[] = []
    
    // Method 1: Extract from window._sharedData (older Instagram structure)
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({[\s\S]+?});/)
    if (sharedDataMatch) {
      try {
        const sharedData = JSON.parse(sharedDataMatch[1])
        
        // Navigate through the data structure to find posts
        const user = sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user
        if (user) {
          // Get posts from profile
          const media = user?.edge_owner_to_timeline_media?.edges || []
          for (const edge of media) {
            const node = edge?.node
            if (node?.shortcode) {
              const postUrl = `https://www.instagram.com/p/${node.shortcode}/`
              postUrls.push(postUrl)
            }
          }
          
          // Also check for reels
          const reels = user?.edge_felix_video_timeline?.edges || []
          for (const edge of reels) {
            const node = edge?.node
            if (node?.shortcode) {
              const reelUrl = `https://www.instagram.com/reel/${node.shortcode}/`
              postUrls.push(reelUrl)
            }
          }
        }
      } catch (e) {
        console.error('Error parsing _sharedData:', e)
      }
    }
    
    // Method 2: Extract from window.__additionalDataLoaded (newer Instagram structure)
    const additionalDataMatches = Array.from(html.matchAll(/window\.__additionalDataLoaded\([^,]+,\s*({[\s\S]+?})\);/g))
    for (const match of additionalDataMatches) {
      try {
        const data = JSON.parse(match[1])
        const user = data?.graphql?.user || data?.user
        if (user) {
          const media = user?.edge_owner_to_timeline_media?.edges || []
          for (const edge of media) {
            const node = edge?.node
            if (node?.shortcode) {
              const postUrl = `https://www.instagram.com/p/${node.shortcode}/`
              postUrls.push(postUrl)
            }
          }
          const reels = user?.edge_felix_video_timeline?.edges || []
          for (const edge of reels) {
            const node = edge?.node
            if (node?.shortcode) {
              const reelUrl = `https://www.instagram.com/reel/${node.shortcode}/`
              postUrls.push(reelUrl)
            }
          }
        }
      } catch (e) {
        // Continue to next match
      }
    }
    
    // Method 3: Extract from script tags with JSON data
    const scriptMatches = Array.from(html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi))
    for (const match of scriptMatches) {
      try {
        const data = JSON.parse(match[1])
        // Try to find user data in various possible locations
        const user = data?.graphql?.user || data?.user || data?.entry_data?.ProfilePage?.[0]?.graphql?.user
        if (user) {
          const media = user?.edge_owner_to_timeline_media?.edges || []
          for (const edge of media) {
            const node = edge?.node
            if (node?.shortcode) {
              const postUrl = `https://www.instagram.com/p/${node.shortcode}/`
              postUrls.push(postUrl)
            }
          }
          const reels = user?.edge_felix_video_timeline?.edges || []
          for (const edge of reels) {
            const node = edge?.node
            if (node?.shortcode) {
              const reelUrl = `https://www.instagram.com/reel/${node.shortcode}/`
              postUrls.push(reelUrl)
            }
          }
        }
      } catch (e) {
        // Continue to next match
      }
    }
    
    // Method 4: Extract from href patterns (fallback - gets visible posts)
    const hrefPattern = /href=["']([^"']*instagram\.com\/(?:p|reel)\/([^"'\?\/]+))["']/gi
    let match
    while ((match = hrefPattern.exec(html)) !== null) {
      const url = match[1]
      if (url && !url.includes('#') && !url.includes('?')) {
        const fullUrl = url.startsWith('http') ? url : `https://www.instagram.com${url}`
        postUrls.push(fullUrl)
      }
    }
    
    // Method 5: Extract shortcodes directly and build URLs
    const shortcodePattern = /"shortcode":\s*"([^"]+)"/gi
    while ((match = shortcodePattern.exec(html)) !== null) {
      const shortcode = match[1]
      if (shortcode && shortcode.length > 5) {
        // Try both post and reel formats
        postUrls.push(`https://www.instagram.com/p/${shortcode}/`)
        postUrls.push(`https://www.instagram.com/reel/${shortcode}/`)
      }
    }
    
    // Remove duplicates and normalize URLs
    const uniquePosts = Array.from(new Set(postUrls.map(url => {
      // Normalize URL - remove query params and fragments
      const clean = url.split('?')[0].split('#')[0].trim()
      // Ensure it's a valid Instagram URL
      if (clean.includes('instagram.com') && (clean.includes('/p/') || clean.includes('/reel/'))) {
        return clean
      }
      return null
    }).filter((url): url is string => url !== null)))
    
    console.log(`Scraped ${uniquePosts.length} post(s) from profile ${username}`)
    return uniquePosts
  } catch (error) {
    console.error(`Error scraping profile ${username}:`, error)
    return []
  }
}

/**
 * POST /api/instagram/refresh
 * 
 * Fetches latest Instagram posts from API AND scrapes profile for collaboration posts
 * This ensures we get ALL posts including ones where user is a collaborator
 */
export async function POST(request: Request) {
  try {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const userId = process.env.INSTAGRAM_USER_ID
    const username = process.env.INSTAGRAM_USERNAME || 'sergikdropz'
    const maxPosts = 1000 // Fetch up to 1000 posts (will paginate if needed)

    // Read current file to get username if not in env
    const filePath = join(process.cwd(), 'data', 'instagram-posts.json')
    let currentData = { username: 'sergikdropz', posts: [] }
    try {
      const fileContent = readFileSync(filePath, 'utf-8')
      currentData = JSON.parse(fileContent)
    } catch (error) {
      // File doesn't exist or is invalid, use defaults
    }
    
    const profileUsername = username || currentData.username || 'sergikdropz'
    
    // Step 1: Fetch posts from API (posts where user is author)
    const apiPosts: string[] = []
    if (accessToken && userId) {
      try {
        // Try to get all possible fields including children (for carousel posts)
        // NOTE: Instagram Graph API fundamentally does NOT return posts where you're a collaborator (not the author).
        // This is a hard API limitation, not a permissions issue. Even with additional permissions
        // (instagram_business_manage, etc.), the API only returns posts where you are the original author.
        let nextUrl: string | null = `https://graph.facebook.com/v18.0/${userId}/media?fields=id,media_type,media_url,permalink,thumbnail_url,timestamp,caption,username,children{id,media_type,media_url,permalink,thumbnail_url}&access_token=${accessToken}&limit=100`
        let pageCount = 0
        const maxPages = 50 // Safety limit to prevent infinite loops

        while (nextUrl && pageCount < maxPages && apiPosts.length < maxPosts) {
          const response: Response = await fetch(nextUrl, {
            next: { revalidate: 3600 } // Cache for 1 hour
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error('Instagram API error:', response.status, errorData)
            
            // If we got some posts before the error, break
            if (apiPosts.length > 0) {
              break
            }
            // If API fails completely, we'll still try scraping
            break
          }

          const data = await response.json()
          
          if (!data.data || data.data.length === 0) {
            break // No more data
          }

          // Extract post URLs (permalinks) from this page
          const pagePosts = data.data.map((item: any) => item.permalink)
          apiPosts.push(...pagePosts)

          // Check if there's a next page
          if (data.paging && data.paging.next && apiPosts.length < maxPosts) {
            nextUrl = data.paging.next
            pageCount++
          } else {
            nextUrl = null // No more pages
          }
        }
        
        console.log(`Fetched ${apiPosts.length} post(s) from Instagram API (author posts only - collaborations not available via API)`)
      } catch (apiError) {
        console.error('Error fetching from Instagram API:', apiError)
      }
    }
    
    // Step 2: Scrape profile page to get ALL posts (including collaborations)
    let scrapedPosts: string[] = []
    try {
      scrapedPosts = await scrapeProfilePosts(profileUsername)
      console.log(`Scraped ${scrapedPosts.length} post(s) from profile page`)
    } catch (scrapeError) {
      console.error('Profile scraping failed:', scrapeError)
      // Continue with API posts only if scraping fails
    }
    
    // Step 3: Combine and deduplicate
    const allPostsSet = new Set<string>()
    
    // Add API posts first (they're more reliable)
    apiPosts.forEach(post => {
      const cleanUrl = post.split('?')[0].split('#')[0].trim()
      if (cleanUrl) allPostsSet.add(cleanUrl)
    })
    
    // Add scraped posts (includes collaborations)
    scrapedPosts.forEach(post => {
      const cleanUrl = post.split('?')[0].split('#')[0].trim()
      if (cleanUrl) allPostsSet.add(cleanUrl)
    })
    
    const allPosts = Array.from(allPostsSet)
    
    // If we have API posts but no scraped posts, that's okay - we still have posts
    // Only error if we have NO posts at all
    if (allPosts.length === 0) {
      const errorDetails: string[] = []
      if (apiPosts.length === 0 && accessToken && userId) {
        errorDetails.push('Instagram API returned no posts')
      }
      if (scrapedPosts.length === 0) {
        errorDetails.push('Profile scraping found no posts (Instagram may require authentication)')
      }
      if (!accessToken || !userId) {
        errorDetails.push('Instagram API credentials not configured')
      }
      
      return NextResponse.json(
        { 
          error: 'No posts found',
          message: 'No posts found via API or profile scraping.',
          details: errorDetails.join('; '),
          suggestion: 'Try refreshing again, or add posts manually via /instagram-helper'
        },
        { status: 200 } // Return 200 so the route is recognized, but with error in response
      )
    }

    // Use all fetched posts (up to max)
    const posts = allPosts.slice(0, maxPosts)

    // Update posts with fresh data (API + scraping)
    const updatedData = {
      username: profileUsername,
      posts: posts,
      lastUpdated: new Date().toISOString(),
      source: apiPosts.length > 0 ? 'api+scraping' : 'scraping',
      total: posts.length,
      apiPosts: apiPosts.length,
      scrapedPosts: scrapedPosts.length,
      note: 'Automatically fetched from Instagram API and profile scraping. Includes collaboration posts where you are a collaborator.'
    }

    // Write to file
    await writeFile(filePath, JSON.stringify(updatedData, null, 2) + '\n', 'utf-8')

    return NextResponse.json({
      success: true,
      message: `Successfully refreshed ${posts.length} post(s) (${apiPosts.length} from API, ${scrapedPosts.length} from profile scraping)`,
      posts: posts,
      total: posts.length,
      apiPosts: apiPosts.length,
      scrapedPosts: scrapedPosts.length,
      lastUpdated: updatedData.lastUpdated,
      source: updatedData.source
    })
  } catch (error: any) {
    console.error('Error refreshing Instagram posts:', error)
    return NextResponse.json(
      { 
        error: 'Failed to refresh Instagram posts',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/instagram/refresh
 * 
 * Get refresh status and last update time
 */
export async function GET() {
  try {
    const filePath = join(process.cwd(), 'data', 'instagram-posts.json')
    const fileContent = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(fileContent)

    return NextResponse.json({
      lastUpdated: data.lastUpdated || null,
      total: data.posts?.filter((p: string) => !p.includes('EXAMPLE_POST')).length || 0,
      source: data.source || 'file',
      hasApiCredentials: !!(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID)
    })
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: 'Failed to get refresh status',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

