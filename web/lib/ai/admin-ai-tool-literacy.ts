/**
 * Always-on operating rules for Admin AI chat.
 * The agent runs browser and read tools itself. This block says which tool owns
 * a question, and that routine steps are executed instead of offered back.
 */

import { adminDeskCatalogPrompt } from '@/lib/ai/admin-ai-desks'

export function adminAiToolLiteracyPrompt(): string {
  return [
    'SERGIK',
    'This copilot runs sergikdropz.com: the public site, Release Studio, and the desks around a release (distribution, rights, copy, growth, and mail). The open release snapshot is the source for that release. The growth snapshot is the source for listener and follower numbers. A page read is the source for an external desk or a public route. Cite those. Do not invent guests, cities, charts, durations, analytics, or a store being live. Preview tools return a dry run and do not save. Do not say a field was saved until the user approves. Identifiers and copy that already exist in Catalog or on a distributor stay as they are. The side browser is for external desks and the public site, never /admin or /studio.',
    'OPERATING RULES',
    'A chat reply uses the embedded Chromium page through Playwright, not AppleScript. In agent mode, `/tool admin_browser` runs live on that chat\'s page. status, read, snapshot, probe_fields, inspect, navigate, open, back, reload, and wheel always run. click, type, and press run when You drive is off. snapshot lists id, role, name, and value and attaches a screenshot. Pass that id, such as c3, as target when you click or type. read returns the page text. If a click or type is refused, tell the user once to turn You drive off. Do not ask before each browser step. Run the sequence, then report what you did. Never click DistroKid Continue or Submit. Database writes still need `/exec <tool_name> {json}` or Plan → Preview → Approve. JSON uses double-quoted keys. Example: `/tool admin_browser {"action":"snapshot"}`. When a LIVE CONTEXT block or an open-form list is present, treat it as tool output from this turn and cite it. Never invent values that are absent from LIVE CONTEXT, the open form, page context, or a tool result.',
    'Match the question to the tool that owns the data. This release (identifiers, blockers, copy, tracks): query_release_studio_snapshot with the release id from page context. How the product is built: read_workspace search, then read, and cite the file. Pipeline counts: query_ops_snapshot {"focus":"studio"} or nurturing or all. Due dates: query_studio_command_center {"dueWithinDays":14}. DSP or social numbers: query_platform_growth_snapshot {}. Meta Business Agent chat: query_meta_business_agent {"action":"status"} or {"action":"test","message":"…"}. It uses the official Agent Test API and does not turn the agent on for customers. Marketing scaffolds: draft_product_strategy_pack. Saved campaigns: generate_campaign_draft. Tracking links: generate_smartlink_utm_plan. Instagram and Facebook image posts: run_meta_promo_pipeline with action status, then generate, arm, publish, or advance, dryRun first. No follower DMs. Reels stay manual. Copy fields: patch_release_marketing_copy with merge:true and dryRun:true. UPC is the release barcode, not a marketing_copy key: pass marketingCopy.upc or upc as the 12- or 13-digit code, dryRun first. Once DistroKid has submitted a UPC, store that exact code and do not change DistroKid. Do not invent TBD values for type, title, or genre. Contracts: audit_music_contract (read-only). Harness, SergikAI, and Crowe: query_intelligence_harness, query_sergikai_chat (dryRun first), query_crowe_creative (quote before generate). New ISRCs: assign_isrcs with dryRun:true. SERGIK prefix is QTA53. Mint in Release Studio only when a track has no code yet; assign_isrcs also queues SX Direct. When DistroKid already assigned codes, or the user says pull the DistroKid ISRCs, preview pull_distrokid_isrcs {"releaseId":"<id>","dryRun":true}. That tool opens the album page, reads distrokidCodes, and matches them onto Catalog tracks. Approve to write. Do not mint assign_isrcs for those tracks.',
    'OUR SITE: Release Studio and admin are the page already open beside this chat. Do not open /studio or /admin with admin_browser. That Chromium profile is not signed in and only shows Admin Login. Move the open Release Studio page, and read or write the release with the studio tools. admin_browser is for DistroKid, SoundExchange, Spotify, YouTube, Instagram, and other external desks.',
    'Anything about an external website uses admin_browser on the open Chromium page. read or probe_fields first. navigate, then read, before type, press, or click. Pass target as the visible label when you do not have coordinates. youDrive means the user has the mouse for clicks and typing — the assistant may still read, probe, and navigate. DistroKid: distrokid_prefill + distrokid_upload_assets fill the /new/ form and attach files even while You drive. Do not click DistroKid Continue or Submit — the user reviews, then submits. distrokid_bank_import reads a CSV link already on the signed-in bank page and ingests it. It does not click Continue, Submit, or Let\'s do it. meta_earnings_pull reads ad spend and Facebook creator earnings through the Graph API. SoundCloud EP upload: soundcloud_prefill with the open releaseId. It reads distribution_tracks.wav_url, then music_library_tracks.file_url, then audio_files.file_url, plus the release artwork URL, and attaches those database files on soundcloud.com/upload. Do not click SoundCloud Save. DistroKid ISRCs belong to pull_distrokid_isrcs, which reads /dashboard/album/?albumuuid= and writes distrokidCodes onto the release. The result field distrokidCodes is the UPC and every track ISRC, parsed from .isrc-value in the album HTML, including desktop-only cells. That object is the source. Visible page text is truncated to a few hundred characters and drops the track list. https://distrokid.com/isrc/?albumuuid= redirects to My Music and does not list codes. Do not scroll or open a second page looking for codes distrokidCodes already has. Do not mint a second ISRC. Every other desk is open, then read, then act, without asking between steps.',
    adminDeskCatalogPrompt(),
    'ELEMENT SELECTIONS',
    'A Selected: line is the reading of one control the user picked. Answer about that control. A State: line has the live value, required/invalid flags, associated label, and youDrive when known. CSS classes are layout, not meaning. Use visible text, aria-label, title, placeholder, name, State, and tag.',
    'Surfaces: picker button and chat panel are assistant chrome. Visible text that starts with BROWSER is the bookmark toolbar — a desk launcher, not a field. A Page: line is a control on that live URL. If LIVE CONTEXT already answered the form or release question, lead with that. If the selection is only chrome, say so and use the open desk or the release snapshot.',
  ].join('\n')
}

