import { NextResponse } from 'next/server'
import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import eventsData from '@/data/events.json'
import venuesData from '@/data/venues.json'
import socialProofData from '@/data/social-proof.json'
import galleryData from '@/data/gallery.json'

export async function GET(request: Request) {
  // Get base URL from environment variable or request headers
  const getBaseUrl = () => {
    // First, try environment variable (for production)
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL
    }
    
    // Fallback to request headers (works in all environments)
    const url = new URL(request.url)
    const protocol = url.protocol
    const host = url.host
    
    // If we have a proper host, use it
    if (host && host !== 'localhost:3000') {
      return `${protocol}//${host}`
    }
    
    // Final fallback (shouldn't be needed in production)
    return 'https://sergikdropz.com'
  }
  
  const baseUrl = getBaseUrl()
  // Release highlights (3 bullets max)
  const releaseHighlights = releasesData.releases
    .slice(0, 3)
    .map(r => `${r.title} (${r.type}, ${r.year})`)

  // Live highlights (3 bullets max)
  const liveHighlights = [
    ...eventsData.festivals.slice(0, 2).map(f => f.name),
    ...venuesData.venues.slice(0, 1).map(v => `${v.name}, ${v.city}`)
  ]

  // Select key gallery images for the press kit
  const heroImage = galleryData.images.find(img => img.category === 'portrait' || img.category === 'landscape') || galleryData.images[0]
  const performanceImages = galleryData.images.filter(img => img.category === 'performance').slice(0, 3)
  const portraitImages = galleryData.images.filter(img => img.category === 'portrait' || img.category === 'landscape').slice(0, 2)
  
  // Select background images for different sections
  const bgImage1 = galleryData.images.find(img => img.category === 'portrait') || galleryData.images[0]
  const bgImage2 = galleryData.images.find(img => img.category === 'performance') || galleryData.images[1] || galleryData.images[0]
  const bgImage3 = galleryData.images.find(img => img.category === 'landscape') || galleryData.images[2] || galleryData.images[0]
  
  // Get base URL from request headers or use default
  const getImageUrl = (imagePath: string) => {
    // Use the actual request host for absolute URLs
    return `${baseUrl}${imagePath}`
  }

  const bodyBgImage = heroImage?.src || galleryData.images[0]?.src || ''
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SERGIK - Electronic Press Kit</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.7;
      color: #e5e5e5;
      max-width: 900px;
      margin: 0 auto;
      padding: 60px 30px;
      background: #000;
      position: relative;
      letter-spacing: 0.01em;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${getImageUrl(bodyBgImage)}');
      background-size: cover;
      background-position: center;
      filter: blur(40px) brightness(0.3);
      opacity: 0.4;
      z-index: -1;
    }
    h1 {
      font-size: 72px;
      margin-bottom: 60px;
      padding-bottom: 0;
      color: #fff;
      font-weight: 900;
      letter-spacing: -2px;
      line-height: 0.9;
      border: none;
      text-transform: uppercase;
      font-family: 'Inter', sans-serif;
    }
    h2 {
      font-size: 32px;
      margin-top: 60px;
      margin-bottom: 25px;
      padding-bottom: 0;
      color: #fff;
      font-weight: 700;
      letter-spacing: -1px;
      border: none;
      text-transform: uppercase;
      font-family: 'Inter', sans-serif;
    }
    h3 {
      font-size: 22px;
      margin-top: 30px;
      margin-bottom: 15px;
      color: #fff;
      font-weight: 600;
      letter-spacing: -0.5px;
      font-family: 'Inter', sans-serif;
    }
    p {
      margin-bottom: 20px;
      color: #d1d1d1;
      font-size: 16px;
      line-height: 1.8;
      font-weight: 400;
      font-family: 'Inter', sans-serif;
    }
    a {
      color: #fff;
      text-decoration: underline;
    }
    a:hover {
      color: #ccc;
    }
    ul {
      margin-left: 0;
      margin-bottom: 25px;
      list-style: none;
      padding: 0;
    }
    li {
      margin-bottom: 12px;
      color: #d1d1d1;
      padding-left: 20px;
      position: relative;
      font-size: 16px;
      line-height: 1.8;
    }
    li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: #666;
      font-size: 20px;
      line-height: 1;
    }
    .section {
      margin-bottom: 50px;
      position: relative;
    }
    .section-with-bg {
      padding: 40px;
      border-radius: 0;
      margin: 50px 0;
      position: relative;
      overflow: hidden;
    }
    .section-with-bg::before {
      content: '';
      position: absolute;
      top: -20px;
      left: -20px;
      right: -20px;
      bottom: -20px;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      filter: blur(30px) brightness(0.4);
      opacity: 0.6;
      z-index: 0;
    }
    .section-with-bg::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 0;
    }
    .section-with-bg > * {
      position: relative;
      z-index: 1;
    }
    .contact-info {
      background: transparent;
      padding: 30px 0;
      border-radius: 0;
      margin-bottom: 40px;
      border: none;
      position: relative;
      overflow: hidden;
    }
    .contact-info-bg::before {
      content: '';
      position: absolute;
      top: -20px;
      left: -20px;
      right: -20px;
      bottom: -20px;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      filter: blur(25px) brightness(0.4);
      opacity: 0.5;
      z-index: 0;
    }
    .contact-info > * {
      position: relative;
      z-index: 1;
    }
    .contact-info::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 0;
    }
    .contact-info p {
      color: #e5e5e5;
    }
    .badge {
      display: inline-block;
      background: #fff;
      color: #000;
      padding: 8px 16px;
      border-radius: 0;
      font-size: 13px;
      margin: 4px 8px 4px 0;
      font-weight: 500;
      letter-spacing: 0.5px;
    }
    .release-item {
      margin-bottom: 20px;
      padding: 20px 0;
      background: transparent;
      border-left: none;
      border-bottom: 1px solid #222;
      border-radius: 0;
    }
    .release-item h3 {
      color: #fff;
    }
    .release-item p {
      color: #d1d1d1;
    }
    .footer {
      margin-top: 80px;
      padding-top: 40px;
      border-top: 1px solid #222;
      text-align: center;
      font-size: 13px;
      color: #666;
      letter-spacing: 0.5px;
    }
    .hero-image {
      width: 100%;
      max-width: 100%;
      height: 500px;
      object-fit: cover;
      border-radius: 0;
      margin: 0 auto 60px;
      display: block;
      border: none;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .gallery-item {
      position: relative;
      overflow: hidden;
      border-radius: 0;
      border: none;
    }
    .gallery-item img {
      width: 100%;
      height: 300px;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .gallery-item:hover img {
      transform: scale(1.05);
    }
    .image-section {
      background: transparent;
      padding: 40px 0;
      border-radius: 0;
      margin: 50px 0;
      border: none;
      position: relative;
      overflow: hidden;
    }
    .image-section::before {
      content: '';
      position: absolute;
      top: -20px;
      left: -20px;
      right: -20px;
      bottom: -20px;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      filter: blur(35px) brightness(0.3);
      opacity: 0.5;
      z-index: 0;
    }
    .image-section::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 0;
    }
    .image-section > * {
      position: relative;
      z-index: 1;
    }
    .image-section h2 {
      color: #fff;
    }
    @media print {
      body {
        padding: 20px;
        background: #fff;
        color: #000;
      }
      h1, h2, h3 {
        color: #000;
        border-color: #ddd;
      }
      p, li {
        color: #333;
      }
      .contact-info, .release-item, .image-section {
        background: #f9f9f9;
        border-color: #ddd;
      }
      .gallery-item .caption {
        background: #f5f5f5;
        color: #666;
        border-color: #ddd;
      }
      .no-print {
        display: none;
      }
      .gallery-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .gallery-item img {
        height: 200px;
      }
      .badge {
        background: #000;
        color: #fff;
      }
    }
  </style>
</head>
<body>
  <h1>SERGIK - Electronic Press Kit</h1>
  
  ${heroImage ? `
  <div class="section">
    <img src="${getImageUrl(heroImage.src)}" alt="${heroImage.alt}" class="hero-image" />
  </div>
  ` : ''}
  
  <div class="section contact-info contact-info-bg" style="background-image: url('${getImageUrl(bgImage1.src)}');">
    <h2>Contact Information</h2>
    <p><strong>Press:</strong> ${artistData.contact.email}</p>
    <p><strong>Booking:</strong> ${artistData.contact.email}</p>
    <p><strong>Location:</strong> ${artistData.location.city}, ${artistData.location.state}, ${artistData.location.country}</p>
    <p><strong>Website:</strong> ${baseUrl}</p>
    <p><strong>Spotify:</strong> ${artistData.platforms.spotify}</p>
    <p><strong>SoundCloud:</strong> ${artistData.platforms.soundcloud}</p>
    <p><strong>Instagram:</strong> ${artistData.platforms.instagram}</p>
    <p><strong>YouTube:</strong> ${artistData.platforms.youtube}</p>
  </div>

  <div class="section section-with-bg" style="background-image: url('${getImageUrl(bgImage1.src)}');">
    <h2>Short Bio (50-80 words)</h2>
    <p>${artistData.bio.short}</p>
  </div>

  <div class="section section-with-bg" style="background-image: url('${getImageUrl(bgImage2.src)}');">
    <h2>Long Bio (150-250 words)</h2>
    <p>${artistData.bio.long}</p>
  </div>

  <div class="section section-with-bg" style="background-image: url('${getImageUrl(bgImage3.src)}');">
    <h2>Genre & Sound</h2>
    <p><strong>Primary:</strong> ${artistData.genres.primary.join(', ')}</p>
    <p><strong>Tags:</strong> ${artistData.genres.secondary.join(', ')}</p>
  </div>

  ${performanceImages.length > 0 ? `
  <div class="section image-section" style="background-image: url('${getImageUrl(performanceImages[0]?.src || bgImage2.src)}');">
    <h2>Performance Photos</h2>
    <div class="gallery-grid">
      ${performanceImages.map(img => `
        <div class="gallery-item">
          <img src="${getImageUrl(img.src)}" alt="${img.alt}" />
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  <div class="section section-with-bg" style="background-image: url('${getImageUrl(bgImage1.src)}');">
    <h2>Release Highlights</h2>
    <ul>
      ${releaseHighlights.map(r => `<li>${r}</li>`).join('')}
    </ul>
    <p><em>Full discography available at: ${baseUrl}/music</em></p>
  </div>

  <div class="section section-with-bg" style="background-image: url('${getImageUrl(bgImage2.src)}');">
    <h2>Live Highlights</h2>
    <ul>
      ${liveHighlights.map(l => `<li>${l}</li>`).join('')}
    </ul>
    <p><em>Full performance history available at: ${baseUrl}/performances</em></p>
  </div>

  <div class="section section-with-bg" style="background-image: url('${getImageUrl(bgImage3.src)}');">
    <h2>Performance History</h2>
    <h3>Festivals</h3>
    <ul>
      ${eventsData.festivals.map(f => `<li>${f.name} • ${f.location}</li>`).join('')}
    </ul>
    <h3>Notable Venues</h3>
    <ul>
      ${venuesData.venues.map(v => `<li>${v.name} • ${v.city} (${v.type})</li>`).join('')}
    </ul>
  </div>

  ${portraitImages.length > 0 ? `
  <div class="section image-section" style="background-image: url('${getImageUrl(portraitImages[0]?.src || bgImage1.src)}');">
    <h2>Press Photos</h2>
    <div class="gallery-grid">
      ${portraitImages.map(img => `
        <div class="gallery-item">
          <img src="${getImageUrl(img.src)}" alt="${img.alt}" />
        </div>
      `).join('')}
    </div>
    <p style="margin-top: 15px; font-size: 14px; color: #666;">
      <em>High-resolution versions of these images are available upon request.</em>
    </p>
  </div>
  ` : ''}

  ${socialProofData.shared_billing && socialProofData.shared_billing.length > 0 ? `
  <div class="section">
    <h2>Shared Billing</h2>
    <p>${socialProofData.shared_billing.map(artist => `<span class="badge">${artist}</span>`).join(' ')}</p>
  </div>
  ` : ''}

  <div class="section">
    <h2>Releases</h2>
    ${releasesData.releases.map(release => `
      <div class="release-item">
        <h3>${release.title}</h3>
        <p>${release.type} • ${release.year}</p>
        <p><strong>Platforms:</strong> ${release.platforms.join(', ')}</p>
        ${release.spotify_url ? `<p><strong>Spotify:</strong> <a href="${release.spotify_url}">${release.spotify_url}</a></p>` : ''}
      </div>
    `).join('')}
  </div>

  <div class="footer">
    <p>For high-resolution images and additional press materials, contact: ${artistData.contact.email}</p>
    <p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p>This press kit is available online at: ${baseUrl}/epk</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': 'attachment; filename="SERGIK-Press-Kit.html"',
    },
  })
}

