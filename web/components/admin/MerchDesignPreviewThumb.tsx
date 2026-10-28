'use client'

import type { MerchDesign } from '@/lib/merch/design'
import MerchGarmentPreview from '@/components/shop/MerchGarmentPreview'

export default function MerchDesignPreviewThumb({
  design,
  matColor,
}: {
  design: MerchDesign
  matColor?: string
}) {
  return <MerchGarmentPreview design={design} matColor={matColor} />
}
