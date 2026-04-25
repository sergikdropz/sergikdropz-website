import { ensureMusicVaultAccess } from '@/lib/music-vault-access'

export default async function MusicLibraryProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await ensureMusicVaultAccess()
  return <>{children}</>
}
