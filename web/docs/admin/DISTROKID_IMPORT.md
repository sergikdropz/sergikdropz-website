# DistroKid My Music → Release Studio

Import DistroKid catalog metadata (UPC, ISRCs, artwork, store links) into Release Studio without DistroKid credentials on the server.

## Flow

1. Log into [DistroKid My Music](https://distrokid.com/mymusic/).
2. Run the extractor below in the DistroKid browser console (same origin — uses your session cookies).
3. Paste the JSON into **Create → Import → DistroKid** (`/studio/create?tab=import`).
4. **Dry run**, then **Import releases**.

Releases are marked `previously_released` and reuse DistroKid UPC/ISRCs (no new QTA53 codes). Unique Music Vault title matches attach provisional `wav_url`; otherwise attach masters later via track upload / replace WAV.

For the full migrate & keep streams checklist (Store URL + dual-live → takedown), see [MIGRATE_KEEP_STREAMS.md](./MIGRATE_KEEP_STREAMS.md).

## Music Library playlist: Distrokid Exports

Bulk-load DistroKid Vault WAVs into the curated playlist (same outcome as drag-drop on SongsTable):

```bash
cd web && npx tsx scripts/ingest-distrokid-exports-playlist.ts
# optional:
#   --dir="/Volumes/SERGIK/Distrokid downloads"
#   --playlist=playlist-1789691284218
```

Prefers `ISRC-Title.wav` masters, skips bare duplicates, matches existing vault rows by ISRC, and appends `track_ids` on **Distrokid Exports**.

Apply DistroKid cover art + proper titles to those playlist rows:

```bash
cd web && npx tsx scripts/apply-distrokid-exports-artwork.ts
```

Remove per-release **DistroKid — …** sidebar EPs/singles (keep tracks on Distrokid Exports):

```bash
cd web && npx tsx scripts/archive-distrokid-sidebar-folders.ts
```

API: `POST /api/studio/releases/from-distrokid` with `{ catalog, dryRun?, fillEmptyOnly?, matchVault? }`.

## Extractor (browser console on distrokid.com)

Open DevTools → Console on `https://distrokid.com/mymusic/`, paste the script, press Enter. When finished, the catalog is copied to the clipboard and also logged.

```javascript
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const abs = (u) => {
    if (!u) return null;
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/")) return location.origin + u;
    return u;
  };
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const parseDate = (raw) => {
    const v = clean(raw);
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toISOString().slice(0, 10);
  };
  const infoVal = (doc, labelRe) => {
    const re = new RegExp(
      labelRe.source +
        '[\\s\\S]*?<span[^>]*class="[^"]*info-value[^"]*"[^>]*>([\\s\\S]*?)<\\/span>',
      "i"
    );
    const m = doc.body.innerHTML.match(re);
    return m ? clean(m[1].replace(/<[^>]+>/g, " ")) : null;
  };
  const storeFromUrl = (url) => {
    if (/open\.spotify\.com\/(album|track)\//i.test(url)) return "spotify";
    if (/music\.apple\.com\//i.test(url)) return "apple_music";
    if (/deezer\.com\/album/i.test(url)) return "deezer";
    if (/music\.youtube\.com\//i.test(url)) return "youtube_music";
    if (/tidal\.com\//i.test(url)) return "tidal";
    if (/iheart\.com\//i.test(url)) return "iheart";
    if (/amazon\./i.test(url) && /(music|albums|gp\/product|dp\/)/i.test(url))
      return "amazon";
    if (/audiomack\.com\//i.test(url)) return "audiomack";
    if (/qobuz\.com\//i.test(url)) return "qobuz";
    if (/anghami\.com\//i.test(url)) return "anghami";
    if (/boomplay\.com\//i.test(url)) return "boomplay";
    return null;
  };
  const submittedFromIcons = (doc) => {
    const map = {
      spotify: "spotify",
      applemusic: "apple_music",
      itunes: "apple_music",
      facebook: "instagram",
      tiktok: "tiktok",
      google: "youtube_music",
      amazon: "amazon",
      rdio: "pandora",
      deezer: "deezer",
      tidal: "tidal",
      iheart: "iheart",
      imusica: "claro_musica",
      saavn: "saavn",
      boomplay: "boomplay",
      anghami: "anghami",
      netease: "netease",
      tencent: "tencent",
      qobuz: "qobuz",
      joox: "joox",
      kuackmedia: "kuack_media",
      feedfm: "adaptr",
      flo: "flo",
      beats: "medianet",
    };
    const out = new Set();
    for (const img of doc.querySelectorAll("[data-testid^='album-store-']")) {
      const key = (img.getAttribute("data-testid") || "")
        .replace(/^album-store-/i, "")
        .toLowerCase();
      if (map[key]) out.add(map[key]);
    }
    return [...out];
  };

  const listLinks = [...document.querySelectorAll('a[href*="albumuuid="]')];
  const byUuid = new Map();
  for (const a of listLinks) {
    const u = new URL(a.href, location.origin);
    const id = (u.searchParams.get("albumuuid") || "").toUpperCase();
    if (!id) continue;
    if (!byUuid.has(id)) byUuid.set(id, u.pathname + u.search);
  }
  const albumPaths = [...byUuid.entries()];
  console.log("Found", albumPaths.length, "albums — fetching…");

  const releases = [];
  for (const [albumuuid, path] of albumPaths) {
    const res = await fetch(path, { credentials: "include" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = clean(
      doc.querySelector(".album-title span")?.textContent ||
        doc.querySelector(".album-title")?.textContent
    );
    const artist = clean(
      doc.querySelector(".band-name span")?.textContent ||
        doc.querySelector(".band-name")?.textContent
    );
    const label = infoVal(doc, /Record\s*Label/);
    const release_date = parseDate(infoVal(doc, /Release\s*date/));
    const upload_date = parseDate(infoVal(doc, /Upload\s*date/));
    const upc =
      clean(
        infoVal(doc, /DistroKid\s*UPC/) ||
          doc.querySelector("#js-album-upc")?.textContent ||
          ""
      ).replace(/\D/g, "") || null;
    const artwork_url = abs(
      doc.querySelector("img.album-image")?.getAttribute("src")
    );
    const tracks = [...doc.querySelectorAll(".track-row.trackRow")].map(
      (row, i) => {
        const num =
          parseInt(clean(row.querySelector(".track-num")?.textContent), 10) ||
          i + 1;
        const t = clean(
          row.querySelector(".track-name span")?.getAttribute("title") ||
            row.querySelector(".track-name")?.textContent
        );
        const isrc =
          clean(row.querySelector(".isrc-value")?.textContent)
            .replace(/-/g, "")
            .toUpperCase() || null;
        return { track_number: num, title: t, isrc };
      }
    );
    const byStore = new Map();
    for (const a of doc.querySelectorAll("a[href]")) {
      let href = abs(a.getAttribute("href"));
      if (!href) continue;
      if (href.startsWith("http://")) href = "https://" + href.slice(7);
      const store = storeFromUrl(href);
      if (!store) continue;
      if (
        store === "apple_music" &&
        byStore.has("apple_music") &&
        /app=itunes/i.test(href)
      )
        continue;
      if (
        !byStore.has(store) ||
        (store === "apple_music" && /app=music/i.test(href))
      )
        byStore.set(store, href);
    }
    if (
      byStore.has("spotify") ||
      byStore.has("apple_music") ||
      byStore.has("deezer")
    ) {
      byStore.delete("youtube");
    }
    const store_links = [...byStore.entries()].map(([store, url]) => ({
      store,
      url,
    }));
    const submitted_stores = submittedFromIcons(doc);
    if (!submitted_stores.length) {
      for (const l of store_links) submitted_stores.push(l.store);
    }
    releases.push({
      albumuuid,
      title: title || albumuuid,
      artist,
      label,
      release_date,
      upload_date,
      upc,
      artwork_url,
      tracks,
      store_links,
      submitted_stores: [...new Set(submitted_stores)],
      type_hint:
        tracks.length <= 1 ? "single" : tracks.length <= 6 ? "ep" : "album",
    });
    console.log("✓", title, upc, tracks.length + " tracks");
    await sleep(400);
  }

  const catalog = {
    version: 2,
    source: "distrokid",
    extracted_at: new Date().toISOString(),
    releases,
  };
  const json = JSON.stringify(catalog, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    console.log("Copied", releases.length, "releases to clipboard");
  } catch (e) {
    console.warn("Clipboard failed — copy from console log instead", e);
  }
  console.log(catalog);
  return catalog;
})();
```

## CLI backfill

After extracting to `web/data/distrokid-catalog-export.json`:

```bash
cd web
npx tsx scripts/import-distrokid-catalog.ts --dry-run
npx tsx scripts/import-distrokid-catalog.ts
# Persist FTP links + Connect stores fan-out (admin cookies):
npm run smoke:studio-dsp-connect
```

Optional DistroKid **more stores** opt-ins (Beatport, Audiomack, Snapchat, MassiveMusic, Roblox) are registered in Release Studio as paste/submitted targets — enable them on the DistroKid album page first, then re-extract.

## Notes

- Idempotent: re-import matches by UPC or stamped `marketing_copy._distrokid.albumuuid`.
- Do not dual-enroll the same master in DistroKid Social Media Pack and SERGIK UGC pack.
- After import, use **Delivery → DSP connect** to refresh store links if DistroKid pages were incomplete.
