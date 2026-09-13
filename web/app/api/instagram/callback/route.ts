import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Instagram OAuth Callback Handler
 * Exchanges authorization code for access token
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')
  const errorDescription = searchParams.get('error_description')
  
  // Parse state to determine auth method
  let authMethod = 'facebook_login' // default
  try {
    if (state) {
      const stateData = JSON.parse(decodeURIComponent(state))
      authMethod = stateData.auth_method || 'facebook_login'
    }
  } catch (e) {
    // State parsing failed, use default
  }

  // Handle errors
  if (error) {
    // Map common errors to user-friendly messages
    let errorMessage = error
    if (error === 'access_denied') {
      errorMessage = 'access_denied'
    } else if (error.includes('platform') || error.includes('app')) {
      errorMessage = 'invalid_platform_app'
    }
    
    return NextResponse.redirect(
      new URL(
        `/instagram-helper?error=${encodeURIComponent(errorMessage)}&reason=${encodeURIComponent(errorReason || '')}&description=${encodeURIComponent(errorDescription || '')}`,
        request.url
      )
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/instagram-helper?error=no_code', request.url)
    )
  }

  try {
    const APP_ID = process.env.INSTAGRAM_APP_ID || '1186575606889765'
    const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || 'c58e867a7ac7b380491aded06d536fad'
    // Get origin from request URL to support any port (3000, 3001, etc.)
    const requestUrl = new URL(request.url)
    const REDIRECT_URI = `${requestUrl.origin}/api/instagram/callback`

    // Both Instagram Login and Facebook Login use Facebook OAuth endpoints
    // The difference is in the scopes requested
    // Exchange code for access token using Facebook Graph API
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`,
      {
        method: 'GET',
      }
    )

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      return NextResponse.redirect(
        new URL(
          `/instagram-helper?error=token_exchange_failed&details=${encodeURIComponent(JSON.stringify(errorData))}`,
          request.url
        )
      )
    }

    const tokenData = await tokenResponse.json()
    console.log('Token exchange response:', JSON.stringify(tokenData, null, 2))
    const { access_token, user_id } = tokenData

    if (!access_token) {
      console.error('Token response missing access_token:', tokenData)
      return NextResponse.redirect(
        new URL(
          `/instagram-helper?error=missing_token&details=${encodeURIComponent(JSON.stringify(tokenData))}`,
          request.url
        )
      )
    }

    // For Instagram Login, user_id might not be in the token response
    // We'll need to fetch it using the access token
    let resolvedUserId = user_id
    if (!resolvedUserId) {
      try {
        // Try to get user ID from the token
        // For Instagram Login, we might need to use /me or check permissions
        const meResponse = await fetch(
          `https://graph.facebook.com/v18.0/me?access_token=${access_token}`
        )
        if (meResponse.ok) {
          const meData = await meResponse.json()
          resolvedUserId = meData.id
          console.log('Got user ID from /me endpoint:', resolvedUserId)
        }
      } catch (error) {
        console.warn('Could not get user ID from /me:', error)
      }
    }

    // Exchange for long-lived token (optional but recommended)
    // Instagram Graph API uses Facebook token exchange
    let longLivedToken = access_token
    try {
      const longLivedResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${access_token}`
      )
      if (longLivedResponse.ok) {
        const longLivedData = await longLivedResponse.json()
        longLivedToken = longLivedData.access_token
      }
    } catch (error) {
      // Continue with short-lived token if exchange fails
      console.warn('Could not exchange for long-lived token:', error)
    }
    
    // Get Instagram Business Account ID
    // For Instagram Login: user_id might be the Instagram Business Account ID directly
    // For Facebook Login: need to get Instagram account via Facebook Page
    let instagramUserId = resolvedUserId // Use resolved user ID
    
    // Check token permissions to determine which method was used
    let usesInstagramLogin = false
    try {
      const permissionsResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/permissions?access_token=${longLivedToken}`
      )
      if (permissionsResponse.ok) {
        const permissionsData = await permissionsResponse.json()
        if (permissionsData.data) {
          // Check if we have Instagram Login scopes (instagram_business_*)
          usesInstagramLogin = permissionsData.data.some((p: any) => 
            p.permission?.startsWith('instagram_business_') && p.status === 'granted'
          )
        }
      }
    } catch (error) {
      console.warn('Could not check permissions:', error)
    }
    
    if (!usesInstagramLogin) {
      // Facebook Login method: Get Instagram Business Account ID from Facebook Page
      // Instagram Graph API requires getting the Instagram account via Facebook Page
      try {
        // First, get user's Facebook Pages
        const pagesResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?access_token=${longLivedToken}`
        )
        if (pagesResponse.ok) {
          const pagesData = await pagesResponse.json()
          if (pagesData.data && pagesData.data.length > 0) {
            // Try each page to find one with Instagram Business Account
            for (const page of pagesData.data) {
              const instagramResponse = await fetch(
                `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${longLivedToken}`
              )
              if (instagramResponse.ok) {
                const instagramData = await instagramResponse.json()
                if (instagramData.instagram_business_account?.id) {
                  instagramUserId = instagramData.instagram_business_account.id
                  console.log(`Found Instagram Business Account ID: ${instagramUserId}`)
                  break // Found it, stop searching
                }
              }
            }
          } else {
            console.warn('No Facebook Pages found. Instagram account must be connected to a Facebook Page for Facebook Login method.')
          }
        } else {
          const errorData = await pagesResponse.json().catch(() => ({}))
          console.warn('Could not fetch Facebook Pages:', errorData)
        }
      } catch (error) {
        console.warn('Could not get Instagram Business Account ID:', error)
        // Continue with user_id if we can't get Instagram ID
        // User will need to manually set INSTAGRAM_USER_ID to their Instagram Business Account ID
      }
    } else {
      // Instagram Login method: Try to get Instagram Business Account ID
      // With Instagram Login, we should be able to query the Instagram account directly
      try {
        // First, try to query the user_id as an Instagram Business Account
        // If it works, it's the Instagram Business Account ID
        const instagramMediaResponse = await fetch(
          `https://graph.facebook.com/v18.0/${resolvedUserId}/media?fields=id&access_token=${longLivedToken}&limit=1`
        )
        
        if (instagramMediaResponse.ok) {
          // Success! resolvedUserId is the Instagram Business Account ID
          instagramUserId = resolvedUserId
          console.log(`✅ Using Instagram Business Account ID from Instagram Login: ${instagramUserId}`)
        } else {
          // resolvedUserId is not an Instagram Business Account ID
          // Try to find it via Facebook Pages (fallback)
          console.log('⚠️ User ID is not an Instagram Business Account ID, trying Facebook Pages...')
          const pagesResponse = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${longLivedToken}`
          )
          if (pagesResponse.ok) {
            const pagesData = await pagesResponse.json()
            if (pagesData.data && pagesData.data.length > 0) {
              for (const page of pagesData.data) {
                const instagramResponse = await fetch(
                  `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${longLivedToken}`
                )
                if (instagramResponse.ok) {
                  const instagramData = await instagramResponse.json()
                  if (instagramData.instagram_business_account?.id) {
                    instagramUserId = instagramData.instagram_business_account.id
                    console.log(`✅ Found Instagram Business Account ID via Facebook Page: ${instagramUserId}`)
                    break
                  }
                }
              }
            } else {
              console.warn('⚠️ No Facebook Pages found. For Instagram Login, you may need to connect your Instagram account to a Facebook Page, or the user_id from the token should be the Instagram Business Account ID.')
            }
          }
        }
      } catch (error) {
        console.warn('Could not verify Instagram account ID:', error)
        // Continue with resolvedUserId as fallback, but log a warning
        console.warn('⚠️ Using resolvedUserId as fallback. This may not work if it\'s not an Instagram Business Account ID.')
      }
    }

    // Save to .env.local
    const envFile = join(process.cwd(), '.env.local')
    let envContent = ''
    try {
      envContent = readFileSync(envFile, 'utf-8')
    } catch (error) {
      // File doesn't exist, will create it
    }

    // Remove old Instagram vars
    const lines = envContent.split('\n').filter((line) => {
      return (
        !line.startsWith('INSTAGRAM_APP_ID=') &&
        !line.startsWith('INSTAGRAM_APP_SECRET=') &&
        !line.startsWith('INSTAGRAM_ACCESS_TOKEN=') &&
        !line.startsWith('INSTAGRAM_USER_ID=')
      )
    })

    // Add new vars
    const newLines = [
      ...lines.filter((line) => line.trim() !== ''),
      '',
      '# Instagram API Configuration',
      `INSTAGRAM_APP_ID=${APP_ID}`,
      `INSTAGRAM_APP_SECRET=${APP_SECRET}`,
      `INSTAGRAM_ACCESS_TOKEN=${longLivedToken}`,
      `INSTAGRAM_USER_ID=${instagramUserId}`,
      '',
    ]

    await writeFile(envFile, newLines.join('\n'), 'utf-8')

    // Redirect to helper page with success
    return NextResponse.redirect(
      new URL(
        `/instagram-helper?success=true&user_id=${instagramUserId}`,
        request.url
      )
    )
  } catch (error: any) {
    console.error('Instagram callback error:', error)
    return NextResponse.redirect(
      new URL(
        `/instagram-helper?error=callback_error&message=${encodeURIComponent(error.message)}`,
        request.url
      )
    )
  }
}

