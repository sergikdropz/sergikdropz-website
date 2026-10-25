import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { createSupabaseServerClient } from '@/lib/supabase'
import { slugify, type MerchDesign } from '@/lib/merch/design'

type DesignFile = { designs: MerchDesign[] }

function designsPath() {
  return join(process.cwd(), 'data', 'merch-designs.json')
}

async function readFileDesigns(): Promise<MerchDesign[]> {
  try {
    const raw = await readFile(designsPath(), 'utf8')
    const parsed = JSON.parse(raw) as DesignFile
    return Array.isArray(parsed.designs) ? parsed.designs : []
  } catch {
    return []
  }
}

async function writeFileDesigns(designs: MerchDesign[]) {
  const path = designsPath()
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  await writeFile(path, JSON.stringify({ designs }, null, 2))
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = `${error.code || ''} ${error.message || ''}`.toLowerCase()
  return message.includes('merch_designs') || message.includes('42p01') || message.includes('does not exist')
}

async function readSupabaseDesigns(): Promise<{ ok: true; designs: MerchDesign[] } | { ok: false }> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('merch_designs')
      .select('payload')
      .order('updated_at', { ascending: false })
    if (error || !data) {
      if (error && !isMissingTable(error)) console.error('merch_designs read:', error.message)
      return { ok: false }
    }
    return {
      ok: true,
      designs: data
        .map((row) => (row as { payload?: MerchDesign }).payload)
        .filter((design): design is MerchDesign => Boolean(design?.id)),
    }
  } catch (error) {
    console.error('merch_designs read failed:', error)
    return { ok: false }
  }
}

async function upsertSupabase(design: MerchDesign): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from('merch_designs').upsert(
      {
        id: design.id,
        slug: design.slug,
        status: design.status,
        name: design.name,
        payload: design,
        updated_at: design.updatedAt,
      },
      { onConflict: 'id' }
    )
    if (error) {
      if (!isMissingTable(error)) console.error('merch_designs upsert:', error.message)
      return false
    }
    return true
  } catch (error) {
    console.error('merch_designs upsert failed:', error)
    return false
  }
}

export async function listDesigns(): Promise<MerchDesign[]> {
  const remote = await readSupabaseDesigns()
  if (remote.ok && remote.designs.length > 0) return remote.designs
  const local = await readFileDesigns()
  if (remote.ok && local.length === 0) return remote.designs
  return local.length > 0 ? local : remote.ok ? remote.designs : local
}

export async function getDesign(id: string): Promise<MerchDesign | null> {
  const designs = await listDesigns()
  return designs.find((design) => design.id === id) || null
}

export async function saveDesign(design: MerchDesign): Promise<{ design: MerchDesign; where: string }> {
  const designs = await listDesigns()
  const next = designs.some((row) => row.id === design.id)
    ? designs.map((row) => (row.id === design.id ? design : row))
    : [design, ...designs]
  const db = await upsertSupabase(design)
  let file = false
  try {
    await writeFileDesigns(next)
    file = true
  } catch (error) {
    console.error('merch design file write:', error)
  }
  if (!db && !file) {
    throw new Error('Could not save the design')
  }
  return { design, where: db ? 'supabase' : 'file' }
}

export function uniqueSlug(name: string, designs: MerchDesign[], ignoreId?: string): string {
  const base = slugify(name)
  const taken = new Set(
    designs.filter((design) => design.id !== ignoreId).map((design) => design.slug)
  )
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}
