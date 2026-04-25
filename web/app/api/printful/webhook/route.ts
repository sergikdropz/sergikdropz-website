import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Verify webhook secret if configured
    const webhookSecret = process.env.PRINTFUL_WEBHOOK_SECRET
    if (webhookSecret) {
      const signature = request.headers.get('x-printful-signature')
      if (signature !== webhookSecret) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const supabase = createSupabaseServerClient()
    const { type, data } = body

    // Handle different Printful webhook events
    switch (type) {
      case 'package_shipped': {
        const orderId = String(data.order?.id)
        const shipment = data.shipment

        if (orderId) {
          await supabase
            .from('merch_orders')
            .update({
              status: 'shipped',
              tracking_number: shipment?.tracking_number || null,
              tracking_url: shipment?.tracking_url || null,
              updated_at: new Date().toISOString(),
            })
            .eq('printful_order_id', orderId)

          console.log('Merch order shipped:', orderId)
        }
        break
      }

      case 'order_created': {
        const orderId = String(data.order?.id)
        if (orderId) {
          await supabase
            .from('merch_orders')
            .update({
              printful_order_id: orderId,
              status: 'processing',
              updated_at: new Date().toISOString(),
            })
            .eq('printful_order_id', orderId)
        }
        break
      }

      case 'order_failed': {
        const orderId = String(data.order?.id)
        if (orderId) {
          await supabase
            .from('merch_orders')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('printful_order_id', orderId)

          console.error('Printful order failed:', orderId, data.reason)
        }
        break
      }

      case 'order_canceled': {
        const orderId = String(data.order?.id)
        if (orderId) {
          await supabase
            .from('merch_orders')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('printful_order_id', orderId)
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Printful webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
