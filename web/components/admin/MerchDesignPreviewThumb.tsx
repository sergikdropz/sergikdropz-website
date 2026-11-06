'use client'

import type { MerchDesign } from '@/lib/merch/design'
import { shopPreviewFileType } from '@/lib/merch/catalog-studio'
import MerchGarmentPreview from '@/components/shop/MerchGarmentPreview'

export default function MerchDesignPreviewThumb({
  design,
  matColor,
}: {
  design: MerchDesign
  matColor?: string
}) {
  return (
    <MerchGarmentPreview
      design={design}
      matColor={matColor}
      preferLayout
      viewFileType={shopPreviewFileType(design.placements, design.activeFileType)}
    />
  )
}
