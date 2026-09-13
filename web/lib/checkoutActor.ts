/**
 * Supabase auth for Stripe Checkout: attach user id to metadata and gate shop on password accounts.
 */

export type CheckoutAuthState = {
  authenticated: boolean
  hasPasswordCredential?: boolean
  userId?: string
}

export async function fetchCheckoutAuthState(): Promise<CheckoutAuthState> {
  if (typeof window === 'undefined') return { authenticated: false }
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' })
    const data = await res.json()
    if (!res.ok || !data.authenticated) {
      return { authenticated: false }
    }
    return {
      authenticated: true,
      hasPasswordCredential: Boolean(data.hasPasswordCredential),
      userId: data.user?.id as string | undefined,
    }
  } catch {
    return { authenticated: false }
  }
}

/**
 * Supabase auth user id for checkout metadata (purchases.user_id / merch_orders.user_id).
 */
export async function fetchSupabaseUserIdForCheckout(): Promise<string | undefined> {
  const s = await fetchCheckoutAuthState()
  return s.userId
}

export function redirectToFanLoginForShop(nextPath?: string) {
  const next =
    nextPath ??
    (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop')
  window.location.href = `/fan/login?next=${encodeURIComponent(next)}`
}

export function redirectToSetPasswordForShop(nextPath?: string) {
  const next =
    nextPath ??
    (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/shop')
  window.location.href = `/fan/set-password?next=${encodeURIComponent(next)}`
}

export type ShopCheckoutAuthResult = { ok: true; userId: string } | { ok: false }

/**
 * Music / merch / subscription checkout requires a signed-in fan account with a password.
 * Redirects to login or set-password when needed.
 */
export async function ensureShopCheckoutAuth(options?: {
  returnPath?: string
}): Promise<ShopCheckoutAuthResult> {
  if (typeof window === 'undefined') return { ok: false }
  const path =
    options?.returnPath ?? window.location.pathname + window.location.search
  const auth = await fetchCheckoutAuthState()
  if (!auth.authenticated) {
    redirectToFanLoginForShop(path)
    return { ok: false }
  }
  if (!auth.hasPasswordCredential) {
    redirectToSetPasswordForShop(path)
    return { ok: false }
  }
  if (!auth.userId) {
    redirectToFanLoginForShop(path)
    return { ok: false }
  }
  return { ok: true, userId: auth.userId }
}
