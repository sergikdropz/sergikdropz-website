/**
 * Edge-safe helpers for middleware only. Do not import @/lib/auth or @/lib/supabase here.
 */

export function isAdminEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails =
    process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || []
  if (adminEmails.length === 0) {
    // No allowlist configured — defer full admin check to server layouts/API routes.
    return true
  }
  return adminEmails.includes(email.toLowerCase())
}

/** Validate JWT with Supabase Auth (fetch-only, Edge compatible). */
export async function fetchSupabaseUserEmail(
  accessToken: string
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const data = (await response.json()) as { email?: string }
    return data.email ?? null
  } catch {
    return null
  }
}

/**
 * Lightweight gate: valid session + optional ADMIN_EMAILS allowlist.
 * Database `admins` table checks run in server layouts and API routes only.
 */
export async function middlewareHasAdminAccess(accessToken: string): Promise<boolean> {
  const email = await fetchSupabaseUserEmail(accessToken)
  if (!email) return false
  return isAdminEmailAllowed(email)
}
