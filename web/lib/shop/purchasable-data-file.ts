import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export type PurchasableTrackRecord = {
  id: string
  title: string
  slug?: string
  description: string
  price: number
  formats: Array<{ type: string; file: string; size?: string }>
  previewUrl?: string
  artwork?: string
  duration?: number
  stripePriceId?: string
  licensingEnabled?: boolean
  availableTiers?: string[]
  freeDownload?: boolean
  freeDownloadFormats?: string[]
  distributionTrackId?: string
  releaseId?: string
  isrc?: string
}

export type PurchasableTracksFile = {
  tracks: PurchasableTrackRecord[]
  _note?: string
  lastDistributionScanAt?: string
}

export function resolvePurchasableTracksJsonPath(): string {
  const candidates = [
    join(process.cwd(), 'data', 'purchasable-tracks.json'),
    join(process.cwd(), 'web', 'data', 'purchasable-tracks.json'),
  ]
  return candidates.find((path) => existsSync(path)) || candidates[0]
}

export async function readPurchasableTracksFile(): Promise<PurchasableTracksFile> {
  const content = await readFile(resolvePurchasableTracksJsonPath(), 'utf-8')
  return JSON.parse(content) as PurchasableTracksFile
}

export async function writePurchasableTracksFile(data: PurchasableTracksFile): Promise<void> {
  await writeFile(resolvePurchasableTracksJsonPath(), JSON.stringify(data, null, 2) + '\n', 'utf-8')
}
