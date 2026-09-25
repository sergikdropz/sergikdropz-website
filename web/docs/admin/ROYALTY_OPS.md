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

## Golda / Revelator talking points

- Sole payee = LLC (not individual collabs).  
- Studio already has statement ingest + ledger + payout recording.  
- Ask for statement export/API shape so ingest mapping stays tight.

See also: `DISTRIBUTOR_READY_PATH.md`, `LABEL_OPERATING_RULES.md`.
