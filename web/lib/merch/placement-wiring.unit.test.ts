/**
 * End-to-end placement wiring, with a Printful-shaped payload for tee 71:
 * templates payload → per-placement template → catalog print files →
 * fitting-room placement → save normalization → restore → publish files → audit.
 */
import { describe, expect, it } from 'vitest'
import { MERCH_BLANKS } from '@/lib/merch/blanks'
import {
  placementForPrintFile,
  restoreCatalogFileLayers,
  studioPlacementsForTechnique,
} from '@/lib/merch/catalog-studio'
import { normalizePlacements, placementKey, type ArtPlacement, type MerchDesign } from '@/lib/merch/design'
import { auditPlacementTemplates } from '@/lib/merch/placement-audit'
import type { CatalogPrintFile, CatalogProductDetail } from '@/lib/merch/printful-catalog-types'
import {
  buildFileGuidelines,
  parsePrintfilesPayload,
  parseTemplateVariantLinks,
  parseTemplatesPayload,
} from '@/lib/merch/product-specs'
import { buildPrintFiles } from '@/lib/merch/publish'
import { mergePlacementGeometry } from '@/lib/merch/printful-catalog'
import { filterPrintFilesForTechnique } from '@/lib/merch/catalog-studio'

const tee = MERCH_BLANKS[0]

// Shape of GET /mockup-generator/templates/71 (object form with variant_mapping).
const templatesPayload = {
  result: {
    version: 2,
    min_dpi: 150,
    variant_mapping: [
      {
        variant_id: 4012,
        templates: [
          { placement: 'front', template_id: 150560 },
          { placement: 'back', template_id: 150680 },
          { placement: 'front_large', template_id: 150920 },
          { placement: 'sleeve_left', template_id: 151460 },
          { placement: 'sleeve_right', template_id: 151520 },
        ],
      },
    ],
    templates: [
      row(150560, 1, 'https://files.example/front.png', 1010, 1346, 530, 1006, true),
      row(150680, 1, 'https://files.example/back.png', 1031, 1375, 224, 987, false),
      row(150920, 3, 'https://files.example/front-large.png', 1200, 1600, 400, 900, true),
      row(151460, 130, 'https://files.example/sleeve-left.png', 712, 625, 1545, 1270, true),
      row(151520, 130, 'https://files.example/sleeve-right.png', 712, 625, 1545, 1150, true),
    ],
  },
}

function row(
  templateId: number,
  printfileId: number,
  imageUrl: string,
  pw: number,
  ph: number,
  top: number,
  left: number,
  onFront: boolean
) {
  return {
    template_id: templateId,
    printfile_id: printfileId,
    image_url: imageUrl,
    template_width: 3000,
    template_height: 3000,
    print_area_width: pw,
    print_area_height: ph,
    print_area_top: top,
    print_area_left: left,
    is_template_on_front: onFront,
    orientation: 'any',
  }
}

const printfilesPayload = {
  result: {
    printfiles: [
      { printfile_id: 1, width: 1800, height: 2400, dpi: 150 },
      { printfile_id: 3, width: 2400, height: 3200, dpi: 150 },
      { printfile_id: 130, width: 585, height: 585, dpi: 150 },
    ],
    variant_printfiles: [
      { variant_id: 4012, placements: { front: 1, back: 1, front_large: 3, sleeve_left: 130, sleeve_right: 130 } },
    ],
  },
}

const rawFiles: CatalogPrintFile[] = [
  { fileId: 'front', type: 'front', title: 'Front print', additionalPrice: null, options: [] },
  { fileId: 'back', type: 'back', title: 'Back print', additionalPrice: 5.95, options: [] },
  { fileId: 'front_large', type: 'front_large', title: 'Large front print', additionalPrice: 2.95, options: [] },
  { fileId: 'sleeve_left', type: 'sleeve_left', title: 'Left sleeve', additionalPrice: 2.49, options: [] },
  { fileId: 'sleeve_right', type: 'sleeve_right', title: 'Right sleeve', additionalPrice: 2.49, options: [] },
  { fileId: 'mockup', type: 'mockup', title: 'Mockup', additionalPrice: null, options: [] },
]

