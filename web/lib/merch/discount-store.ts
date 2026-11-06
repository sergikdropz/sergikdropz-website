import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { findMerchDiscount, parseMerchDiscounts, type MerchDiscount } from '@/lib/merch/discount'

const ROW_ID = 'discounts'

function discountsPath() {
  return join(process.cwd(), 'data', 'merch-discounts.json')
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = `${error.code || ''} ${error.message || ''}`.toLowerCase()
  return message.includes('merch_shop_settings') || message.includes('42p01') || message.includes('does not exist')
}

async function readFileDiscounts(): Promise<MerchDiscount[]> {
  try {
    const raw = await readFile(discountsPath(), 'utf8')
    return parseMerchDiscounts(JSON.parse(raw))
  } catch {
    return []
  }
}

async function writeFileDiscounts(codes: MerchDiscount[]) {
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  await writeFile(discountsPath(), JSON.stringify({ codes }, null, 2))
}

async function readSupabaseDiscounts(): Promise<MerchDiscount[] | null> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('merch_shop_settings')
      .select('payload')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error || !data) {
      if (error && !isMissingTable(error)) console.error('merch discount read:', error.message)
      return null
    }
    return parseMerchDiscounts((data as { payload?: unknown }).payload)
  } catch (error) {
    console.error('merch discount read failed:', error)
    return null
  }
}

async function writeSupabaseDiscounts(codes: MerchDiscount[]): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('merch_shop_settings').upsert(
      {
        id: ROW_ID,
        payload: { codes },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    if (error) {
      if (!isMissingTable(error)) console.error('merch discount upsert:', error.message)
      return false
    }
    return true
  } catch (error) {
    console.error('merch discount upsert failed:', error)
    return false
  }
}

export async function readMerchDiscounts(): Promise<MerchDiscount[]> {
  const stored = await readSupabaseDiscounts()
  if (stored) return stored
  return readFileDiscounts()
}

export async function writeMerchDiscounts(codes: MerchDiscount[]): Promise<MerchDiscount[]> {
  const saved = parseMerchDiscounts(codes)
  const remote = await writeSupabaseDiscounts(saved)
  if (!remote) await writeFileDiscounts(saved)
  else await writeFileDiscounts(saved).catch(() => undefined)
  return saved
}

export async function findActiveMerchDiscount(rawCode: string): Promise<MerchDiscount | null> {
  const found = findMerchDiscount(await readMerchDiscounts(), rawCode)
  if (!found?.active) return null
  return found
}
