import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_SHOP_BACKDROP, parseShopBackdrop, type ShopBackdrop } from '@/lib/merch/shop-backdrop'

const ROW_ID = 'backdrop'

function backdropPath() {
  return join(process.cwd(), 'data', 'merch-backdrop.json')
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = `${error.code || ''} ${error.message || ''}`.toLowerCase()
  return message.includes('merch_shop_settings') || message.includes('42p01') || message.includes('does not exist')
}

async function readFileBackdrop(): Promise<ShopBackdrop> {
  try {
    const raw = await readFile(backdropPath(), 'utf8')
    return parseShopBackdrop(JSON.parse(raw))
  } catch {
    return DEFAULT_SHOP_BACKDROP
  }
}

async function writeFileBackdrop(backdrop: ShopBackdrop) {
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  await writeFile(backdropPath(), JSON.stringify(backdrop, null, 2))
}

async function readSupabaseBackdrop(): Promise<ShopBackdrop | null> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('merch_shop_settings')
      .select('payload')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error || !data) {
      if (error && !isMissingTable(error)) console.error('merch_shop_settings read:', error.message)
      return null
    }
    return parseShopBackdrop((data as { payload?: unknown }).payload)
  } catch (error) {
    console.error('merch_shop_settings read failed:', error)
    return null
  }
}

async function writeSupabaseBackdrop(backdrop: ShopBackdrop): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('merch_shop_settings').upsert(
      {
        id: ROW_ID,
        payload: backdrop,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    if (error) {
      if (!isMissingTable(error)) console.error('merch_shop_settings upsert:', error.message)
      return false
    }
    return true
  } catch (error) {
    console.error('merch_shop_settings upsert failed:', error)
    return false
  }
}

export async function readShopBackdropSetting(): Promise<ShopBackdrop> {
  const stored = await readSupabaseBackdrop()
  if (stored) return stored
  return readFileBackdrop()
}

export async function writeShopBackdropSetting(backdrop: ShopBackdrop): Promise<ShopBackdrop> {
  const saved = parseShopBackdrop(backdrop)
  await writeFileBackdrop(saved)
  await writeSupabaseBackdrop(saved)
  return saved
}
