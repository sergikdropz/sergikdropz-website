# Printful API — build knowledge & alignment

Deep audit of <https://developers.printful.com/docs/> (API v1, `https://api.printful.com`)
mapped to how SERGIK (SERGWEAR merch) actually uses it. Use this as the authoritative
reference for merch work and future development. Pair with the operational setup guide
`web/docs/admin/PRINTFUL_API_SETUP.md` and the studio behaviour in
`knowledge/merch/DESIGN_STUDIO.md`.

> Source of truth for shapes is the live store, not the docs — the docs and the
> live v1 responses differ in a few places (notably Layout Templates, see below).
> Our parsers are written to accept both shapes.

---

## 1. Fundamentals

- **Base URL:** `https://api.printful.com/`. Response envelope is always
  `{ "code": <http status>, "result": ... , "paging"?: {...}, "error"?: {reason,message} }`.
- **Timestamps** are UNIX integers.
- **Variant ID ≠ Product ID.** Always order/sync against the **catalog variant id**
  (e.g. `4012`), never the product id (`71`). Mixing them silently produces the wrong item.
- **Localisation:** `X-PF-Language` header (`en_US`, `es_ES`, `de_DE`, `ja_JP`, …) localises
  `title`/`type_name`.
- **Jewelry is not supported via API** anywhere.

### Wrapper in our code
`web/lib/printful.ts`:
- `printfulCatalogFetch(endpoint)` — **no auth** (public catalog reads). Sends `X-PF-Store-Id` if set.
- `printfulFetch(endpoint)` — **requires** `PRINTFUL_API_KEY`; sends `Authorization: Bearer` + `X-PF-Store-Id`.
- Both throw on non-2xx with the status + body.

---

## 2. Rate limits (critical — we are a new store)

Per store (or per IP for unauthenticated), rolling 60s window:

| Scope | Limit |
| --- | --- |
| General API | **120 / min** |
| Unauthenticated catalog reads | **30 / min** (60s lockout on exceed) |
| **Mockup Generator `create-task`** | **2 / min for NEW stores**, 10 / min established |
| Sync product/variant writes (Products + Ecommerce Sync) | **10 / min** |
| Shipping rates | 120 / min (drops to **5 / min** if an item qty > 100) |
| Mockup files generated | **20,000 / account / 24h** |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
A `429` returns `Retry-After` (seconds) and body `code:429, reason:"TooManyRequests"`.

**Alignment / TODO:** our wrapper does **not** yet read these headers or honour
`Retry-After`. Because our store is new, `create-task` is capped at **2/min** — this is
exactly why batch mockup/verify runs hit `429`. When we batch mockups or sync many
variants, add: a dedicated queue, exponential backoff + jitter, and pacing from
`X-RateLimit-Remaining`. Idempotency (order `external_id`) makes retries safe.

---

## 3. Authorization & tokens

- **Private token** (what we use) vs **Public App** (OAuth, 3rd-party installs).
- **Client type:** **Store** (bound to one store) vs **Account** (all stores, needs
  `X-PF-Store-Id` per request). Our token is **Store-level, single store** →
  `sergikdropz.com` / id **18959040**.
- Private tokens **expire** (we set **2028-10-20**), **cannot be refreshed**, and the
  value is shown **once**. Rotate before expiry; update `PRINTFUL_API_KEY` in
  `web/.env.local` and redeploy.
- **Scopes** (ours in **bold**):

  | Scope | Client | Notes |
  | --- | --- | --- |
  | **`orders`** / `orders/read` | Store & Account | create/confirm/cancel orders |
  | **`sync_products`** / `sync_products/read` | Store & Account | create/modify store products |
  | **`file_library`** / `file_library/read` | Store & Account | add/read print files |
  | **`webhooks`** / `webhooks/read` | Store & Account | manage webhook config |
  | `product_templates` / `…/read` | **Account only** | ⚠ unavailable to our Store token |

  There is **no explicit "mockup" scope** — the Mockup Generator works with any valid
  token (mockup access is implicit).

**Alignment note:** the Product Templates API (`/product-templates`, and ordering via
`product_template_id`) needs an **Account-level** token. Our Store token cannot use it;
if we ever want Printful-saved templates, provision an account token.

---

## 4. Catalog API (public reads)

| Endpoint | Purpose |
| --- | --- |
| `GET /products?category_id=24,42` | list catalog products (comma-separated categories) |
| `GET /products/{id}` | product + **variants** (+ `files[]`, `options[]`, `techniques[]`) |
| `GET /products/variant/{id}` | one variant + its product |
| `GET /products/{id}/sizes?unit=inches,cm` | size guides |
| `GET /categories`, `GET /categories/{id}` | category tree |

