import { NextRequest, NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getServerSession, type ServerAuthSession } from '@/lib/auth'
import { getSessionFromRequest } from '@/lib/auth/request-session'
import {
  FAN_VAULT_UNLOCK_COOKIE,
  getFanVaultUnlockEmailFromRequest,
  readFanVaultUnlockToken,
} from '@/lib/fan-vault-unlock-cookie'

export const MUSIC_VAULT_PATH = '/music-library'

export type MusicVaultApiResult =
  | { ok: true; session: ServerAuthSession | null; isVaultLead: boolean }
  | { ok: false; response: NextResponse }

/**
 * Vault **browse** (library APIs): admin, any signed-in fan (magic link), or email unlock cookie.
 * Playlists / purchases require a signed-in fan (`requireFanAuth`); paid perks use `requireFanMembership`.
 */
export async function getMusicVaultApiAccess(request: NextRequest): Promise<MusicVaultApiResult> {
  const session = await getSessionFromRequest(request)
  if (session?.isAdmin) {
    return { ok: true, session, isVaultLead: false }
  }
  if (session?.user?.id) {
    return { ok: true, session, isVaultLead: false }
  }

  const leadEmail = getFanVaultUnlockEmailFromRequest(request)
  if (leadEmail) {
    return { ok: true, session: null, isVaultLead: true }
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Use your email to unlock the vault, or sign in with a magic link.',
        code: 'VAULT_AUTH_REQUIRED',
      },
      { status: 401 },
    ),
  }
}

/**
 * Server layout: allow admins, signed-in fans, or valid vault-unlock cookie; else unlock page.
 */
export async function ensureMusicVaultAccess() {
  const session = await getServerSession()
  if (session?.isAdmin) return
  if (session?.user?.id) return

  const jar = await cookies()
  const lead = readFanVaultUnlockToken(jar.get(FAN_VAULT_UNLOCK_COOKIE)?.value)
  if (lead) return

  redirect(`/music-library/unlock?next=${encodeURIComponent(MUSIC_VAULT_PATH)}`)
}
