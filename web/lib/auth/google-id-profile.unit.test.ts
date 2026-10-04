import { describe, expect, it } from 'vitest'
import { profileFromGoogleTokenInfo } from '@/lib/auth/google-id-profile'

const CLIENT = 'client.apps.googleusercontent.com'

describe('Google ID token profile', () => {
  const now = 1_700_000_000

  it('accepts a verified Google account for this client', () => {
    expect(
      profileFromGoogleTokenInfo(
        {
          iss: 'https://accounts.google.com',
          aud: CLIENT,
          exp: String(now + 60),
          email: 'Fan@Gmail.com',
          email_verified: 'true',
          name: 'Fan Name',
        },
        CLIENT,
        now,
      ),
    ).toEqual({ email: 'fan@gmail.com', name: 'Fan Name' })
  })

  it('rejects a token issued for another app', () => {
    expect(
      profileFromGoogleTokenInfo(
        {
          iss: 'https://accounts.google.com',
          aud: 'other.apps.googleusercontent.com',
          exp: now + 60,
          email: 'fan@gmail.com',
          email_verified: true,
        },
        CLIENT,
        now,
      ),
    ).toBeNull()
  })

  it('rejects an unverified or expired email', () => {
    expect(
      profileFromGoogleTokenInfo(
        {
          iss: 'accounts.google.com',
          aud: CLIENT,
          exp: now + 60,
          email: 'fan@gmail.com',
          email_verified: 'false',
        },
        CLIENT,
        now,
      ),
    ).toBeNull()
    expect(
      profileFromGoogleTokenInfo(
        {
          iss: 'accounts.google.com',
          aud: CLIENT,
          exp: now - 1,
          email: 'fan@gmail.com',
          email_verified: 'true',
        },
        CLIENT,
        now,
      ),
    ).toBeNull()
  })
})