- Product `files[]` enumerate **print placements** and their `additional_price` (back,
  sleeves, labels, embroidery spots). `options[]` enumerate configurable options
  (e.g. `embroidery_type`, `full_color` unlimited color).
- `variant.availability_status[]` / `availability_regions` drive stock; `price` is the
  wholesale base (no subscription discounts reflected via API).
- **Size guide** tables: `measure_yourself`, `product_measure`, `international`.

### Our usage
- `syncPrintfulCatalogFromApi()` → `GET /products` → `web/data/printful-catalog.json`
  (`npm run merch:sync-printful-catalog`). Public, 30/min.
- `fetchCatalogProductDetail(id)` → `GET /products/{id}` + both mockup-generator reads
  (see §8), producing `CatalogProductDetail` (colors, sizes, variants, techniques,
  printFiles with calibrated `templateUrl`/`mockupStage`, specs).
- **Not yet surfaced:** size guides (`/products/{id}/sizes`) — a good future add for PDP
  "size & fit".

---

## 5. Products API — Sync Products (our publish target)

Store type must be **Manual orders / API** (ours is `native`). A **Sync Product** has up
to **100 Sync Variants**; each Sync Variant links a **catalog `variant_id`** + **print
file(s)** + `retail_price` (+ optional `external_id`, `sku`).

| Endpoint | |
| --- | --- |
| `GET /store/products?status=&category_id=` | list (paged) |
| `POST /store/products` | create `{ sync_product, sync_variants[] }` |
| `GET/DELETE/PUT /store/products/{id}` | read / delete / modify (id or `@external_id`) |
| `GET/DELETE/PUT /store/variants/{id}` | one sync variant |
| `POST /store/products/{id}/variants` | add a sync variant |

- **Files**: `{ id }` (existing library file) or `{ url }` (reused if URL identical),
  `type` = placement (`default` may be omitted). Reusing a URL **reuses old content** —
  append a cache-buster (`?t=modified`) when art changes.
- `PUT` is a full replace of the variants you list: **omitted existing variants are
  deleted**; new ones (no `id`) are created. Always resend all variant ids you want kept.
- Rate limit: **10/min** writes.

### Our usage
`web/lib/merch/publish.ts#publishDesignToPrintful` → `POST /store/products` with
`sync_product:{name,thumbnail}` and `sync_variants[]` (each `variant_id`, `retail_price`,
`files[]` with per-placement `position`). Print areas now come from the real catalog
product (see §8/§9). Guards: needs `PRINTFUL_API_KEY` + **public https** art URL (Printful
fetches art from our site), so localhost stays in drafts.

---

## 6. Orders API (fulfillment)

**Lifecycle:** `draft → pending → inreview → inprocess → (onhold | partial) → fulfilled`;
plus `failed`, `canceled`, `archived`. You are only charged once **confirmed**.

| Endpoint | |
| --- | --- |
| `POST /orders?confirm=true&update_existing=true` | create (+ optionally skip draft) |
| `GET /orders` / `GET /orders/{id}` | list / read (`@external_id` supported) |
| `PUT /orders/{id}?confirm=` | update unsubmitted order |
| `POST /orders/{id}/confirm` | confirm a draft (charges card) |
| `DELETE /orders/{id}` | cancel pending/draft (refunds) |
| `POST /orders/estimate-costs` | costs without creating an order |

- **Specify a product 3 ways:** (A) existing `sync_variant_id`/`external_variant_id`,
  (B) catalog `variant_id` on-the-fly + files, (C) `product_template_id` + `variant_id`.
- **`external_id`** (≤32 chars) = idempotency key; unique per store. Use our order id.
- **Async cost calc:** complex items (e.g. advanced embroidery) can push an auto-confirmed
  order back to `draft` on hold; subscribe to `order_remove_hold` to know when ready.
- **File position** (orders): `area_width/height` (print area) + `width/height/top/left`
  (image within area, `(0,0)` = top-left) + `limit_to_print_area` (default **true** →
  `400 "Invalid position"` if the image crosses the border; set `false` to allow bleed).
- `retail_costs` + per-item `retail_price` control the packing slip; `gift`, `packing_slip`
  override store branding.

### Our usage
Stripe webhook (`web/app/api/stripe/webhook/route.ts`) → `submitPrintfulOrder()` →
`createOrder()` = `POST /orders` with `confirm:true`, `external_id = merchOrder.id`,
items by `sync_variant_id`. Tracking lands via the Printful webhook (§7).
- **Not yet used:** `estimate-costs` (live shipping/tax preview at checkout), draft→confirm
  review flow. Candidates if we want accurate at-cart totals.

