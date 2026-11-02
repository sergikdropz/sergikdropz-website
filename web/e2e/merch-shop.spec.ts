import { test, expect } from '@playwright/test'

const CART_KEY = 'sergik-merch-cart'

const seededLine = {
  id: 'iza-vibe-tie-die-front:4012',
  productSlug: 'iza-vibe-tie-die-front',
  productName: 'Iza Vibe Tie Die Front',
  variantName: 'Sherbet rainbow / L',
  printful_variant_id: 4012,
  price: 40,
  quantity: 2,
  image: '',
}

test.describe('merch shop (guest)', () => {
  test.describe.configure({ timeout: 90_000 })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('analytics_consent', 'granted')
    })
  })

  test('merch catalog API returns products', async ({ request }) => {
    const res = await request.get('/api/merch/products')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { products?: unknown[] }
    expect(Array.isArray(body.products)).toBe(true)
    expect((body.products || []).length).toBeGreaterThan(0)
  })

  test('merch shop and empty cart load', async ({ page }) => {
    await page.goto('/shop/merch', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Merch Shop/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: 'Cart' }).first()).toBeVisible()

    await page.goto('/shop/cart', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /^Cart$/i })).toBeVisible()
    await expect(page.getByText(/Your cart is empty/i)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: /Open merch shop/i })).toBeVisible()
  })

  test('product page exposes add to cart and buy now', async ({ page, request }) => {
    const res = await request.get('/api/merch/products')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { products?: Array<{ slug?: string }> }
    const slug = body.products?.find((product) => product.slug)?.slug
    expect(slug).toBeTruthy()

    await page.goto(`/shop/merch/${slug}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('button', { name: /Buy now/i })).toBeVisible()
  })

  test('seeded cart can change quantity and send guests to fan login', async ({ page }) => {
    await page.addInitScript(
      ({ key, line }) => {
        window.localStorage.setItem(key, JSON.stringify([line]))
      },
      { key: CART_KEY, line: seededLine },
    )
    await page.goto('/shop/cart', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /^Cart$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Iza Vibe Tie Die Front/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('link', { name: /Cart, 2 items/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Checkout · \$80\.00/i })).toBeVisible()

    await page.getByRole('button', { name: /Increase quantity of Iza Vibe Tie Die Front/i }).click()
    await expect(page.getByRole('link', { name: /Cart, 3 items/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Checkout · \$120\.00/i })).toBeVisible()

    await page.getByRole('button', { name: 'Checkout · $120.00' }).click()
    await expect(page.getByRole('heading', { name: /Fan sign in/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Create account/i })).toHaveAttribute(
      'href',
      /next=%2Fshop%2Fcart/,
    )
  })

  test('create-merch-checkout rejects anonymous callers', async ({ request }) => {
    const res = await request.post('/api/stripe/create-merch-checkout', {
      data: { items: [{ printful_variant_id: 4012, quantity: 1 }] },
    })
    expect(res.status()).toBe(401)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe('AUTH_REQUIRED')
  })

  test('success page clears a merch cart', async ({ page }) => {
    await page.addInitScript(
      ({ key, line }) => {
        window.localStorage.setItem(key, JSON.stringify([line]))
      },
      { key: CART_KEY, line: seededLine },
    )
    await page.goto('/shop/success?type=merch', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Thank You/i })).toBeVisible()
    await expect(page.getByText(/Order confirmed/i)).toBeVisible()
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate((key) => window.localStorage.getItem(key), CART_KEY)
          return raw === null || raw === '' || raw === '[]'
        },
        { timeout: 10_000 },
      )
      .toBe(true)
  })
})
