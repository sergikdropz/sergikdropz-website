type GoogleTokenResponse = { access_token?: string }
type GoogleTokenError = { type?: string }

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

function googleOauth2():
  | {
      initTokenClient: (config: {
        client_id: string
        scope: string
        ux_mode?: 'popup' | 'redirect'
        include_granted_scopes?: boolean
        callback: (response: GoogleTokenResponse) => void
        error_callback: (error?: GoogleTokenError) => void
      }) => { requestAccessToken: (override?: { prompt?: string }) => void }
    }
  | undefined {
  return (
    window as Window & {
      google?: {
        accounts?: {
          oauth2?: {
            initTokenClient: (config: {
              client_id: string
              scope: string
              ux_mode?: 'popup' | 'redirect'
              include_granted_scopes?: boolean
              callback: (response: GoogleTokenResponse) => void
              error_callback: (error?: GoogleTokenError) => void
            }) => { requestAccessToken: (override?: { prompt?: string }) => void }
          }
        }
      }
    }
  ).google?.accounts?.oauth2
}

export function preloadGoogleIdentity(): Promise<void> {
  return loadGoogleIdentity()
}

type GoogleIdApi = {
  initialize: (config: {
    client_id: string
    callback: (response: { credential?: string }) => void
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
    itp_support?: boolean
    use_fedcm_for_button?: boolean
    context?: 'signin' | 'signup' | 'use'
  }) => void
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      width?: number
      logo_alignment?: 'left' | 'center'
    },
  ) => void
}

function googleIdApi(): GoogleIdApi | undefined {
  return (window as Window & { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id
}

let googleIdClientId: string | null = null
let googleCredentialListener: ((credential: string) => void) | null = null

/** The vault card keeps this callback; the Google button never navigates the page. */
export function setGoogleCredentialListener(listener: ((credential: string) => void) | null) {
  googleCredentialListener = listener
}

/** Official Sign in with Google button. The account chooser is a popup; this page stays. */
export async function renderGoogleSignInButton(parent: HTMLElement, clientId: string): Promise<boolean> {
  try {
    await loadGoogleIdentity()
  } catch {
    return false
  }
  const id = googleIdApi()
  if (!id) return false
  if (googleIdClientId !== clientId) {
    id.initialize({
      client_id: clientId,
      callback: (response) => {
        const credential = response.credential?.trim()
        if (credential) googleCredentialListener?.(credential)
      },
      ux_mode: 'popup',
      auto_select: false,
      itp_support: true,
      use_fedcm_for_button: true,
      context: 'signin',
    })
    googleIdClientId = clientId
  }
  parent.replaceChildren()
  const width = Math.max(200, Math.min(384, Math.floor(parent.clientWidth || 360)))
  id.renderButton(parent, {
    type: 'standard',
    theme: 'filled_blue',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    width,
    logo_alignment: 'center',
  })
  return true
}

export type GoogleAccessTokenPrompt = '' | 'none' | 'select_account'

function requestLoadedGoogleAccessToken(
  clientId: string,
  scope: string,
  prompt: GoogleAccessTokenPrompt,
): Promise<string | null> {
  const oauth2 = googleOauth2()
  if (!oauth2) return Promise.resolve(null)
  return new Promise<string | null>((resolve) => {
    let settled = false
    let closeTimer: number | undefined
    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      if (closeTimer !== undefined) window.clearTimeout(closeTimer)
      resolve(token)
    }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      ux_mode: 'popup',
      include_granted_scopes: false,
      callback: (response) => finish(response.access_token || null),
      error_callback: (error) => {
        // The popup reports "closed" at the same moment it posts the token.
        // Resolving immediately drops that token and leaves gsi/transform open.
        if (error?.type === 'popup_closed') {
          closeTimer = window.setTimeout(() => finish(null), 1500)
          return
        }
        finish(null)
      },
    })
    client.requestAccessToken({ prompt })
  })
}

export function requestGoogleAccessToken(
  clientId: string,
  scope = 'openid email profile',
  options?: { prompt?: GoogleAccessTokenPrompt },
): Promise<string | null> {
  const prompt = options?.prompt ?? 'select_account'
  if (googleOauth2()) return requestLoadedGoogleAccessToken(clientId, scope, prompt)
  return loadGoogleIdentity()
    .then(() => requestLoadedGoogleAccessToken(clientId, scope, prompt))
    .catch(() => null)
}

/** Try cached Google session first, then account picker. */
export async function requestGoogleAccessTokenPreferSilent(
  clientId: string,
  scope = 'openid email profile',
): Promise<string | null> {
  const silent = await requestGoogleAccessToken(clientId, scope, { prompt: '' })
  if (silent) return silent
  return requestGoogleAccessToken(clientId, scope, { prompt: 'select_account' })
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