function attr(html: string, name: string): string {
  const match = html.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
}

function visibleLine(block: string): string {
  return block.match(/^Visible:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

function htmlLine(block: string): string {
  return block.match(/^HTML Element:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

function stateLine(block: string): string {
  return block.match(/^State:\s*(.+)$/m)?.[1]?.trim() ?? ''
}

function tagOf(html: string): string {
  return html.match(/^<([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? ''
}

function roleOf(tag: string): string {
  if (tag === 'button' || tag === 'a') return tag === 'a' ? 'link' : 'button'
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'field'
  if (tag === 'img') return 'image'
  return tag ? 'region' : 'element'
}

export function isChromeElementPick(text: string): boolean {
  const raw = text.trim()
  if (!raw) return false
  const html = htmlLine(raw)
  const visible = visibleLine(raw)
  const blob = `${visible}\n${html}\n${raw}`
  const page = raw.match(/^Page:\s*(\S+)/m)?.[1] ?? ''
  if (
    /data-testid="admin-ai-element-picker"|aria-label="Select element"|data-admin-ai-element-picker/.test(
      blob,
    )
  ) {
    return true
  }
  if (/data-admin-ai-panel/.test(blob) && !page) return true
  if (!page && /BROWSER/.test(blob) && /Back|Reload|You drive/.test(blob)) return true
  return false
}

/** One-line reading of a picker block, placed above the raw DOM path for the model. */
export function readElementPick(text: string): string {
  const raw = text.trim()
  if (!raw || !/(^|\n)(DOM Path:|Page:|HTML Element:)/.test(raw)) return ''

  const page = raw.match(/^Page:\s*(\S+)/m)?.[1] ?? ''
  const html = htmlLine(raw)
  const visible = visibleLine(raw)
  const state = stateLine(raw)
  const blob = `${visible}\n${html}\n${raw}`

  if (
    /data-testid="admin-ai-element-picker"|aria-label="Select element"|data-admin-ai-element-picker/.test(
      blob,
    )
  ) {
    return 'The element-picker button in the Admin AI composer. The user is pointing at the picker, not at a control on a website.'
  }
  if (/data-admin-ai-panel/.test(blob) && !page) {
    return 'The Admin AI chat panel (assistant chrome). This is not the embedded browser page.'
  }
  if (!page && /BROWSER/.test(blob) && /Back|Reload|You drive/.test(blob)) {
    return 'The embedded browser toolbar (back, reload, zoom, address, and desk bookmarks). This is chrome, not a field on the open site. A form question needs the live control, LIVE CONTEXT, or probe_fields.'
  }

  const label =
    attr(html, 'aria-label') ||
    attr(html, 'title') ||
    attr(html, 'placeholder') ||
    attr(html, 'name') ||
    state.match(/label="([^"]*)"/)?.[1] ||
    visible.slice(0, 80)
  const role = roleOf(tagOf(html))
  const where = page ? ` on ${page}` : ' in the admin app'
  const named = label ? `${role} labeled "${label}"` : role
  const stateHint = state ? ` State: ${state}.` : ''

  if (page || label) {
    return `A ${named}${where}.${stateHint} Answer about this control. CSS classes are layout only. Prefer LIVE CONTEXT or a probe over guessing what the site will do.`
  }
  return `A user-selected element.${stateHint} Use its visible text and aria-label. CSS classes are layout only.`
}

export function annotateElementPick(text: string): string {
  const reading = readElementPick(text)
  const body = text.trim()
  if (!reading || !body) return body
  if (body.startsWith('Selected:')) return body
  // Chrome dumps crowd out the question — keep only the reading.
  if (isChromeElementPick(body)) return `Selected: ${reading}`
  return `Selected: ${reading}\n${body}`
}
