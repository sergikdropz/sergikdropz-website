import { NextResponse } from 'next/server'

export async function GET() {
  // Get base URL from environment variable or use default
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com'
  
  const robotsTxt = `User-agent: *
Allow: /
Allow: /music
Allow: /music/
Disallow: /admin
Disallow: /studio
Disallow: /music-library
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}

