#!/usr/bin/env npx tsx
/**
 * Pull the full Printful catalog (GET /products) into data/printful-catalog.json.
 * Requires PRINTFUL_API_KEY in web/.env.local
 */
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'
import { syncPrintfulCategoriesFromApi } from '../lib/merch/printful-categories'
import { syncPrintfulCatalogFromApi } from '../lib/merch/printful-catalog'

const root = join(process.cwd())
for (const file of ['.env.local', '.env']) {
  const path = join(root, file)
  if (existsSync(path)) config({ path })
}

async function main() {
  const snapshot = await syncPrintfulCatalogFromApi()
  const categories = await syncPrintfulCategoriesFromApi()
  console.log(
    `Synced ${snapshot.productCount} products and ${categories.flat.length} categories at ${snapshot.syncedAt}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