---

## 7. Webhooks

Config: `GET/POST/DELETE /webhooks`. `POST` body `{ url, types[], params? }` (e.g.
`params.stock_updated.product_ids`). Printful POSTs `{ type, created, retries, store, data }`;
**respond `2xx`** or it retries after **1, 4, 16, 64, 256, 1024 minutes**.

**Events:** `package_shipped`, `package_returned`, `order_created`, `order_updated`,
`order_failed`, `order_canceled`, `order_refunded`, `order_put_hold`,
`order_put_hold_approval`, `order_remove_hold`, `product_synced`, `product_updated`,
`product_deleted`, `stock_updated`.

### Our usage
`web/app/api/printful/webhook/route.ts` handles `package_shipped` (→ status `shipped`
+ tracking), `order_created` (→ `processing`), `order_failed`, `order_canceled`, writing
to `merch_orders` via `printfulOrderMatch`.

**Alignment gaps / TODO:**
- ⚠ **Printful v1 webhooks are not HMAC-signed.** Our `x-printful-signature ==
  PRINTFUL_WEBHOOK_SECRET` check is a homegrown convention Printful does **not** send —
  so if `PRINTFUL_WEBHOOK_SECRET` is set, every real webhook is rejected `401`. Secure the
  endpoint by a hard-to-guess URL path/query token instead, or re-verify by fetching the
  order. Revisit before enabling the secret in prod.
- The webhook must be **registered** (`POST /webhooks` with our URL + `types[]`), not just
  implemented. Add this to setup.
- Consider handling `package_returned`, `order_refunded`, `order_put_hold`/`remove_hold`,
  `product_updated`, `stock_updated`.

---

## 8. Mockup Generator API (drop zones + product photos)

The engine behind the Design desk. Three reads + one async task:

| Endpoint | Returns |
| --- | --- |
| `GET /mockup-generator/printfiles/{id}?technique=&orientation=` | print-file sizes per placement |
| `GET /mockup-generator/templates/{id}?technique=&orientation=` | layout templates (drop zones) |
| `POST /mockup-generator/create-task/{id}` | creates async task → `task_key` |
| `GET /mockup-generator/task?task_key=` | poll result → `mockups[].mockup_url` |

**Printfiles response:**
```json
{ "product_id":71,
  "available_placements": { "front":"Front print", "back":"Back print", "label_outside":"Outside label" },
  "printfiles": [ { "printfile_id":1, "width":1800, "height":2400, "dpi":150, "fill_mode":"fit", "can_rotate":false } ],
  "variant_printfiles": [ { "variant_id":4012, "placements": { "front":1, "back":1 } } ],
  "option_groups": [...], "options": [...] }
```
- `fill_mode` `fit`|`cover`; `can_rotate` (wall art — flip `width`/`height` for vertical vs
  horizontal). `variant_printfiles` maps **variant → placement → printfile_id**.

**Layout templates — SHAPE DIFFERS from live store:**
- **Docs** return an **object**: `{ version, min_dpi, variant_mapping:[{variant_id,
  templates:[{placement, template_id}]}], templates:[{template_id, image_url, printfile_id,
  template_width, template_height, print_area_width/height/top/left, is_template_on_front,
  orientation}], conflicting_placements:[...] }`. Here the geometry objects carry **no
  `placement`** — placement comes from `variant_mapping`.
- **Our live store** returns the **object form** above for tee 71 (verified Oct 2026 via
  `npm run merch:printful-templates`); older notes recorded a flat array. Both are parsed.
- ✅ `web/lib/merch/product-specs.ts#parseTemplatesPayload` accepts **both** (array, or
  `result.templates`), so `web/lib/merch/printful-setup.ts` and the design pipeline are
  robust. Keep both paths.
- Drop zone math (`stageRectFromTemplate`): `x=left/tw, y=top/th, w=pw/tw, h=ph/th` —
  normalised 0–1 against `template_width/height`.

**Create-task body:**
```json
{ "variant_ids":[4012,4013], "format":"jpg|png", "width":1000,
  "files":[ { "placement":"front", "image_url":"https://…",
    "position": { "area_width":1800, "area_height":2400, "width":1800, "height":1800, "top":300, "left":0 } } ],
  "option_groups":["Flat"], "options":["Front"], "product_options":{ "lifelike":true } }
```
- `width`: **50–2000**, default 1000. Downscale print files to ≤2000px for mockups
  (50MB file limit). `format`: `png` (transparent) or `jpg` (smaller).
- `options`/`option_groups`/`product_options` **limit which styles generate** — omit and
  only the first style is made. Generating all is slow and wastes the 20k/24h budget.
