import { redirect } from 'next/navigation'
import { studioPipelineHref } from '@/lib/studio/studio-ia'

export default function LegacySoundExchangePage() {
  redirect(studioPipelineHref('isrcs'))
}
