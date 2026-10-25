# Royalty ops (statement → payee ledger → payouts)

Makes **label royalty ops** real: partner pays **Nexus Studios AZ LLC**; Release Studio allocates Rights split sheets and records collaborator payouts.

## Money flow

```text
DSPs → DistroKid / Revelator → LLC bank (sole payee)
                              → Studio /royalties
                                   → payee ledger (split %)
                                   → mark paid (Venmo / wire / etc.)
```

Stripe merch/EP splits at `/admin/splits` are a **different** product surface. Do not mix them.

## Where

| Surface | Path |
| --- | --- |
| Hub UI | `/studio/royalties` |
| Launch gate | Release → Launch → Distributor path (soft items) |
| APIs | `GET/POST /api/studio/royalties`, `POST .../statements`, `POST .../payouts` |
| Domain | `web/lib/studio/royalties/` |
| Local store | `web/data/royalties/store.json` |
| Supabase (optional prod) | `web/supabase/migrations/add_royalty_ops.sql` |

## Operator loop

1. Rights → finish split sheets (100%) + contracts.  
2. Export partner earnings CSV (DistroKid or Revelator).  
3. **Royalties → Ingest** — allocates by ISRC → `distribution_tracks.splits`. Unknown ISRC → 100% LLC retain.  
4. **Overview / Ledger** — collab owed vs LLC retain.  
5. **Payouts** — select one payee’s owed rows → mark paid. LLC retain cannot be paid out.

## Meta actuals

Ingest also accepts Meta creator-earnings CSVs and Meta ad-spend exports.

- Recording royalties allocate through the split sheet.
- Creator payouts stay with the LLC. They are not collaborator royalties.
- Ad spend is a cost. It creates no ledger rows and is not income.
- Amounts are stored as reported. A statement that is already net of DistroKid’s 20% is not reduced again.
- Overview ROAS is N/A until attributed site sales are supplied. Catalog royalties are not that numerator.

Rights → “Where this release can earn” records enrollment evidence. It does not enroll DistroKid Social Media Pack. **Copy Meta Rights Manager from the UGC pack** fills that one program from evidence already on the release. DistroKid audio-library delivery and Meta creator eligibility stay `unknown` until you check those dashboards.

## API pull

| Source | How it gets in |
| --- | --- |
| DistroKid bank | No earnings API. Admin AI Chromium action `distrokid_bank_import` reads a CSV link on the signed-in bank page, or the details table and its Next pages, and ingests it. It does not click Continue, Submit, or Let's do it. A manual CSV remains the fallback. |
| Meta desk | Bookmark Meta opens Business Suite. `meta_earnings_pull` uses the Graph API for ad spend and Facebook creator earnings. It uses `META_AD_ACCOUNT_ID` when set, otherwise the only ad account, otherwise the account named SERGIK. |
| Meta ad spend | Ads Insights, last 30 days, when `META_AD_ACCOUNT_ID` is set and the token has `ads_read`. |
| Facebook creator earnings | Page insight `content_monetization_earnings`, daily, last 28 days, when the token has `read_insights`. Approximate. Amounts arrive as micro-units. |
| Instagram creator earnings | Requires `instagram_manage_insights`. Meta's professional-account insights do not include an earnings metric, so the pull finishes without writing rows. Facebook Page content monetization stays separate. |

Reconnect for those two scopes at `/api/studio/meta/connect?earnings=1&next=/studio/royalties`. The normal publish connect does not ask for them. A later pull replaces the previous snapshot for that source instead of importing the same days again.

## Golda / Revelator talking points

- Sole payee = LLC (not individual collabs).  
- Studio already has statement ingest + ledger + payout recording.  
- Ask for statement export/API shape so ingest mapping stays tight.

See also: `DISTRIBUTOR_READY_PATH.md`, `LABEL_OPERATING_RULES.md`.
