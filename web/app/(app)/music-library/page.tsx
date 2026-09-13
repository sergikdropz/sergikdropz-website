import { ensureMusicVaultAccess } from '@/lib/music-vault-access'
import MusicLibraryClient from './MusicLibraryClient'

export const dynamic = 'force-dynamic'

export default async function MusicLibraryPage() {
  await ensureMusicVaultAccess()
  return <MusicLibraryClient />
}
