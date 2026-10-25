import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { mailDomain } from '@/lib/email/departments'
import {
  createMailAccount,
  deleteMailAccount,
  listResolvedMailAccounts,
  updateMailAccount,
} from '@/lib/email/mail-accounts'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession()
  if (!session?.isAdmin) return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const departments = await listResolvedMailAccounts()
  return NextResponse.json({ domain: mailDomain(), departments })
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  try {
    const account = await createMailAccount({
      name: body.name,
      localPart: body.localPart,
      purpose: body.purpose,
    })
    return NextResponse.json({ ok: true, account })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not add account'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  try {
    const account = await updateMailAccount(id, {
      name: body.name,
      localPart: body.localPart,
      purpose: body.purpose,
    })
    return NextResponse.json({ ok: true, account })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not save account'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = request.nextUrl.searchParams.get('id')?.trim() || ''
  if (!id) return NextResponse.json({ error: 'Missing account.' }, { status: 400 })
  try {
    await deleteMailAccount(id)
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not remove account'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