/** Same join `fetchCatalogProductDetail` performs. */
function calibratedFiles(): CatalogPrintFile[] {
  const parsed = parsePrintfilesPayload(printfilesPayload)
  const guidelines = buildFileGuidelines({
    files: rawFiles.filter((file) => file.type !== 'mockup'),
    variants: [{ id: 4012, size: 'M', color: 'Black', in_stock: true }],
    printfiles: parsed.printfiles,
    variantPrintfiles: parsed.variantPrintfiles,
    templates: parseTemplatesPayload(templatesPayload),
    templateLinks: parseTemplateVariantLinks(templatesPayload),
  })
  const byType = new Map(guidelines.flatMap((g) => g.types.map((type) => [type, g] as const)))
  return rawFiles
    .filter((file) => file.type !== 'mockup')
    .map((file) => {
      const guide = byType.get(file.type)
      return {
        ...file,
        printWidth: guide?.printWidth ?? null,
        printHeight: guide?.printHeight ?? null,
        dpi: guide?.dpi ?? null,
        templateId: guide?.templateId ?? null,
        templateUrl: guide?.templateUrl ?? null,
        mockupStage: guide?.templateStage ?? null,
        templateAspect: guide?.templateAspect ?? null,
      }
    })
}

function detailWith(printFiles: CatalogPrintFile[]): CatalogProductDetail {
  return {
    product: {
      id: 71,
      title: 'Unisex Staple T-Shirt | Bella + Canvas 3001',
      type: 'T-SHIRT',
      typeName: 'T-Shirt',
      brand: 'Bella + Canvas',
      model: '3001',
      image: null,
      variantCount: 1,
      fileTypes: printFiles.map((file) => file.type),
      isDiscontinued: false,
      techniques: ['DTG'],
      studioFamily: 'tee',
      studioBlankId: tee.id,
      category: 'tees',
      mainCategoryId: 24,
      avgFulfillmentDays: 3,
    },
    colors: [],
    sizes: ['M'],
    defaultColors: [],
    defaultSizes: ['M'],
    minWholesale: null,
    fileTypes: printFiles.map((file) => file.type),
    variants: [],
    techniques: [{ key: 'DTG', label: 'DTG printing', isDefault: true }],
    printFiles,
    description: null,
    specs: null,
  }
}

function art(fileType: string, placement: ArtPlacement['placement']): ArtPlacement {
  return {
    placement,
    fileType,
    assetUrl: `https://cdn.example/${fileType}.png`,
    assetWidth: 3000,
    assetHeight: 3000,
    x: 0.1,
    y: 0.1,
    scale: 0.6,
    rotation: 0,
  }
}

