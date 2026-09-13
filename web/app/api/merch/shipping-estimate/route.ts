import { NextResponse } from 'next/server'
import { estimateShipping } from '@/lib/printful'

export async function POST(request: Request) {
  try {
    const { address, items } = await request.json()

    if (!address || !items?.length) {
      return NextResponse.json({ error: 'Address and items required' }, { status: 400 })
    }

    const rates = await estimateShipping({
      recipient: {
        address1: address.line1,
        city: address.city,
        state_code: address.state,
        country_code: address.country || 'US',
        zip: address.postalCode,
      },
      items: items.map((item: any) => ({
        variant_id: item.printful_variant_id,
        quantity: item.quantity,
      })),
    })

    return NextResponse.json({ rates })
  } catch (error: any) {
    console.error('Shipping estimate error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to estimate shipping' },
      { status: 500 }
    )
  }
}
