# Merch design studio

Admin route: `/admin/merch`. Public shop: `/shop/merch`. Fulfillment: Printful. Payments: Stripe.

The fitting room is for art that already exists (upload PNG or JPEG). It is not a clipart editor. Live preview is local. Printful is called when a design is put out, and again when a fan pays.

## Objects

| Object | Where it lives | Role |
| --- | --- | --- |
| Blank | `web/lib/merch/blanks.ts` | Garment family, print areas, print-file pixels, Printful catalog hint. |
| Design | `merch_designs` in Supabase, mirrored to `web/data/merch-designs.json` | Placements, colors, sizes, price, status. |
| Print file | Supabase `gallery-images` at `merch-designs/…`, or `web/data/merch-art/` | Baked PNG of one placement. Printful fetches the public URL. |
| Sync product | Printful store | One variant per size × color. The shop stores the **sync variant id** on `printful_variant_id`, because checkout submits that id as `sync_variant_id`. |
| Order | `merch_orders` | Stripe session, then `printful_order_id`. Printful `external_id` is the merch order UUID. |

Status: `draft` (in the fitting room) → `hidden` (Put it out) → `live` (Make public). Only `live` designs are added to `/api/merch/products`, alongside anything synced from Printful into `web/data/merch-products.json`.

## Fitting room

Three columns: Printful catalog, stage, art rail / design sidebar.

### Stage modes

| Mode | Purpose |
| --- | --- |
| **Design** | Printful-style flat mockup (positioning template when API key is set), placement tabs, upload zone, color/size/sell under mockup. Default on open. |
| **Preview** | 3D spin between front/back, mannequin or catalog photo, dock tools (Guide, Spin, Edit, mockups). |

- Families: tee, hoodie, hat, sweatpants, plus **catalog-driven** placements (front, back, left/right sleeve when Printful print files include them).
- Drag, scale, and rotate inside the print rectangle. The rectangle turns red when the upright art box leaves it. Art gets a **DPI ring** (blue ≥150, yellow ≥100, red below) on both Design and Preview when art is on the active placement.
- **Put it out** bakes each placement to a transparent PNG the size of the print file, uploads it, saves the design as hidden, and asks Printful to create the sync product and a mockup task. Blocks if any placement is outside the print area; confirms when any placement is under 100 DPI.
- **Make public** is a separate switch. Buy stays disabled until a sync variant id exists.
- Printful cannot fetch `localhost`. A design still saves. Fulfillment waits until `NEXT_PUBLIC_SITE_URL` is a public https origin and `PRINTFUL_API_KEY` plus `PRINTFUL_STORE_ID` are set. Mockup image URLs expire after about 72 hours; the mockup poll copies them into our storage.

Catalog hint ids (71, 146, 206, 403) are starting points. Publish confirms the product title against the live catalog and searches `/products` when the hint does not match.

### Printful catalog in admin

- Expand **Printful catalog** on the garment rail, search, and pick a blank. That sets `catalogProductId` on the design (saved with the draft).
- **Sync** calls `POST /api/admin/merch/catalog`, which pulls the full Printful catalog into `web/data/printful-catalog.json`. Opening the merch desk also warms the cache via `GET /api/admin/merch/catalog` when the file is empty or stale. CLI: `cd web && npm run merch:sync-printful-catalog`. Dev boot runs `scripts/ensure-printful-catalog.mjs` when the cache is cold.
- **API store (Manual orders / API)** is required for Put it out, mockups, and authenticated positioning templates. Setup: `web/docs/admin/PRINTFUL_API_SETUP.md` (admin banner anchor `#printful-api`).
- With `PRINTFUL_API_KEY`, product detail (`GET /api/admin/merch/catalog/[id]`) loads printfiles + templates → `mockupStage` and `templateUrl` on each print file for calibrated drop zones on the Design stage.
- Products without a studio mannequin yet still use the nearest family template for preview; publish uses the selected Printful product id.

### Stage dock (Mockwear-style)

Color, Add, Edit, **Spin** (3D Y-flip between front/back), Flip (instant side), Copy (front → back), Reset (fit art), Guide, Photo, Undo/Redo. Placement tabs unify Design and Preview when a catalog product is selected.

## Order link

`submitPrintfulOrder` sends `external_id` = `merch_orders.id` and `confirm: true`. The Stripe webhook writes the returned Printful order id back onto that row and sets `processing`. The Printful webhook updates by that id, and falls back to `external_id` when the row was not linked yet. A thrown submit marks the row `failed`. No API key leaves the row `pending`.

### Create tools (AI Art, Text, Background removal)

The design-stage sidebar nav (`MerchDesignMaker.tsx` `NAV`) exposes creative tools that produce a placeable, store-backed PNG via the existing art pipeline (`/api/admin/merch/art` → `storeMerchArt` → `refreshUploads` + `placeArt`):

- **AI Art** (`MerchAiArtPanel.tsx`): prompt → `POST /api/admin/merch/art/generate`. The route calls Crowe Creative (`lib/ai/crowe-creative-client.ts`, key `CROWE_API_KEY` or `CROWELOGIC_API_KEY`), prompts for an isolated subject on a clean background, downloads the result, stores it, and auto-places it. Degrades gracefully with an actionable hint when no key is set (503). Best-available provider with fallback is the intended shape; add more providers in the route's `extractImage`/provider chain.
- **Text** (`MerchTextDesigner.tsx`): fully client-side. Renders text (font/color/outline, multiline) to a transparent high-res PNG on a canvas, uploads it, and places it. No external provider needed.
- **Remove background** (`lib/merch/remove-background.ts`): dependency-free solid-background matte (edge flood-fill + feather). Available from the AI panel and both the stage-art and library context menus (`removeBackgroundArt` in `MerchFittingRoom.tsx`). For photographic subjects on busy backgrounds, a provider-based remover is a future add.

## Out of v1

Embroidery-specific tooling, **multi-layer compositing** (art + text stacked live on one placement — today each tool yields a single placeable asset), one-art-to-many-blanks in a single action, and a second fulfillment partner. The design record is provider-specific only at `blankId`, placement ids, and variant ids.
