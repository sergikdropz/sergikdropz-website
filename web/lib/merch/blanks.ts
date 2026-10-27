/**
 * Streetwear blanks for the fitting room.
 * Print areas are fractions of the stage. Print files are authored at 150 DPI.
 * Catalog hint ids are confirmed against the live Printful catalog at publish time.
 */

export type GarmentFamily = 'tee' | 'hoodie' | 'hat' | 'sweatpants'

export type PlacementId = 'front' | 'back'

export type BlankColor = {
  name: string
  hex: string
  /** Printful `color_code2` for two-tone variants such as Black/Red. */
  hex2?: string | null
}

export type BlankPlacement = {
  id: PlacementId
  label: string
  /** Printful file type. Publish falls back to the catalog's first file type. */
  printfulType: string
  /** Print rectangle as fractions of the stage (0–1). */
  stage: { x: number; y: number; w: number; h: number }
  printWidth: number
  printHeight: number
}

export type MerchBlank = {
  id: string
  family: GarmentFamily
  name: string
  category: 'tees' | 'hoodies' | 'hats' | 'pants'
  /** Shown until Printful returns a live wholesale price. */
  estimatedCost: number
  catalogHintId: number
  /** Title fragments that must appear for the hint to be accepted. */
  titleMatch: string[]
  colors: BlankColor[]
  sizes: string[]
  defaultColors: string[]
  defaultSizes: string[]
  placements: BlankPlacement[]
}

export const MERCH_BLANKS: MerchBlank[] = [
  {
    id: 'tee-staple',
    family: 'tee',
    name: 'Staple tee',
    category: 'tees',
    estimatedCost: 13,
    catalogHintId: 71,
    titleMatch: ['3001', 't-shirt'],
    colors: [
      { name: 'Black', hex: '#1a1a1a' },
      { name: 'White', hex: '#f3f3f3' },
      { name: 'Navy', hex: '#1c2740' },
      { name: 'Bone', hex: '#e4dccb' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    defaultColors: ['Black', 'White'],
    defaultSizes: ['S', 'M', 'L', 'XL'],
    placements: [
      {
        id: 'front',
        label: 'Front',
        printfulType: 'front',
        stage: { x: 0.36, y: 0.31, w: 0.28, h: 0.28 },
        printWidth: 1800,
        printHeight: 2400,
      },
      {
        id: 'back',
        label: 'Back',
        printfulType: 'back',
        stage: { x: 0.34, y: 0.30, w: 0.32, h: 0.32 },
        printWidth: 1800,
        printHeight: 2400,
      },
    ],
  },
  {
    id: 'hoodie-fleece',
    family: 'hoodie',
    name: 'Fleece hoodie',
    category: 'hoodies',
    estimatedCost: 27,
    catalogHintId: 146,
    titleMatch: ['hoodie'],
    colors: [
      { name: 'Black', hex: '#1a1a1a' },
      { name: 'White', hex: '#f3f3f3' },
      { name: 'Navy', hex: '#1c2740' },
      { name: 'Sport Grey', hex: '#9a9a9a' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    defaultColors: ['Black', 'White'],
    defaultSizes: ['S', 'M', 'L', 'XL'],
    placements: [
      {
        id: 'front',
        label: 'Front',
        printfulType: 'front',
        stage: { x: 0.36, y: 0.28, w: 0.28, h: 0.18 },
        printWidth: 1800,
        printHeight: 1800,
      },
      {
        id: 'back',
        label: 'Back',
        printfulType: 'back',
        stage: { x: 0.34, y: 0.3, w: 0.32, h: 0.22 },
        printWidth: 1800,
        printHeight: 1800,
      },
    ],
  },
  {
    id: 'hat-dad',
    family: 'hat',
    name: 'Dad hat',
    category: 'hats',
    estimatedCost: 15,
    catalogHintId: 206,
    titleMatch: ['hat', 'cap'],
    colors: [
      { name: 'Black', hex: '#1a1a1a' },
      { name: 'White', hex: '#f3f3f3' },
      { name: 'Navy', hex: '#1c2740' },
      { name: 'Khaki', hex: '#c2b280' },
    ],
    sizes: ['One size'],
    defaultColors: ['Black', 'White'],
    defaultSizes: ['One size'],
    placements: [
      {
        id: 'front',
        label: 'Front',
        printfulType: 'front',
        stage: { x: 0.38, y: 0.34, w: 0.24, h: 0.1 },
        printWidth: 1200,
        printHeight: 675,
      },
    ],
  },
  {
    id: 'sweatpants-fleece',
    family: 'sweatpants',
    name: 'Fleece sweatpants',
    category: 'pants',
    estimatedCost: 29,
    catalogHintId: 403,
    titleMatch: ['jogger', 'sweatpant', 'pant'],
    colors: [
      { name: 'Black', hex: '#1a1a1a' },
      { name: 'White', hex: '#f3f3f3' },
      { name: 'Navy', hex: '#1c2740' },
      { name: 'Sport Grey', hex: '#9a9a9a' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    defaultColors: ['Black'],
    defaultSizes: ['S', 'M', 'L', 'XL'],
    placements: [
      {
        id: 'front',
        label: 'Left leg',
        printfulType: 'front',
        stage: { x: 0.33, y: 0.32, w: 0.12, h: 0.13 },
        printWidth: 1500,
        printHeight: 2100,
      },
      {
        id: 'back',
        label: 'Right leg',
        printfulType: 'back',
        stage: { x: 0.55, y: 0.32, w: 0.12, h: 0.13 },
        printWidth: 1500,
        printHeight: 2100,
      },
    ],
  },
]

export function getBlank(id: string): MerchBlank | undefined {
  return MERCH_BLANKS.find((blank) => blank.id === id)
}

export function blanksByFamily(family: GarmentFamily): MerchBlank[] {
  return MERCH_BLANKS.filter((blank) => blank.family === family)
}
