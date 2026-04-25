import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'

// Helper function to extract post ID from Instagram URL
function extractPostId(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^\/\?]+)/)
  return match ? match[1] : null
}

// Helper function to extract username from Instagram URL
function extractUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/([^\/]+)/)
  return match && !['p', 'reel', 'tv'].includes(match[1]) ? match[1] : null
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

    // Helper function to validate Instagram URLs (posts and reels)
    const isValidInstagramUrl = (url: string): boolean => {
      if (!url || typeof url !== 'string' || url.trim() === '') return false
      return url.includes('instagram.com/p/') || url.includes('instagram.com/reel/')
    }

    // Filter out invalid posts
    const validPosts = posts.filter((post: string) => isValidInstagramUrl(post))

    // Allow empty array to clear all posts
    // (validPosts.length === 0 is allowed)

    // Read current file to preserve username
    const filePath = join(process.cwd(), 'data', 'instagram-posts.json')
    const fs = require('fs')
    let currentData = { username: 'sergikdropz', posts: [] }
    
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      currentData = JSON.parse(fileContent)
    } catch (error) {
      // File doesn't exist or is invalid, use defaults
    }

    // Update posts
    const updatedData = {
      username: currentData.username || 'sergikdropz',
      posts: validPosts,
      note: (currentData as any).note || 'Instagram posts for homepage display'
    }

    // Write to file
    await writeFile(filePath, JSON.stringify(updatedData, null, 2) + '\n', 'utf-8')

    // Also save to database if Supabase is configured
    let dbSaved = 0
    try {
      const supabase = createSupabaseServerClient()
      if (validPosts.length > 0) {
        for (const postUrl of validPosts) {
          const cleanUrl = postUrl.split('?')[0].trim()
          const isVideo = cleanUrl.includes('/reel/')
          const postId = extractPostId(cleanUrl)
          const username = extractUsername(cleanUrl) || currentData.username || 'sergikdropz'
          
          // Save basic metadata to database (will be updated by process-posts)
          const { error } = await supabase
            .from('instagram_media')
            .upsert({
              post_url: cleanUrl,
              permalink: cleanUrl,
              media_type: isVideo ? 'video' : 'image',
              media_url: null, // Will be populated by process-posts
              thumbnail_url: null, // Will be populated by process-posts
              video_url: null, // Will be populated by process-posts
              caption: null,
              username: username,
              post_id: postId,
              width: null,
              height: null,
              duration_seconds: null,
              metadata: {},
              is_active: true,
              error_message: 'Processing...', // Will be cleared by process-posts
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'post_url',
            })
          
          if (!error) {
            dbSaved++
          }
        }
      }
    } catch (dbError) {
      console.error('Error saving to database:', dbError)
      // Continue even if database save fails
    }

    // Automatically process posts: scrape, download videos, upload to Supabase
    // This runs in the background - don't wait for it to complete
    if (validPosts.length > 0) {
      // Process posts asynchronously (don't block the response)
      // Use internal API call - construct URL from request
      const url = new URL(request.url)
      const baseUrl = `${url.protocol}//${url.host}`
      
      // Call process-posts endpoint in background (fire and forget)
      fetch(`${baseUrl}/api/instagram/process-posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postUrls: validPosts }),
      }).catch((error) => {
        console.error('Error processing posts (background):', error)
        // Don't fail the save operation if processing fails
      })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully saved ${validPosts.length} post(s)${dbSaved > 0 ? ` (${dbSaved} saved to database)` : ''}. Processing videos in background...`,
      posts: validPosts,
      dbSaved,
      processing: 'in_progress', // Processing happens in background
    })
  } catch (error: any) {
    console.error('Error saving Instagram posts:', error)
    return NextResponse.json(
      { error: 'Failed to save posts', details: error.message },
      { status: 500 }
    )
  }
}

