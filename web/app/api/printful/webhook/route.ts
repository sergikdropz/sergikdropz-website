import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { printfulOrderMatch } from '@/lib/merch/order-link'

/**
 * Printful v1 webhooks are NOT HMAC-signed, so we authenticate with a secret URL
 * token instead: register the endpoint as `…/api/printful/webhook?token=SECRET`
 * and set PRINTFUL_WEBHOOK_SECRET to the same value. If the secret is unset the
 * endpoint is open (acceptable only behind an unguessable URL in dev).
 * See knowledge/merch/PRINTFUL_API.md §7.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.PRINTFUL_WEBHOOK_SECRET
    if (secret) {
      const token =
        new URL(request.url).searchParams.get('token') ||
        request.headers.get('x-webhook-token') ||
        ''
      if (token !== secret) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
    }

    const body = await request.json()
    const supabase = createSupabaseServerClient()
    const { type, data } = body
    const match = printfulOrderMatch(data?.order)

    async function touchOrder(patch: Record<string, unknown>) {
      const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
      if (match.printfulOrderId) {
        next.printful_order_id = match.printfulOrderId
      }
      if (match.merchOrderId) {
        const byId = await supabase.from('merch_orders').update(next).eq('id', match.merchOrderId)
        if (!byId.error) return
      }
      if (match.printfulOrderId) {
        await supabase.from('merch_orders').update(next).eq('printful_order_id', match.printfulOrderId)
      }
    }

    switch (type) {
      case 'package_shipped': {
        const shipment = data.shipment
        await touchOrder({
          status: 'shipped',
          tracking_number: shipment?.tracking_number || null,
          tracking_url: shipment?.tracking_url || null,
        })
        console.log('Merch order shipped:', match.printfulOrderId)
        break
      }

      case 'package_returned': {
        await touchOrder({ status: 'returned' })
        console.warn('Merch package returned:', match.printfulOrderId)
        break
      }

      case 'order_created': {
        await touchOrder({ status: 'processing' })
        break
      }

      case 'order_updated': {
        // Mirror Printful's own status when it is a terminal/meaningful one.
        const pfStatus = String(data?.order?.status || '').toLowerCase()
        const map: Record<string, string> = {
          fulfilled: 'shipped',
          canceled: 'canceled',
          failed: 'failed',
          onhold: 'on_hold',
          inprocess: 'processing',
          pending: 'processing',
        }
        if (map[pfStatus]) await touchOrder({ status: map[pfStatus] })
        break
      }

      case 'order_failed': {
        await touchOrder({ status: 'failed' })
        console.error('Printful order failed:', match.printfulOrderId, data.reason)
        break
      }

      case 'order_canceled': {
        await touchOrder({ status: 'canceled' })
        break
      }

      case 'order_refunded': {
        await touchOrder({ status: 'refunded' })
        break
      }

      case 'order_put_hold':
      case 'order_put_hold_approval': {
        await touchOrder({ status: 'on_hold' })
        console.warn('Printful order on hold:', match.printfulOrderId, data?.reason)
        break
      }

      case 'order_remove_hold': {
        await touchOrder({ status: 'processing' })
        break
      }

      default:
        // product_synced / product_updated / stock_updated etc. — acknowledge, no row change.
        break
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Printful webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
