import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { parseSupabaseUserIdFromStripeMeta } from '@/lib/stripe/user-metadata'
import { calculateSplitsForProduct, calculateSplitsForBundle } from '@/lib/revenue-splits'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServerClient()

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const productType = session.metadata?.productType || 'track'

    try {
      const customerEmail = session.customer_email || session.customer_details?.email || null
      const customerName = session.customer_details?.name || null
      const linkedUserId = parseSupabaseUserIdFromStripeMeta(session.metadata)
      const purchaseUser = linkedUserId ? { user_id: linkedUserId } : {}

      // --- License purchase ---
      if (productType === 'license') {
        const termsSnapshot = session.metadata?.termsSnapshot
          ? JSON.parse(session.metadata.termsSnapshot)
          : {}

        // Insert license record
        const { error: licenseError } = await supabase.from('licenses').insert({
          track_id: session.metadata?.trackId,
          license_tier: session.metadata?.licenseTier,
          customer_email: customerEmail,
          customer_name: customerName,
          stripe_session_id: session.id,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          terms_snapshot: termsSnapshot,
          stream_limit: termsSnapshot.streamLimit || null,
          status: 'active',
        })

        if (licenseError) {
          console.error('Error saving license:', licenseError)
        }

        // Also save to purchases
        await supabase.from('purchases').insert({
          stripe_session_id: session.id,
          track_id: session.metadata?.trackId,
          track_title: session.metadata?.trackId,
          format: 'LICENSE',
          file_url: '',
          customer_email: customerEmail,
          customer_name: customerName,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          purchased_at: new Date(session.created * 1000).toISOString(),
          license_tier: session.metadata?.licenseTier,
          product_type: 'license',
          ...purchaseUser,
        })

        console.log('License purchase saved:', session.id)
      }

      // --- Tip purchase ---
      else if (productType === 'tip') {
        await supabase.from('purchases').insert({
          stripe_session_id: session.id,
          track_id: 'tip',
          track_title: session.metadata?.tipMessage || 'Tip',
          format: 'N/A',
          file_url: '',
          customer_email: customerEmail,
          customer_name: customerName,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          purchased_at: new Date(session.created * 1000).toISOString(),
          product_type: 'tip',
          ...purchaseUser,
        })

        // Add tipper to email subscribers
        if (customerEmail) {
          await supabase.from('email_subscribers').upsert(
            {
              email: customerEmail,
              name: customerName,
              source: 'tip',
              is_active: true,
            },
            { onConflict: 'email' }
          )
        }

        console.log('Tip saved:', session.id)
      }

      // --- Bundle purchase ---
      else if (productType === 'bundle') {
        const bundleItemIds = session.metadata?.bundleItemIds
          ? JSON.parse(session.metadata.bundleItemIds)
          : []

        await supabase.from('purchases').insert({
          stripe_session_id: session.id,
          track_id: session.metadata?.bundleId || 'bundle',
          track_title: session.metadata?.bundleName || 'Bundle',
          format: 'BUNDLE',
          file_url: '',
          customer_email: customerEmail,
          customer_name: customerName,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          purchased_at: new Date(session.created * 1000).toISOString(),
          product_type: 'bundle',
          ...purchaseUser,
        })

        // Create individual purchase records for each bundled item
        for (const itemId of bundleItemIds) {
          await supabase.from('purchases').insert({
            stripe_session_id: session.id,
            track_id: itemId,
            track_title: itemId,
            format: 'BUNDLE',
            file_url: '',
            customer_email: customerEmail,
            customer_name: customerName,
            amount_paid: 0,
            currency: session.currency || 'usd',
            purchased_at: new Date(session.created * 1000).toISOString(),
            product_type: 'bundle-item',
            ...purchaseUser,
          })
        }

        // Record revenue splits for all EPs in the bundle
        if (bundleItemIds.length > 0 && session.amount_total) {
          const bundleSplits = calculateSplitsForBundle(bundleItemIds, session.amount_total)
          for (const split of bundleSplits) {
            await supabase.from('revenue_splits').insert({
              purchase_id: null,
              stripe_session_id: session.id,
              product_id: split.product_id,
              product_type: 'bundle',
              collaborator_id: split.collaborator_id,
              collaborator_name: split.collaborator_name,
              track_title: split.track_title,
              total_sale_amount: session.amount_total,
              collaborator_amount: split.collaborator_amount,
              split_percent: split.split_percent,
              currency: session.currency || 'usd',
              status: 'owed',
            })
          }
          if (bundleSplits.length > 0) {
            console.log(`Recorded ${bundleSplits.length} bundle revenue split(s)`)
          }
        }

        console.log('Bundle purchase saved:', session.id)
      }

      // --- Subscription (membership) ---
      else if (productType === 'subscription') {
        const subscriptionId = session.subscription as string

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)

          await supabase.from('memberships').insert({
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: session.customer as string,
            customer_email: customerEmail || '',
            plan_id: session.metadata?.planId || '',
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            ...purchaseUser,
          })
        }

        console.log('Subscription created:', session.id)
      }

      // --- Merch purchase ---
      else if (productType === 'merch') {
        const items = session.metadata?.items ? JSON.parse(session.metadata.items) : []
        const shippingAddress = session.shipping_details?.address || null

        // Create merch order
        const { data: merchOrder, error: merchError } = await supabase
          .from('merch_orders')
          .insert({
            stripe_session_id: session.id,
            customer_email: customerEmail,
            shipping_address: shippingAddress,
            items,
            subtotal: session.amount_subtotal || 0,
            shipping_cost: session.total_details?.amount_shipping || 0,
            tax: session.total_details?.amount_tax || 0,
            total: session.amount_total || 0,
            status: 'pending',
            ...purchaseUser,
          })
          .select()
          .single()

        if (merchError) {
          console.error('Error saving merch order:', merchError)
        } else {
          // Submit order to Printful
          try {
            const { submitPrintfulOrder } = await import('@/lib/printful')
            await submitPrintfulOrder({
              orderId: merchOrder.id,
              items,
              shippingAddress,
              customerEmail: customerEmail || '',
            })
          } catch (printfulError) {
            console.error('Error submitting to Printful:', printfulError)
          }
        }

        // Also save to purchases
        await supabase.from('purchases').insert({
          stripe_session_id: session.id,
          track_id: 'merch',
          track_title: `Merch Order (${items.length} items)`,
          format: 'N/A',
          file_url: '',
          customer_email: customerEmail,
          customer_name: customerName,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          purchased_at: new Date(session.created * 1000).toISOString(),
          product_type: 'merch',
          ...purchaseUser,
        })

        console.log('Merch order saved:', session.id)
      }

      // --- EP Bundle purchase ---
      else if (productType === 'ep-bundle') {
        const { data: purchaseRecord } = await supabase.from('purchases').insert({
          stripe_session_id: session.id,
          track_id: session.metadata?.productId || session.metadata?.trackId,
          track_title: session.metadata?.productId || 'EP Bundle',
          format: 'BUNDLE',
          file_url: '',
          customer_email: customerEmail,
          customer_name: customerName,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          purchased_at: new Date(session.created * 1000).toISOString(),
          product_type: 'ep-bundle',
          ...purchaseUser,
        }).select('id').single()

        // Record revenue splits for collaborator tracks
        const epProductId = session.metadata?.productId
        if (epProductId && session.amount_total) {
          const splits = calculateSplitsForProduct(epProductId, session.amount_total)
          for (const split of splits) {
            await supabase.from('revenue_splits').insert({
              purchase_id: purchaseRecord?.id || null,
              stripe_session_id: session.id,
              product_id: epProductId,
              product_type: 'ep-bundle',
              collaborator_id: split.collaborator_id,
              collaborator_name: split.collaborator_name,
              track_title: split.track_title,
              total_sale_amount: session.amount_total,
              collaborator_amount: split.collaborator_amount,
              split_percent: split.split_percent,
              currency: session.currency || 'usd',
              status: 'owed',
            })
          }
          if (splits.length > 0) {
            console.log(`Recorded ${splits.length} revenue split(s) for ${epProductId}`)
          }
        }

        console.log('EP bundle purchase saved:', session.id)
      }

      // --- Standard track purchase (original flow) ---
      else {
        let fileUrl = session.metadata?.fileUrl
        let trackTitle = session.metadata?.trackTitle || session.metadata?.trackId

        if (session.metadata?.trackId && !fileUrl) {
          const { data: audioFile } = await supabase
            .from('audio_files')
            .select('file_url, title')
            .eq('id', session.metadata.trackId)
            .single()

          if (audioFile) {
            fileUrl = audioFile.file_url
            trackTitle = audioFile.title || trackTitle
          }
        }

        const { error: dbError } = await supabase.from('purchases').insert({
          stripe_session_id: session.id,
          track_id: session.metadata?.trackId,
          track_title: trackTitle,
          format: session.metadata?.format || 'WAV',
          file_url: fileUrl || session.metadata?.fileUrl || '',
          customer_email: customerEmail,
          customer_name: customerName,
          amount_paid: session.amount_total || 0,
          currency: session.currency || 'usd',
          purchased_at: new Date(session.created * 1000).toISOString(),
          product_type: 'track',
          ...purchaseUser,
        })

        if (dbError) {
          console.error('Error saving purchase to database:', dbError)
        } else {
          console.log('Purchase saved to database:', session.id)
        }
      }
    } catch (error: any) {
      console.error('Error processing checkout:', error.message)
    }
  }

  // Handle subscription updates
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription

    try {
      await supabase
        .from('memberships')
        .update({
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)

      console.log('Subscription updated:', subscription.id)
    } catch (error: any) {
      console.error('Error updating subscription:', error.message)
    }
  }

  // Handle subscription cancellation
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription

    try {
      await supabase
        .from('memberships')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subscription.id)

      console.log('Subscription canceled:', subscription.id)
    } catch (error: any) {
      console.error('Error canceling subscription:', error.message)
    }
  }

  // Handle successful invoice payment (subscription renewal)
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice

    if (invoice.subscription) {
      try {
        await supabase
          .from('memberships')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', invoice.subscription as string)

        console.log('Subscription renewed:', invoice.subscription)
      } catch (error: any) {
        console.error('Error updating renewal:', error.message)
      }
    }
  }

  // Handle failed invoice payment
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice

    if (invoice.subscription) {
      try {
        await supabase
          .from('memberships')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', invoice.subscription as string)

        console.log('Subscription payment failed:', invoice.subscription)
      } catch (error: any) {
        console.error('Error updating failed payment:', error.message)
      }
    }
  }

  return NextResponse.json({ received: true })
}
