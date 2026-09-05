#!/usr/bin/env osascript -l JavaScript
/**
 * SERGIKDROPZ Platform Tour — JavaScript for Automation (JXA)
 *
 * Drives Chrome through every major surface, logs in as admin,
 * and demonstrates the full fan + artist + admin experience.
 *
 * Usage (via shell wrapper):
 *   ADMIN_EMAIL=you@email.com ADMIN_PASS=yourpass BASE_URL=http://127.0.0.1:3001 \
 *     bash scripts/demo-record.sh
 *
 * Direct (no recording):
 *   ADMIN_EMAIL=you@email.com ADMIN_PASS=yourpass BASE_URL=http://127.0.0.1:3001 \
 *     osascript -l JavaScript scripts/demo-tour.js
 */

ObjC.import('stdlib')

const BASE_URL    = $.getenv('BASE_URL')    || 'http://127.0.0.1:3001'
const ADMIN_EMAIL = $.getenv('ADMIN_EMAIL') || ''
const ADMIN_PASS  = $.getenv('ADMIN_PASS')  || ''

// ── Utilities ─────────────────────────────────────────────────────────────

function wait(sec) {
  const app = Application.currentApplication()
  app.includeStandardAdditions = true
  delay(sec)
}

function chrome() { return Application('Google Chrome') }
function tab()    { return chrome().windows[0].activeTab }

function go(path, pauseSec) {
  tab().url = BASE_URL + path
  wait(pauseSec || 3.5)
}

function js(code) {
  tab().execute({ javascript: code })
}

function scrollDown(px) {
  js(`window.scrollBy({ top: ${px || 500}, behavior: 'smooth' })`)
  wait(1.8)
  js(`window.scrollTo({ top: 0, behavior: 'smooth' })`)
  wait(1)
}

function banner(text, durationSec) {
  js(`
    (function() {
      const old = document.getElementById('__demo__')
      if (old) old.remove()
      const el = document.createElement('div')
      el.id = '__demo__'
      Object.assign(el.style, {
        position:'fixed', top:'18px', left:'50%', transform:'translateX(-50%)',
        zIndex:'2147483647', background:'linear-gradient(135deg,#7c3aed,#db2777)',
        color:'#fff', font:'700 13px/1 -apple-system,sans-serif',
        padding:'11px 26px', borderRadius:'999px',
        boxShadow:'0 6px 28px rgba(0,0,0,.6)', pointerEvents:'none',
        letterSpacing:'.03em', whiteSpace:'nowrap',
        animation:'none', opacity:'1'
      })
      el.textContent = ${JSON.stringify(text)}
      document.body.appendChild(el)
      setTimeout(() => { if (el.parentNode) el.remove() }, ${Math.round((durationSec || 4) * 1000)})
    })()
  `)
  wait(0.4)
}

function fill(selector, value) {
  js(`
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set
      nativeInputValueSetter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })()
  `)
  wait(0.5)
}

function click(selector) {
  js(`
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el) el.click()
  `)
  wait(1.5)
}

function typeSelect(selector, value) {
  js(`
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el) { el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})) }
  `)
  wait(1)
}

// ── Admin login ───────────────────────────────────────────────────────────

function adminLogin() {
  if (!ADMIN_EMAIL || !ADMIN_PASS) {
    banner('ℹ️  No admin credentials — skipping login', 3)
    wait(3)
    return false
  }
  banner('🔐  Logging in as admin…', 4)
  go('/admin/login', 3)
  fill('input[type="email"], input[name="email"]', ADMIN_EMAIL)
  fill('input[type="password"], input[name="password"]', ADMIN_PASS)
  click('button[type="submit"], form button')
  wait(4) // wait for redirect
  const currentUrl = tab().url()
  if (currentUrl.includes('/admin/login')) {
    banner('⚠️  Login may have failed — continuing as guest', 4)
    wait(3)
    return false
  }
  banner('✅  Logged in as admin', 3)
  wait(2)
  return true
}

// ── Tour ──────────────────────────────────────────────────────────────────

chrome().activate()
wait(1)

// ════════════════════════════════════════════════════════
// SECTION 1 — PUBLIC FAN EXPERIENCE
// ════════════════════════════════════════════════════════

banner('🎵  SERGIKDROPZ.COM  —  Full Platform Demo', 5)
go('/', 4)
scrollDown(700)

// Homepage
banner('🏠  Homepage — Groove-forward music from the underground', 5)
go('/', 5)
scrollDown(800)

// Music catalog
banner('🎵  Music Catalog', 5)
go('/music', 5)
scrollDown(600)

// Sonic DNA Search
banner('🔬  Sonic DNA Search — Find tracks by mood, BPM, key, energy', 6)
go('/music/search', 4)
fill('input[type="search"]', 'dark')
wait(1.5)
typeSelect('select', 'Dark')
wait(2)
scrollDown(400)
// Reset
fill('input[type="search"]', '')
typeSelect('select', '')
wait(1)
banner('🎯  Filter by BPM range — 125–135 BPM', 4)
fill('input[placeholder="e.g. 120"]', '125')
fill('input[placeholder="e.g. 140"]', '135')
wait(2.5)
scrollDown(400)

// Track detail
banner('🎧  Track Detail — Waveform, metadata, purchase', 5)
go('/music', 3)
js(`
  const links = [...document.querySelectorAll('a[href*="/music/"]')]
  if (links[0]) links[0].click()
`)
wait(4)
scrollDown(500)

// Gallery
banner('📸  Photo Gallery', 5)
go('/gallery', 4)
scrollDown(600)

// Videos
banner('🎬  Video Content', 5)
go('/videos', 4)
scrollDown(400)

