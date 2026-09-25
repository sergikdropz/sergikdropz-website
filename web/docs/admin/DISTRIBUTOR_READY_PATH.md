# Distributor-ready path (SERGIKdropz)

How Release Studio grows from **partner delivery** → **label royalty ops** → **multi-label platform**, without pretending direct DSP deals are available today.

## Model

```text
DSPs
  → Partner (Revelator / DistroKid) — delivery + store collection
    → Nexus Studios AZ LLC bank — sole payee
      → Release Studio — splits, statements, payouts to collaborators / future label clients
```

- **Partner owns:** pipes to Spotify/Apple/etc.  
- **You own:** imprint (**SERGIKdropz**), contracts, collaborator royalties, product UX.  
- **Direct DSP / DDEX:** future phase when volume and ops justify it.

## Phases (in Launch → Distributor path)

| Phase | Meaning | Hard vs soft |
| --- | --- | --- |
| Partner delivery | Masters, ISRC, UPC, art, genre, imprint, ingest, rights ready | Hard gaps block “partner-ready” |
| Label royalty ops | Splits 100%, contracts, legal lock; LLC sole payee policy | Soft until you run payouts |
| Multi-label platform | Distinct imprint, monitoring; DDEX marked future | Soft / roadmap |

Code: `web/lib/studio/distributor-readiness.ts`  
UI: Release Studio → Launch → **Distributor path**

## Near-term actions

1. Book Golda / Revelator: partner API + sandbox; **LLC sole payee**; statement export/API.  
2. Keep DistroKid until keys land — Pipeline → DistroKid queues scheduled releases. Upload at https://distrokid.com/new/ from the Launch packet, then mark submitted. There is no DistroKid upload API.  
3. Every release: Metadata → Label = **SERGIKdropz**.  
4. Drive UTOPIA (and following EPs) to partner-ready green on Launch.  
5. Next build (after this checklist): statement ingest → payee ledger → payouts.
   **Done:** see `ROYALTY_OPS.md` and `/studio/royalties`.

## Not in scope yet

- DDEX ERN XML export  
- Multi-tenant `label_id` registry (still free-text `label_name`)  
- Direct Spotify/Apple vendor contracts  

See also: `LABEL_OPERATING_RULES.md`, `SERGIK_12_WEEK_CALENDAR.md`.