- **Lifecycle:** poll `task` no sooner than **10s**; `status`: `pending`→`completed`.
  `mockup_url`s are **temporary (≈24–72h)** — **download and store them**.

### Our usage
- `fetchCatalogProductDetail` calls printfiles + templates (auth, with public fallback).
- `fetchPlacementPrintAreas(id)` + `resolvePlacementPrintArea()` (in
  `printful-catalog.ts`) derive the **real per-placement print area** from printfiles.
- Preview task: `web/app/api/admin/merch/catalog/[id]/mockup/route.ts` (uses real area dims).
- Publish task + poll/store: `publish.ts` + `web/app/api/admin/merch/designs/[id]/mockups/route.ts`
  (downloads mockups → `storeMerchArt`, so we beat the URL expiry).
- **Technique scoping (important):** both `/mockup-generator/printfiles/{id}` and
  `/templates/{id}` accept `?technique=DTG|DTFILM|EMBROIDERY|…` and only return that
  technique's placements. The unscoped call returns the default technique only, so a tee's
  embroidery/DTF placements are missing unless each technique is fetched.
  `fetchPlacementGeometry()` (in `printful-catalog.ts`) fetches every technique the product
  lists and merges by printfile/template id; `fetchCatalogProductDetail` and
  `fetchPlacementPrintAreas` (publish + preview mockups) both go through it.
- Placement → template is resolved via `variant_mapping` (`templateForPlacement`), never by
  shared `printfile_id` (front/back and left/right sleeves share printfiles).
- Each `CatalogPrintFile` carries `templateId`, `templateUrl`, `mockupStage` (0–1 drop zone),
  `templateAspect` (template image w/h) and `printWidth/printHeight/dpi` (from the printfile,
  i.e. the real print-file pixels). Files Printful exposes no geometry for under any
  technique get `mockupSupported: false` and are hidden when a calibrated sibling exists
  (e.g. legacy `embroidery_front` on the dad hat — only `embroidery_front_large` has geometry).
- Designs persist `fileType` per placement, so sleeves/labels round-trip through
  `POST /api/admin/merch/designs` → `restoreCatalogFileLayers` → `buildPrintFiles` without
  collapsing into `front`.
- Verifier: `npm run merch:printful-templates [ids…]` (`web/scripts/verify-printful-templates.ts`)
  runs the real `fetchCatalogProductDetail` path and `auditPlacementTemplates`, failing when any
  placement lacks a template/drop zone/printfile or when opposite placements share a template.

---

## 9. Positioning & print files — the model we standardise on

- Area = the product's print region in **print-file pixels** (from `/printfiles`), e.g.
  tee front `1800×2400@150dpi`, dad-hat embroidery `1650×600@300dpi`, 11oz mug
  `2700×1050`, poster up to `4962×3507`.
- Image box (`width/height/top/left`) is placed inside the area; `(0,0)` top-left.
- We send **full-area fill** (`width=area_width, height=area_height, top=0, left=0`) using
  the **real** per-product area — never a hardcoded tee size. This is why mockups now work
  for every family (tee/hoodie/hat/mug/poster), not just the Shaka tee.
- For orders, keep `limit_to_print_area:true` unless intentional bleed.

---

## 10. Placements & techniques (canonical)

**Print placements** (product `files[].type`): `front`, `front_large`, `back`,
`sleeve_left`, `sleeve_right`, `label_outside`, `label_inside`, `default` (all-over /
posters / mugs). Embroidery: `embroidery_chest_left`, `embroidery_chest_center`,
`embroidery_sleeve_left_top`, `embroidery_sleeve_right_top`, `embroidery_front`,
`embroidery_back`, `embroidery_left/right`, plus hat `embroidery_front_large` etc.
`mockup`/`preview` are **non-print** (we filter these out).

**Techniques** (`technique=` on printfiles/templates): `DTG`, `EMBROIDERY`, `SUBLIMATION`,
`CUT-SEW`, `DIGITAL`, `UV`, `ENGRAVING`. Products can expose several (e.g. Bella 3001 =
DTG default + EMBROIDERY) — pass the right `technique` to get that technique's placements.

---

## 11. Options & embroidery

- **Unlimited color:** file option `{ id:"full_color", value:true }` (`additional_price`).
- **Embroidery:** product option `embroidery_type` = `flat` | `3d` | `both`; thread colors
  via options `thread_colors`, `thread_colors_3d`, `thread_colors_<placement>`,
  `text_thread_colors[_<placement>]` (hex arrays). `POST /files/thread-colors { file_url }`
  suggests nearest thread colors.