// Performances
banner('🎤  Live Performances & Events', 5)
go('/performances', 4)
scrollDown(400)

// EPK
banner('📋  Electronic Press Kit (EPK)', 5)
go('/epk', 4)
scrollDown(500)

// ════════════════════════════════════════════════════════
// SECTION 2 — COMMERCE & MONETIZATION
// ════════════════════════════════════════════════════════

banner('💳  COMMERCE — Direct Fan Monetization', 5)
wait(1.5)

// Shop
banner('🛒  Shop — Buy tracks, bundles, and exclusives', 5)
go('/shop', 5)
scrollDown(600)

// Merch
banner('👕  Merchandise — Print-on-demand via Printful', 5)
go('/shop/merch', 5)
scrollDown(500)

// Tip
banner('💜  Support SERGIK — Tip the artist directly', 5)
go('/shop/tip', 4)
scrollDown(300)

// Membership
banner('⭐  Fan Membership — Exclusive access, all tiers', 5)
go('/shop/membership', 5)
scrollDown(600)

// Music Library / Vault
banner('🔒  Music Library — Member-exclusive track vault', 6)
go('/music-library', 5)
scrollDown(500)

// ════════════════════════════════════════════════════════
// SECTION 3 — FAN ACCOUNT
// ════════════════════════════════════════════════════════

banner('👤  Fan Account — Register, magic link, or password', 5)
go('/fan', 4)
scrollDown(300)

banner('📧  Follow — Email capture & newsletter signup', 5)
go('/follow', 4)
scrollDown(300)

banner('📝  Fan Registration', 4)
go('/fan/register', 4)
scrollDown(300)

// ════════════════════════════════════════════════════════
// SECTION 4 — ADMIN DASHBOARD (requires login)
// ════════════════════════════════════════════════════════

banner('⚙️  ADMIN DASHBOARD — Artist & Business Operations', 6)
wait(1.5)

const loggedIn = adminLogin()

if (loggedIn) {
  // Dashboard
  banner('📊  Admin Dashboard — Platform overview', 5)
  go('/admin', 5)
  scrollDown(600)

  // Analytics
  banner('📈  Analytics — Page views, plays, revenue, engagement', 6)
  go('/admin/analytics', 5)
  scrollDown(700)

  // Fan Journey (NEW)
  banner('🔭  Fan Journey Funnel (NEW) — Visitors → Members conversion', 6)
  go('/admin/tools/fan-journey', 5)
  scrollDown(400)

  // Subscribers / CRM
  banner('👥  Subscribers — Email list management', 5)
  go('/admin/subscribers', 5)
  scrollDown(400)

  // Nurturing / CRM
  banner('📨  Fan Nurturing CRM — Campaigns, segments, smart links', 6)
  go('/admin/nurturing', 5)
  scrollDown(400)

  // Campaign builder
  banner('✉️  Campaign Builder — Email sequences & templates', 5)
  go('/admin/nurturing/campaigns', 5)
  scrollDown(400)

  // Smart links
  banner('🔗  Smart Links — UTM tracking & attribution', 5)
  go('/admin/nurturing/smart-links', 5)
  scrollDown(400)

  // Music Library (admin)
  banner('🎵  Music Library Admin — Full track management', 5)
  go('/admin/music-library', 5)
  scrollDown(600)

  // Sonic DNA (admin)
  banner('🧬  Sonic DNA — AI analysis of every track (BPM, key, mood, energy)', 6)
  go('/admin/sonic-dna', 6)
  scrollDown(500)

  // Releases
  banner('🚀  Release Pipeline — Create, schedule, distribute', 5)
  go('/admin/releases', 5)
  scrollDown(400)

  // Purchases
  banner('💰  Purchase History — Revenue + download tracking', 5)
  go('/admin/purchases', 5)
  scrollDown(400)

  // Memberships
  banner('⭐  Memberships — Active member management', 5)
  go('/admin/memberships', 5)
  scrollDown(400)

  // Instagram
  banner('📱  Instagram Feed — Auto-fetch via Graph API', 5)
  go('/admin/instagram', 5)
  scrollDown(400)

  // Gallery admin
  banner('🖼️  Gallery Management — Upload & organize photos', 5)
  go('/admin/gallery', 5)
  scrollDown(400)

  // Settings
  banner('⚙️  Settings — Site-wide configuration', 5)
  go('/admin/settings', 5)
  scrollDown(400)

  // AI Assistant
  banner('🤖  AI Admin Assistant — Propose, approve, execute', 6)
  go('/admin/ai-assistant/window', 6)
  scrollDown(400)

  // ════════════════════════════════════════════════════════
  // SECTION 5 — STUDIO
  // ════════════════════════════════════════════════════════

  banner('🎼  STUDIO — Release Production Tools', 6)
  wait(1.5)

  banner('🗓️  Release Calendar — Schedule & timeline view', 5)
  go('/studio/releases/calendar', 5)
  scrollDown(400)

  banner('🎯  Release Command Center — Pipeline at a glance', 5)
  go('/studio/releases/command-center', 5)
  scrollDown(400)

  banner('📋  New Release — Full release creation workflow', 5)
  go('/studio/releases/new', 5)
  scrollDown(500)

  banner('🔢  SoundExchange — Royalty submissions & ISRC', 5)
  go('/studio/soundexchange', 5)
  scrollDown(400)
}

// ════════════════════════════════════════════════════════
// CLOSING
// ════════════════════════════════════════════════════════

banner('🏁  Tour Complete — sergikdropz.com', 6)
go('/', 5)
scrollDown(400)

banner('🎵  SERGIK — Underground Electronic Music, Direct to Fans', 7)
wait(5)
