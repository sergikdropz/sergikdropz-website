# SERGIKdropz — Label Operating Rules

**Label (imprint / DSP metadata):** SERGIKdropz  
**Legal entity:** NEXUS STUDIOS AZ LLC (Arizona)  
**Flagship artist / pilot:** SERGIK  
**Sites:** [sergikdropz.com](https://sergikdropz.com) · Release Studio (admin)  
**Contact:** sergikdrops@gmail.com  

Purpose: ship music on a repeatable pipeline under the **SERGIKdropz** label. SERGIK is the systems test before opening the roster to other artists.

---

## 1. Legal & branding

| Layer | Name |
| --- | --- |
| Contracting entity | NEXUS STUDIOS AZ LLC |
| Label / imprint (metadata `label_name`) | **SERGIKdropz** |
| Artist brands | SERGIK first; additional artists only after pilot is stable |

- Contracts, payouts, and distributor accounts sit under the LLC.
- Collaborator royalties are paid by the Studio ledger (`/studio/royalties`), not by DistroKid/Revelator.
- Store / DistroKid / Revelator **Label** field = `SERGIKdropz` (not the LLC name, not the artist name alone).
- Do not sign outside artists until **4–8 clean SERGIK releases** have run end-to-end.

---

## 2. Release cadence (pilot)

- Target: **1 EP or single every ~2 weeks**.
- Prefer strongest masters first; do not dump the vault.
- Placeholder dates (`2026-01-01`) are not allowed on active slate items.
- Presave opens ~**14 days** before street date when the product supports it.

Source of truth: `web/data/release-schedule.json` + Studio calendar / Command Center.

---

## 3. Pipeline checklist (every release)

1. Masters in vault (WAV) + final artwork (DSP-safe square)
2. Metadata: title, artists, featuring, genre, language, explicit, **label = SERGIKdropz**
3. ISRCs assigned; UPC when required by distributor
4. Credits + splits documented (writers / producers / featured)
5. Marketing copy + smart link
6. Queue to distributor (DistroKid until Revelator Partner API is live)
7. Verify store links after go-live
8. Promo pack: share link, story clip, email/Discord post

**Pilot success metric:** on-time release + clean metadata + working store links — not monthly listeners.

---

## 4. Distribution

| Phase | Pipe |
| --- | --- |
| Now | DistroKid (or current live path) — do not stall releases |
| Target | Revelator Partner API (`REVELATOR_*` env) after sandbox credentials |
| Studio mode | Keep dry-run until live keys; then `REVELATOR_DRY_RUN=0` |

Helpdesk / sales: ticket **97009** · Partner API + sandbox.

---

## 5. Roster expansion (later)

Open to other artists only when the SERGIK machine is boring and reliable.

Minimum for first outside artist:

- One-pager: what SERGIKdropz does / does not do
- Artist agreement + split template
- Intake: WAV, artwork, credits, ISRCs, target street date
- Same Release Studio pipeline — no special cases
- Cap: **1–2** outside artists at first

---

## 6. Roles (pilot)

| Role | Who |
| --- | --- |
| Label decisions / LLC | Jordan Caboga (Nexus Studios AZ LLC) |
| SERGIK artist / creative | SERGIK |
| Ops / Release Studio | Admin tools on sergikdropz.com |

---

*Last updated: 2026-09-22 — SERGIKdropz pilot phase.*
