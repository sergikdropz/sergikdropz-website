import { CatalogSyncProvider } from '@/contexts/CatalogSyncContext'
import { MusicPlayerProvider } from '@/contexts/MusicPlayerContext'
import AppPublicChrome from '@/components/AppPublicChrome'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'

export default function AppPlaneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistration />
      <CatalogSyncProvider>
        <MusicPlayerProvider>
          <AppPublicChrome>{children}</AppPublicChrome>
        </MusicPlayerProvider>
      </CatalogSyncProvider>
    </>
  )
}
