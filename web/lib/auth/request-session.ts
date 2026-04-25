import type { NextRequest } from 'next/server'
import { getServerSessionFromToken, type ServerAuthSession } from '@/lib/auth'

export function getBearerFromCookies(request: NextRequest): string | null {
  return request.cookies.get('sb-auth-token')?.value ?? null
}

export async function getSessionFromRequest(request: NextRequest): Promise<ServerAuthSession | null> {
  const token = getBearerFromCookies(request)
  if (!token) return null
  return getServerSessionFromToken(token)
}