- **Native inside label:** file `type:"label_inside"` + option `{ id:"template_type",
  value:"native" }` (mandatory legal content auto-generated; needs tear-away label garment).
- **Sticker border:** order item option `{ id:"custom_border_color", value:"#FF0000" }`.
- Fully-custom inside labels are **deprecated** (pre-April-2020 users only).

---

## 12. File Library, Shipping, Country/State, Tax

- **File Library:** `POST /files { url, type?, options?, filename?, visible? }` (async:
  `waiting → ok|failed`; dims/dpi fill in after processing; identical URL returns the
  existing file). Usually unnecessary — passing `url` on sync/order auto-adds. ⚠ `GET /files`
  list is **removed** (`410 Gone`). `.ai/.psd/.tiff` are **deprecated** — validate uploads.
- **Shipping:** `POST /shipping/rates { recipient, items[], currency?, locale? }` —
  `country_code` always required; `state_code` required for **US/AU/CA**. Returns rate ids
  (`STANDARD`, …) with delivery dates. Call **only right before checkout** (dynamic).
  `/orders/estimate-costs` applies store shipping markup; `/shipping/rates` only if store
  shipping settings are enabled. We have `estimateShipping()` but checkout isn't wired to it.
- **Country/State:** `GET /countries` (ISO 3166-1 alpha-2; states for US/CA/JP/AU).
- **Tax:** `POST /tax/rates` is **deprecated/sunset** (removed ~Sep 2025). For totals use
  order create/estimate; for standalone rates use an external tax provider.

---

## 13. Current wiring map (where each call lives)

| Capability | Code |
| --- | --- |
| Auth'd / public fetch | `web/lib/printful.ts` |
| Catalog sync → JSON | `printful-catalog.ts#syncPrintfulCatalogFromApi` |
| Product detail (+printfiles+templates) | `printful-catalog.ts#fetchCatalogProductDetail` |
| Real print areas | `printful-catalog.ts#fetchPlacementPrintAreas` / `resolvePlacementPrintArea` |
| Printfile/template parsing, drop zones | `product-specs.ts` (`parsePrintfilesPayload`, `parseTemplatesPayload`, `buildFileGuidelines`, `stageRectFromTemplate`) |
| Publish (sync product + mockup task) | `lib/merch/publish.ts` |
| Preview mockup task | `app/api/admin/merch/catalog/[id]/mockup/route.ts` |
| Mockup poll + store | `app/api/admin/merch/designs/[id]/mockups/route.ts` |
| Connection diagnostics | `lib/merch/printful-setup.ts`, `app/api/admin/merch/printful-status/route.ts` |
| Order fulfillment | `lib/printful.ts#submitPrintfulOrder` ← Stripe webhook |
| Status/tracking webhook | `app/api/printful/webhook/route.ts` |
| Env check | `npm run merch:printful-check` |
| Template coverage check | `npm run merch:printful-templates` |

---

## 14. Roadmap / alignment backlog

Done (shipped):

- ✅ **Rate-limit aware client** — `lib/printful.ts` now routes every call through a
  shared `printfulRequest` that reads `X-RateLimit-*`, honours `Retry-After`, and backs
  off with jitter (`lib/printful-rate-limit.ts`, unit-tested). Covers catalog reads,
  `create-task`, and sync writes.
- ✅ **Webhook fixed + registerable** — removed the bogus `x-printful-signature` check
  (Printful doesn't sign v1); now authenticates with a secret URL token
  (`?token=…` == `PRINTFUL_WEBHOOK_SECRET`). Added `getPrintfulWebhook` /
  `registerPrintfulWebhook` / `disablePrintfulWebhook` + admin route
  `/api/admin/merch/webhook` (GET status, POST register, DELETE). Handler now covers
  `package_returned`, `order_updated`, `order_refunded`, and the hold events.
- ✅ **Live shipping endpoint** — `POST /api/merch/shipping-estimate` (additive) returns
  `/shipping/rates` for a basket; validates `state_code` for US/CA/AU.
- ✅ **Mockup style controls** — create-task route accepts `width` (50–2000),
  `lifelike`, and `option_groups`/`options` to bound the 20k/24h budget.

Remaining:

4. **Wire shipping estimate into the storefront cart/checkout UI** (endpoint exists).
5. **Size & fit** on PDPs via `/products/{id}/sizes`.
6. **Upload validation** — reject `.ai/.psd/.tiff`; cache-bust file URLs on art change.
7. **Account-level token** only if we want the Product Templates API.
8. **Studio multi-layer compositing** (art + text flattened per placement at bake time)
   and **one-art-to-many-blanks**.
