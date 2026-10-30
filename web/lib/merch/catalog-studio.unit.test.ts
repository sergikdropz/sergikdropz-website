import { describe, expect, it } from 'vitest'
import {
  coloredTemplate,
  colorwayGarmentPhoto,
  positioningPatternUrl,
  containedImageBox,
  designPreviewColorName,
  angleMatchesFile,
  frontMockupIndex,
  frontPhotoIndex,
  mockupPhotosForColor,
  mockupTitlesForColor,
  shopFrontPhotoIndex,
  catalogAngleViews,
  catalogShopAngleViews,
  shopAngleShowsGarmentPhoto,
  orderPrintFilesByAngles,
  previewUsesMockupPhoto,
  designGarmentImage,
  filterPrintFilesForTechnique,
  techniqueForSavedFile,
  isAllOverCatalogProduct,
  studioPlacementsForProduct,
} from '@/lib/merch/catalog-studio'
import type { CatalogPrintFile } from '@/lib/merch/printful-catalog'
import type { CatalogProductDetail } from '@/lib/merch/printful-catalog'
import { MERCH_BLANKS } from '@/lib/merch/blanks'

function mockDetail(overrides: Partial<CatalogProductDetail>): CatalogProductDetail {
  return {
    product: {
      id: 1,
      title: 'Test Tee',
      type: 'T-SHIRT',
      typeName: 'T-Shirt',
      brand: null,
      model: null,
      image: null,
      variantCount: 1,
      fileTypes: ['front', 'back'],
      isDiscontinued: false,
      techniques: [],
      studioFamily: 'tee',
      studioBlankId: null,
      category: 'tees',
      mainCategoryId: null,
      avgFulfillmentDays: null,
    },
    colors: [],
    sizes: ['M'],
    defaultColors: [],
    defaultSizes: ['M'],
    minWholesale: null,
    fileTypes: ['front', 'back'],
    variants: [],
    techniques: [],
    printFiles: [],
    description: null,
    specs: null,
    ...overrides,
  }
}

