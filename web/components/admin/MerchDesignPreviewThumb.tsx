'use client'

import type { MerchDesign } from '@/lib/merch/design'
import MerchGarmentPreview from '@/components/shop/MerchGarmentPreview'

export default function MerchDesignPreviewThumb({ design }: { design: MerchDesign }) {
  return <MerchGarmentPreview design={design} />
}
