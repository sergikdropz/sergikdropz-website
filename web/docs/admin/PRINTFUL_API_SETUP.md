# Printful API setup (SERGIK merch desk)

Use this when Printful shows **“Create a manual order store or connect using API”** — that flow is the right one for this site (custom Next.js storefront, not Shopify/Etsy).

## 1. Create an API store in Printful

1. Log in at [Printful Dashboard](https://www.printful.com/dashboard).
2. **Stores** → **Add** → choose **Manual orders / API** (wording may be “Connect via API” or “Manual order platform”).
3. Name the store (e.g. `SERGIK Web`).
4. Finish the wizard — you do **not** need a separate ecommerce platform.

## 2. Generate an API token

1. **Settings** → **API** (or [Dashboard → Settings → API](https://www.printful.com/dashboard/settings)).
2. Create a **Private token** with scopes that include catalog read and store/orders (default developer token is fine for dev).
3. Copy the token — it is shown once.

## 3. Store ID

1. In **Stores**, open your API/manual store.
2. The **Store ID** appears in the URL or store settings (numeric).
3. Alternatively: `GET https://api.printful.com/stores` with `Authorization: Bearer <token>` and read `id` from the store you created.

## 4. Configure the web app

In `web/.env.local`:

```bash
PRINTFUL_API_KEY=your_private_token
PRINTFUL_STORE_ID=your_store_id
NEXT_PUBLIC_SITE_URL=https://your-public-domain.com
```

- **Templates & calibrated drop zones** on the design stage require `PRINTFUL_API_KEY` when loading a catalog product (admin calls `/api/admin/merch/catalog/[id]`).
- **Put it out**, mockups, and fulfillment require **both** key and store ID.
- Printful must reach your art URLs — use a public `https` origin (not `localhost`) for production publish.

Restart the dev server after editing env: `cd web && npm run dev:recover`.

Validate from the terminal (lists stores for your token):

```bash
cd web && npm run merch:printful-check
```

Confirm positioning templates + print areas resolve for every product family
(tee, hoodie, hat, mug, poster) — not just the tee. A green run means the Design
Maker and mockups get calibrated drop zones systemically:

```bash
cd web && npm run merch:printful-templates
# optional: pass specific catalog product ids
cd web && npm run merch:printful-templates -- 71 146 206 19 1
```

## 5. Verify in admin

1. Open `/admin/merch` → **Design** desk → **Finish Printful API setup** panel (`#printful-api`).
2. Click **Re-check connection** after env changes. Green “Printful is connected” when `canPublish: true` (valid token **and** store id that exists on that token).
3. **Printful catalog** → **Sync** (uses API for full catalog when key is set).
4. Select a blank (e.g. Shaka Wear tee) — product detail should load; with API key, print files include `mockupStage` from positioning templates.
5. **Put it out** on a test design when `NEXT_PUBLIC_SITE_URL` is public.

## 6. Optional webhook

For order status updates, register the webhook with Printful (`POST /webhooks` with your public `/api/printful/webhook` URL and the event `types` you want) — implementing the route is not enough, it must be registered.

> ⚠ **Printful v1 webhooks are not HMAC-signed.** Setting `PRINTFUL_WEBHOOK_SECRET` makes the handler reject every real webhook with `401`, because Printful does not send an `x-printful-signature` header. Leave it unset, or secure the endpoint with a hard-to-guess URL token instead. See `knowledge/merch/PRINTFUL_API.md` §7.

## Deeper reference

For the full API audit mapped to our code — rate limits, scopes, mockup generator shapes, positioning model, order lifecycle, webhooks, and the roadmap/gaps — see **`knowledge/merch/PRINTFUL_API.md`**.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Drop zone still generic / high on chest | Re-select catalog product after adding API key; templates load on detail fetch only. |
| Put it out saves but no Printful product | Missing store ID or invalid token. |
| Mockup task fails | Art URL must be public HTTPS; check publish note on the design. |
| Catalog sync fails | Check token; run `cd web && npm run merch:sync-printful-catalog`. |