describe('catalog-studio', () => {
  it('detects all-over products', () => {
    const detail = mockDetail({
      product: { ...mockDetail({}).product, title: 'All-Over Print Crop Tee' },
      fileTypes: ['default'],
    })
    expect(isAllOverCatalogProduct(detail)).toBe(true)
  })

  it('maps placements from Printful file types', () => {
    const detail = mockDetail({ fileTypes: ['front'] })
    const placements = studioPlacementsForProduct(detail, MERCH_BLANKS[0])
    expect(placements.some((p) => p.id === 'front')).toBe(true)
    expect(placements.some((p) => p.id === 'back')).toBe(false)
  })

  it('uses the selected variant template on the design stage', () => {
    const detail = mockDetail({
      variants: [
        { id: 10, color: 'Black', size: 'One size', image: 'https://files.example/catalog-black.jpg' },
        { id: 11, color: 'White', size: 'One size', image: 'https://files.example/catalog-white.jpg' },
      ],
      printFiles: [
        {
          fileId: 'front',
          type: 'front',
          title: 'Front',
          additionalPrice: null,
          options: [],
          templateUrl: 'https://files.example/base.png',
          variantTemplates: {
            '10': { imageUrl: 'https://files.example/base.png', backgroundColor: '#2a2a2a' },
            '11': { imageUrl: 'https://files.example/base.png', backgroundColor: '#ffffff' },
          },
          mockupStage: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
        },
      ],
    })
    const file = detail.printFiles[0]
    expect(designGarmentImage(detail, file, 'White', 'One size')).toBe('https://files.example/base.png')
    expect(coloredTemplate(detail, file, 'White', 'One size')).toEqual({
      imageUrl: 'https://files.example/base.png',
      backgroundColor: '#ffffff',
    })
    expect(coloredTemplate(detail, file, 'Black', 'One size')?.backgroundColor).toBe('#2a2a2a')
  })

  it('fills a shared back positioning sheet with that color’s front photo', () => {
    const detail = mockDetail({
      variants: [
        { id: 20, color: 'Sherbet rainbow', size: 'M', image: 'https://files.example/model.jpg' },
        { id: 21, color: 'Classic rainbow', size: 'M', image: 'https://files.example/model-classic.jpg' },
      ],
      printFiles: [
        {
          fileId: 'back',
          type: 'back_dtf',
          title: 'Back',
          additionalPrice: null,
          options: [],
          templateUrl: 'https://files.example/ghost/back/06_ghost_back_positioning_whitebg.png',
          variantTemplates: {
            '20': {
              imageUrl: 'https://files.example/ghost/back/06_ghost_back_positioning_whitebg.png',
              backgroundColor: null,
            },
            '21': {
              imageUrl: 'https://files.example/ghost/back/06_ghost_back_positioning_whitebg.png',
              backgroundColor: null,
            },
          },
        },
        {
          fileId: 'front',
          type: 'front_dtf',
          title: 'Front',
          additionalPrice: null,
          options: [],
          templateUrl: 'https://files.example/ghost/front/05_ghost_front_sherbetrainbow_base_whitebg.png',
          variantTemplates: {
            '20': {
              imageUrl: 'https://files.example/ghost/front/05_ghost_front_sherbetrainbow_base_whitebg.png',
              backgroundColor: null,
            },
            '21': {
              imageUrl: 'https://files.example/ghost/front/05_ghost_front_classicrainbow_base_whitebg.png',
              backgroundColor: null,
            },
          },
        },
      ],
    })
    const back = detail.printFiles[0]
    expect(colorwayGarmentPhoto(detail, 'Sherbet rainbow', 'M')).toBe(
      'https://files.example/ghost/front/05_ghost_front_sherbetrainbow_base_whitebg.png',
    )
    expect(positioningPatternUrl(detail, back.variantTemplates?.['20']?.imageUrl, 'Sherbet rainbow', 'M')).toBe(
      'https://files.example/ghost/front/05_ghost_front_sherbetrainbow_base_whitebg.png',
    )
    expect(positioningPatternUrl(detail, detail.printFiles[1].templateUrl, 'Sherbet rainbow', 'M')).toBeNull()
  })

  it('keeps a solid-color ghost on its swatch instead of another shared sheet', () => {
    const detail = mockDetail({
      variants: [
        { id: 1, color: 'Black', size: 'M', image: null },
        { id: 2, color: 'White', size: 'M', image: null },
      ],
      printFiles: [
        {
          fileId: 'front',
          type: 'front',
          title: 'Front',
          additionalPrice: null,
          options: [],
          templateUrl: 'https://files.example/ghost/front/base.png',
          variantTemplates: {
            '1': { imageUrl: 'https://files.example/ghost/front/base.png', backgroundColor: '#111111' },
            '2': { imageUrl: 'https://files.example/ghost/front/base.png', backgroundColor: '#ffffff' },
          },
        },
      ],
    })
    expect(colorwayGarmentPhoto(detail, 'Black', 'M')).toBeNull()
    expect(positioningPatternUrl(detail, 'https://files.example/back_positioning.png', 'Black', 'M')).toBeNull()
  })

  it('uses the saved preview color instead of the first sell color', () => {
    expect(
      designPreviewColorName(
        [
          { name: 'Black Denim', hex: '#1c1c1c' },
          { name: 'Classic / Light Denim', hex: '#547da0' },
        ],
        '#547DA0',
        ['Black Denim'],
      ),
    ).toBe('Classic / Light Denim')
    expect(designPreviewColorName([], '#ffffff', ['Black Denim'])).toBe('Black Denim')
    expect(designPreviewColorName([], null, [])).toBe('Black')
  })

  it('keeps a put-out photo only for the color it was made in', () => {
    const photo = '/api/merch/art/photo.jpg'
    expect(previewUsesMockupPhoto(photo, 'Bio White', null, true)).toBe(true)
    expect(previewUsesMockupPhoto(photo, 'Bio White', 'Bio White', false)).toBe(true)
    expect(previewUsesMockupPhoto(photo, 'Bio White', 'Bio White', true)).toBe(true)
    expect(previewUsesMockupPhoto(photo, 'Bio White', 'Black', true)).toBe(false)
    expect(previewUsesMockupPhoto('', 'Bio White', 'Black', true)).toBe(false)
  })

  it('starts a hat on the straight Front photo, not the Back angle Printful lists first', () => {
    const titles = ['Back', 'Left Front', 'Left Side', 'Right Front', 'Right Side', 'Front']
    expect(frontMockupIndex(titles)).toBe(5)
    expect(frontMockupIndex(['Left Front', 'Right Front'])).toBe(0)
    expect(frontMockupIndex(undefined)).toBe(0)
    expect(frontPhotoIndex(6, titles)).toBe(5)
    expect(frontPhotoIndex(2, titles)).toBe(1)
    const urls = titles.map((title) => `/api/merch/art/${title}.jpg`)
    expect(
      shopFrontPhotoIndex({
        mockupUrls: urls,
        mockupUrlsByColor: { Black: urls },
        mockupAngleTitlesByColor: { Black: titles },
        previewColorName: 'Black',
      }),
    ).toBe(5)
    expect(mockupTitlesForColor({ Black: titles }, 'Black', 'Black')).toEqual(titles)
    expect(mockupTitlesForColor({ Black: titles }, 'White', 'Black')).toEqual([])
  })

  it('offers each Printful template face once, skipping add-ons and unmeasured files', () => {
    const stage = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
    const face = (type: string, title: string, measured: boolean): CatalogPrintFile =>
      ({
        fileId: type,
        type,
        title,
        additionalPrice: null,
        options: [],
        templateUrl: measured ? `https://files.example/${type}.png` : null,
        mockupStage: measured ? stage : null,
      }) as CatalogPrintFile
    expect(
      catalogAngleViews([
        face('embroidery_front', 'Front', false),
        face('embroidery_front_large', 'Front', true),
        face('embroidery_back', 'Back', true),
        face('embroidery_right', 'Right side', true),
        face('addon_embroidery_front', 'Front', true),
      ]    ).map((view) => view.label),
    ).toEqual(['Front', 'Back', 'Right side'])
  })

  it('drops shop angles that only show bare placement templates', () => {
    const stage = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
    const front: CatalogPrintFile = {
      fileId: 'front',
      type: 'front',
      title: 'Front print',
      additionalPrice: null,
      options: [],
      templateUrl: 'https://files.cdn.printful.com/m/tee/medium/Flat/Front/ghost.png',
      mockupStage: stage,
    }
    const sleeve: CatalogPrintFile = {
      fileId: 'sleeve_left',
      type: 'sleeve_left',
      title: 'Left sleeve top',
      additionalPrice: null,
      options: [],
      templateUrl: 'https://files.cdn.printful.com/m/tee/medium/template/square_sleeve_template.png',
      mockupStage: stage,
    }
    const detail = mockDetail({
      product: { ...mockDetail({}).product, title: 'Tee' },
      sizes: ['M'],
      variants: [{ id: 10, color: 'Black', size: 'M', image: null }],
      printFiles: [front, sleeve],
    })
    expect(shopAngleShowsGarmentPhoto(detail, front, 'Black', 'M')).toBe(true)
    expect(shopAngleShowsGarmentPhoto(detail, sleeve, 'Black', 'M')).toBe(false)
    expect(catalogShopAngleViews([front, sleeve], detail, 'Black', 'M').map((view) => view.id)).toEqual([
      'front',
    ])
  })

  it('uses the angle photos Printful stored for the selected color', () => {
    const black = ['/api/merch/art/black-front.jpg', '/api/merch/art/black-side.jpg']
    const white = ['/api/merch/art/white-front.jpg']
    const byColor = { Black: black, White: white }
    expect(mockupPhotosForColor(black, byColor, 'White', 'Black')).toEqual(white)
    expect(mockupPhotosForColor(black, byColor, 'Black', 'Black')).toEqual(black)
    expect(mockupPhotosForColor(black, {}, 'Navy', 'Black')).toEqual([])
    expect(mockupPhotosForColor(black, {}, 'Black', 'Black')).toEqual(black)
  })

  it('lines template views up with the photographed angles', () => {
    const files = [
      { type: 'embroidery_back', title: 'Back' },
      { type: 'embroidery_front_large', title: 'Front wide' },
      { type: 'embroidery_right', title: 'Right side' },
    ]
    expect(angleMatchesFile('Right', files[2])).toBe(true)
    expect(orderPrintFilesByAngles(files, ['Front', 'Right', 'Lifestyle']).map((file) => file.type)).toEqual([
      'embroidery_front_large',
      'embroidery_right',
    ])
  })

  it('letterboxes a portrait product photo inside a square card', () => {
    expect(containedImageBox(1, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    const portrait = containedImageBox(1, 700 / 1000)
    expect(portrait.y).toBe(0)
    expect(portrait.h).toBe(1)
    expect(portrait.w).toBeCloseTo(0.7)
    expect(portrait.x).toBeCloseTo(0.15)
    const landscape = containedImageBox(1, 1.6)
    expect(landscape.x).toBe(0)
    expect(landscape.w).toBe(1)
    expect(landscape.h).toBeCloseTo(1 / 1.6)
    expect(landscape.y).toBeCloseTo((1 - 1 / 1.6) / 2)
  })

  it('filters dad hat files by embroidery vs dtf technique', () => {
    const files: CatalogPrintFile[] = [
      { fileId: 'default', type: 'embroidery_front', title: 'Front', additionalPrice: null, options: [] },
      { fileId: 'front_dtf_hat', type: 'front_dtf_hat', title: 'Front print', additionalPrice: 2.95, options: [] },
    ]
    expect(filterPrintFilesForTechnique(files, 'EMBROIDERY')).toHaveLength(1)
    expect(filterPrintFilesForTechnique(files, 'DTFILM')).toHaveLength(1)
  })

  it('opens the technique that holds the saved print file', () => {
    const techniques = [
      { key: 'EMBROIDERY', isDefault: true },
      { key: 'DTFILM', isDefault: false },
    ]
    expect(techniqueForSavedFile(techniques, 'front_dtf')).toBe('DTFILM')
    expect(techniqueForSavedFile(techniques, 'embroidery_chest_left')).toBe('EMBROIDERY')
  })
})
