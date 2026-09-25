# SERGIK vault EP release calendar

Source of truth: `web/data/release-schedule.json`  
Cadence: ~every 2 weeks · Label: **SERGIKdropz** · Entity: Nexus Studios AZ LLC · Artist: **SERGIK**

## Scheduled vault EPs

| Street | Presave | Title | Tracks | Status |
| --- | --- | --- | --- | --- |
| 2026-09-24 | — | Are We Awake? | 5 | released / live |
| 2026-10-08 | 2026-09-24 | Staying A Vibe | 5 | released / live |
| 2026-10-30 | 2026-10-16 | UTOPIA | 5 | pending — **next pipeline** |
| 2026-11-13 | 2026-10-30 | In The Streets | 5 | pending |
| 2026-11-27 | 2026-11-13 | The World Dont Stop | 5 | pending |
| 2026-12-11 | 2026-11-27 | Daze | 6 | pending |
| 2027-01-08 | 2026-12-25 | Inspire | 5 | pending |
| 2027-01-22 | 2027-01-08 | Vice & Virtues | 5 | pending (newly scheduled) |
| 2027-02-05 | 2027-01-22 | The Chan Suk Legend | 6 | pending (newly scheduled) |

## Vault folders (local)

`web/public/audio/unreleased/eps/` + `web/public/images/audio/unreleased/eps/`

Already live on DistroKid / not on this pilot slate as new drops: FTP, Soul Candy.

## Sync street dates into Release Studio DB

Calendar JSON is updated. To push street dates into `distribution_releases` (preferred for pipeline):

1. Open Studio → calendar / releases
2. For **Vice & Virtues** and **The Chan Suk Legend**: **Import from vault**  
   - `collection-unreleased-eps-sergik---vice---virtues-`  
   - `collection-unreleased-eps-sergik---the-chan-suk-legend-`
3. Set each release’s `release_date` to match the table above  
   Or: `PUT /api/studio/releases/{id}` with `{ "release_date": "…" }`

Presave stays on the JSON slate only.

## Ops focus this week

1. Verify **Are We Awake?** store links  
2. Run **UTOPIA** end-to-end in Release Studio (target 2026-10-30)  
3. Import + date **Vice & Virtues** / **Chan Suk** in Studio DB