describe('placement wiring (tee 71 shape)', () => {
  const files = calibratedFiles()

  it('gives every placement its own template, drop zone and print-file size', () => {
    const byType = Object.fromEntries(files.map((file) => [file.type, file]))
    expect(byType.front.templateId).toBe(150560)
    expect(byType.back.templateId).toBe(150680)
    expect(byType.front_large.templateId).toBe(150920)
    expect(byType.sleeve_left.templateId).toBe(151460)
    expect(byType.sleeve_right.templateId).toBe(151520)

    // Shared printfiles never collapse placements.
    expect(byType.front.templateUrl).not.toBe(byType.back.templateUrl)
    expect(byType.sleeve_left.mockupStage).not.toEqual(byType.sleeve_right.mockupStage)

    // Drop zones are normalised against the 3000×3000 template image.
    expect(byType.front.mockupStage).toEqual({ x: 1006 / 3000, y: 530 / 3000, w: 1010 / 3000, h: 1346 / 3000 })
    expect(byType.sleeve_left.mockupStage).toEqual({ x: 1270 / 3000, y: 1545 / 3000, w: 712 / 3000, h: 625 / 3000 })
    expect(byType.front.templateAspect).toBe(1)

    // Print-file size comes from the printfile (real pixels), not the template image.
    expect(byType.front.printWidth).toBe(1800)
    expect(byType.front.printHeight).toBe(2400)
    expect(byType.sleeve_left.printWidth).toBe(585)
    expect(byType.front_large.printWidth).toBe(2400)

    expect(auditPlacementTemplates(detailWith(files)).problems).toEqual([])
  })

  it('audit flags placements that share a template or lack a drop zone', () => {
    const broken = files.map((file) =>
      file.type === 'back' ? { ...file, templateId: 150560, mockupStage: files[0].mockupStage } : file
    )
    const audit = auditPlacementTemplates(detailWith(broken))
    expect(audit.problems.some((p) => p.includes('front and back'))).toBe(true)

    const missing = files.map((file) => (file.type === 'sleeve_left' ? { ...file, mockupStage: null } : file))
    expect(auditPlacementTemplates(detailWith(missing)).problems).toContain(
      'sleeve_left: no drop zone (template print_area_* missing)'
    )
  })

  it('fitting-room placement uses the template drop zone and the printfile size', () => {
    const sleeve = files.find((file) => file.type === 'sleeve_left')!
    const area = placementForPrintFile(sleeve, tee)
    expect(area.printfulType).toBe('sleeve_left')
    expect(area.stage).toEqual(sleeve.mockupStage)
    expect(area.printWidth).toBe(585)
    // Preview faces drawn with a variant photo use the studio blank zone instead.
    expect(placementForPrintFile(sleeve, tee, { surface: 'photo' }).stage).toEqual({
      x: 0.1,
      y: 0.34,
      w: 0.16,
      h: 0.14,
    })
    // 3D faces still dedupe by side (front/back), sleeves live on the front face.
    const faces = studioPlacementsForTechnique(detailWith(files), tee, 'DTG').map((item) => item.id)
    expect(faces).toEqual(['front', 'back'])
  })

  it('save keeps the Printful file type so sleeves survive the API round-trip', () => {
    const saved = normalizePlacements([
      art('front', 'front'),
      art('sleeve_left', 'front'),
      art('sleeve_right', 'front'),
      art('back', 'back'),
      { ...art('bad', 'front'), fileType: 'not valid!' }, // bad type → falls back to 'front', deduped
      { placement: 'sleeve_left', assetUrl: 'x' }, // bad placement id → dropped
    ])
    expect(saved.map(placementKey)).toEqual(['front', 'sleeve_left', 'sleeve_right', 'back'])
    expect(saved[1].fileType).toBe('sleeve_left')

    const legacy = normalizePlacements([{ ...art('front', 'front'), fileType: 'not valid!' }])
    expect(legacy).toHaveLength(1)
    expect(legacy[0].fileType).toBeUndefined()
  })

  it('restores saved art onto the exact print file, with a legacy fallback', () => {
    const restored = restoreCatalogFileLayers(
      [art('sleeve_left', 'front'), art('back', 'back'), art('front', 'front')],
      files,
      tee
    )
    expect(Object.keys(restored).sort()).toEqual(['back', 'front', 'sleeve_left'])
    expect(restored.sleeve_left.assetUrl).toContain('sleeve_left')

    // Legacy design without fileType lands on the primary front file, not a sleeve.
    const legacy = restoreCatalogFileLayers([{ ...art('front', 'front'), fileType: undefined }], files, tee)
    expect(Object.keys(legacy)).toEqual(['front'])
  })

  it('merges technique-scoped geometry so embroidery/DTF placements get templates too', () => {
    const dtg = {
      printfiles: parsePrintfilesPayload(printfilesPayload).printfiles,
      variantPrintfiles: parsePrintfilesPayload(printfilesPayload).variantPrintfiles,
      templates: parseTemplatesPayload(templatesPayload),
      templateLinks: parseTemplateVariantLinks(templatesPayload),
    }
    const embroideryPayload = {
      result: {
        variant_mapping: [
          {
            variant_id: 4012,
            templates: [
              { placement: 'embroidery_chest_left', template_id: 151280 },
              { placement: 'back', template_id: 150680 }, // shared with DTG → deduped
            ],
          },
        ],
        templates: [
          row(151280, 136, 'https://files.example/emb-left.png', 537, 537, 1098, 1770, true),
          row(150680, 1, 'https://files.example/back.png', 1031, 1375, 224, 987, false),
        ],
      },
    }
    const embroideryPrintfiles = parsePrintfilesPayload({
      result: {
        printfiles: [
          { printfile_id: 136, width: 1200, height: 1200, dpi: 300 },
          { printfile_id: 1, width: 1800, height: 2400, dpi: 150 },
        ],
        variant_printfiles: [{ variant_id: 4012, placements: { embroidery_chest_left: 136, back: 1 } }],
      },
    })
    const merged = mergePlacementGeometry([
      dtg,
      {
        printfiles: embroideryPrintfiles.printfiles,
        variantPrintfiles: embroideryPrintfiles.variantPrintfiles,
        templates: parseTemplatesPayload(embroideryPayload),
        templateLinks: parseTemplateVariantLinks(embroideryPayload),
      },
    ])
    expect(merged.printfiles.map((f) => f.printfileId).sort((a, b) => a - b)).toEqual([1, 3, 130, 136])
    expect(merged.templates.filter((t) => t.templateId === 150680)).toHaveLength(1)
    expect(merged.variantPrintfiles).toHaveLength(1)
    expect(merged.variantPrintfiles[0].placements).toMatchObject({ front: 1, embroidery_chest_left: 136, back: 1 })

    const guidelines = buildFileGuidelines({
      files: [
        ...rawFiles.filter((file) => file.type !== 'mockup'),
        { fileId: 'emb', type: 'embroidery_chest_left', title: 'Left chest', additionalPrice: null, options: [] },
      ],
      variants: [{ id: 4012, size: 'M', color: 'Black', in_stock: true }],
      printfiles: merged.printfiles,
      variantPrintfiles: merged.variantPrintfiles,
      templates: merged.templates,
      templateLinks: merged.templateLinks,
    })
    const emb = guidelines.find((g) => g.types.includes('embroidery_chest_left'))!
    expect(emb.templateId).toBe(151280)
    expect(emb.printWidth).toBe(1200)
    expect(emb.dpi).toBe(300)
  })

  it('keeps DTG and DTF placements on their own technique tab', () => {
    const mixed: CatalogPrintFile[] = [
      ...rawFiles.filter((file) => file.type !== 'mockup'),
      { fileId: 'front_dtf', type: 'front_dtf', title: 'Front print', additionalPrice: null, options: [] },
      { fileId: 'short_sleeve_left_dtf', type: 'short_sleeve_left_dtf', title: 'Left sleeve', additionalPrice: 2.49, options: [] },
      { fileId: 'label_inside', type: 'label_inside', title: 'Inside label', additionalPrice: 2.49, options: [] },
      { fileId: 'label_inside_dtf', type: 'label_inside_dtf', title: 'Inside label', additionalPrice: 2.49, options: [] },
      { fileId: 'embroidery_chest_left', type: 'embroidery_chest_left', title: 'Left chest', additionalPrice: null, options: [] },
    ]
    expect(filterPrintFilesForTechnique(mixed, 'DTG').map((f) => f.type)).toEqual([
      'front',
      'back',
      'front_large',
      'sleeve_left',
      'sleeve_right',
      'label_inside',
    ])
    expect(filterPrintFilesForTechnique(mixed, 'DTFILM').map((f) => f.type)).toEqual([
      'front_dtf',
      'short_sleeve_left_dtf',
      'label_inside_dtf',
    ])
    expect(filterPrintFilesForTechnique(mixed, 'EMBROIDERY').map((f) => f.type)).toEqual(['embroidery_chest_left'])
  })

  it('hides placements Printful has no geometry for, when a calibrated sibling exists', () => {
    const hat: CatalogPrintFile[] = [
      { fileId: 'default', type: 'embroidery_front', title: 'Front', additionalPrice: null, options: [], mockupSupported: false },
      {
        fileId: 'embroidery_front_large',
        type: 'embroidery_front_large',
        title: 'Front',
        additionalPrice: 2.95,
        options: [],
        mockupSupported: true,
        templateUrl: 'https://files.example/hat.png',
        mockupStage: { x: 0.2, y: 0.28, w: 0.6, h: 0.22 },
        printWidth: 1650,
        printHeight: 600,
        dpi: 300,
        templateId: 327829,
      },
    ]
    expect(filterPrintFilesForTechnique(hat, 'EMBROIDERY').map((f) => f.type)).toEqual(['embroidery_front_large'])
    // With nothing calibrated we keep the file rather than leaving the designer empty.
    expect(filterPrintFilesForTechnique([hat[0]], 'EMBROIDERY').map((f) => f.type)).toEqual(['embroidery_front'])

    const audit = auditPlacementTemplates(detailWith(hat))
    expect(audit.problems).toEqual([])
    expect(audit.warnings[0]).toContain('embroidery_front: Printful exposes no printfile or template')
  })

  it('publish sends one Printful file per placement type', () => {
    const design: MerchDesign = {
      id: 'd1',
      slug: 'd1',
      name: 'Test',
      blankId: tee.id,
      family: 'tee',
      catalogProductId: 71,
      placements: [art('front', 'front'), art('sleeve_left', 'front'), art('back', 'back')],
      colors: ['Black'],
      sizes: ['M'],
      previewColor: '#000',
      retailPrice: 30,
      wholesaleCost: 12,
      status: 'draft',
      variants: [],
      mockupUrls: [],
      printfulSyncProductId: null,
      mockupTaskKey: null,
      publishNote: null,
      createdAt: '',
      updatedAt: '',
    }
    const printed = buildPrintFiles(
      design,
      tee,
      { id: 71, files: rawFiles.map((file) => ({ type: file.type, title: file.title })) },
      'https://sergik.example',
      { sleeve_left: 'https://cdn.example/baked-sleeve.png' },
      { front: { width: 1800, height: 2400, dpi: 150 }, sleeve_left: { width: 585, height: 585, dpi: 150 } }
    )
    expect(printed.map((file) => file.type)).toEqual(['front', 'sleeve_left', 'back'])
    const sleeve = printed.find((file) => file.type === 'sleeve_left')!
    expect(sleeve.url).toBe('https://cdn.example/baked-sleeve.png')
    expect(sleeve.position.area_width).toBe(585)
    expect(printed[0].position.area_height).toBe(2400)
  })
})
