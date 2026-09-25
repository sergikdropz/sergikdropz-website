type GoogleTokenResponse = { access_token?: string }

function loadGoogleIdentity(): Promise<void> {
  const google = (window as Window & { google?: { accounts?: { oauth2?: unknown } } }).google
  if (google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sergik-gsi]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('google')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.dataset.sergikGsi = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('google'))
    document.head.appendChild(script)
  })
}

export function requestGoogleAccessToken(clientId: string): Promise<string | null> {
  return loadGoogleIdentity()
    .then(
      () =>
        new Promise<string | null>((resolve) => {
          const oauth2 = (
            window as Window & {
              google?: {
                accounts?: {
                  oauth2?: {
                    initTokenClient: (config: {
                      client_id: string
                      scope: string
                      callback: (response: GoogleTokenResponse) => void
                      error_callback: () => void
                    }) => { requestAccessToken: (override?: { prompt?: string }) => void }
                  }
                }
              }
            }
          ).google?.accounts?.oauth2
          if (!oauth2) {
            resolve(null)
            return
          }
          let settled = false
          const finish = (token: string | null) => {
            if (settled) return
            settled = true
            resolve(token)
          }
          const client = oauth2.initTokenClient({
            client_id: clientId,
            scope: 'openid email profile',
            callback: (response) => finish(response.access_token || null),
            error_callback: () => finish(null),
          })
          client.requestAccessToken({ prompt: 'select_account' })
        }),
    )
    .catch(() => null)
}

/** Email already saved for this site in the browser or device password manager. */
export async function pickSavedBrowserEmail(mediation: 'silent' | 'optional' | 'required' = 'optional'): Promise<string | null> {
  try {
    const cred = await navigator.credentials?.get?.({
      password: true,
      mediation,
    } as CredentialRequestOptions)
    const id = cred && 'id' in cred && typeof cred.id === 'string' ? cred.id.trim() : ''
    return id.includes('@') ? id : null
  } catch {
    return null
  }
}
