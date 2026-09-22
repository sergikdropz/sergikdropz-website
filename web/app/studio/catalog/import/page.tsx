import { redirect } from 'next/navigation'
import { studioCreateHref } from '@/lib/studio/studio-ia'

export default function LegacyCatalogImportPage() {
  redirect(studioCreateHref('import'))
}
