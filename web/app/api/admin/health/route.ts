import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createSupabaseServerClient()

  let database: 'healthy' | 'unhealthy' = 'healthy'
  let storage: 'healthy' | 'unhealthy' = 'healthy'
  let apis: 'healthy' | 'unhealthy' = 'healthy'

  try {
    const { error } = await supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
    if (error) database = 'unhealthy'
  } catch (error) {
    console.error('Health check: database failed', error)
    database = 'unhealthy'
  }

  try {
    const { error } = await supabase.storage.listBuckets()
    if (error) storage = 'unhealthy'
  } catch (error) {
    console.error('Health check: storage failed', error)
    storage = 'unhealthy'
  }

  try {
    const { error } = await supabase
      .from('admins')
      .select('id', { count: 'exact', head: true })
    if (error) apis = 'unhealthy'
  } catch (error) {
    console.error('Health check: apis failed', error)
    apis = 'unhealthy'
  }

  return NextResponse.json(
    {
      database,
      storage,
      apis,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
