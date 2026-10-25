export type PrintfulStoreSummary = {
  id: number
  name: string
  type: string
}

export type PrintfulSetupDiagnostics = {
  hasApiKey: boolean
  hasStoreId: boolean
  apiKeyValid: boolean
  apiError: string | null
  storeId: number | null
  storeMatch: PrintfulStoreSummary | null
  stores: PrintfulStoreSummary[]
  templatesReachable: boolean | null
  canPublish: boolean
}

export function parsePrintfulStoreId(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const id = Number(raw.trim())
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function diagnosePrintfulSetup(): Promise<PrintfulSetupDiagnostics> {
  const hasApiKey = Boolean(process.env.PRINTFUL_API_KEY?.trim())
  const storeId = parsePrintfulStoreId(process.env.PRINTFUL_STORE_ID)
  const hasStoreId = storeId != null

  let apiKeyValid = false
  let apiError: string | null = null
  let stores: PrintfulStoreSummary[] = []
  let templatesReachable: boolean | null = null

  if (hasApiKey) {
    try {
      const { printfulFetch } = await import('@/lib/printful')
      const storesPayload = await printfulFetch('/stores')
      const rows = (storesPayload as { result?: Array<{ id?: number; name?: string; type?: string }> })
        ?.result
      stores = (rows || [])
        .map((row) => ({
          id: Number(row.id),
          name: row.name || 'Store',
          type: row.type || '',
        }))
        .filter((row) => Number.isFinite(row.id) && row.id > 0)
      apiKeyValid = true

      try {
        const probe = await printfulFetch('/mockup-generator/templates/71')
        const result = (probe as { result?: unknown })?.result
        // Printful returns an object: { templates: [...], printfiles: [...], ... }.
        // Some products/accounts return a bare array. Accept either shape.
        if (Array.isArray(result)) {
          templatesReachable = result.length > 0
        } else if (result && typeof result === 'object') {
          const templates = (result as { templates?: unknown[] }).templates
          templatesReachable = Array.isArray(templates) ? templates.length > 0 : true
        } else {
          templatesReachable = Boolean(result)
        }
      } catch {
        templatesReachable = false
      }
    } catch (error: unknown) {
      apiKeyValid = false
      apiError = error instanceof Error ? error.message : 'Printful API request failed'
    }
  }

  const storeMatch =
    storeId != null ? stores.find((store) => store.id === storeId) ?? null : null

  const canPublish = apiKeyValid && storeMatch != null

  return {
    hasApiKey,
    hasStoreId,
    apiKeyValid,
    apiError,
    storeId,
    storeMatch,
    stores,
    templatesReachable,
    canPublish,
  }
}
