/**
 * Always-on operating rules for Admin AI chat.
 * Chat replies cannot execute tools; this block tells the model which tool owns
 * a question and how to read any element the user selected.
 */

import { adminDeskCatalogPrompt } from '@/lib/ai/admin-ai-desks'

export function adminAiToolLiteracyPrompt(): string {
  return [
    'OPERATING RULES',
    'A chat reply cannot click, type, publish, or write by itself. Writes and browser actions still need `/exec <tool_name> {json}` or Plan → Preview → Approve. JSON uses double-quoted keys. Example: `/exec query_release_studio_snapshot {"releaseId":"<id>"}`. When a LIVE CONTEXT block is present, treat it as read-only tool output from this turn and cite it. Never invent values that are absent from LIVE CONTEXT, page context, or an `/exec` result.',
    'Match the question to the tool that owns the data. This release (identifiers, blockers, copy, tracks): query_release_studio_snapshot with the release id from page context. Pipeline counts: query_ops_snapshot {"focus":"studio"} or nurturing or all. Due dates: query_studio_command_center {"dueWithinDays":14}. DSP or social numbers: query_platform_growth_snapshot {}. Marketing scaffolds: draft_product_strategy_pack. Saved campaigns: generate_campaign_draft. Tracking links: generate_smartlink_utm_plan. Instagram and Facebook image posts: run_meta_promo_pipeline with action status, then generate, arm, publish, or advance, dryRun first. No follower DMs. Reels stay manual. Copy fields: patch_release_marketing_copy with merge:true and dryRun:true. Contracts: audit_music_contract (read-only). Harness, SergikAI, and Crowe: query_intelligence_harness, query_sergikai_chat (dryRun first), query_crowe_creative (quote before generate). New ISRCs: assign_isrcs with dryRun:true. SERGIK prefix is QTA53. Mint in Release Studio only; assign_isrcs also queues SX Direct. DistroKid pastes those codes and never mints.',
    'Anything about what a website is showing or will accept uses admin_browser on the open page. status shows the URL. navigate, then read or probe_fields, before type, press, or click. inspect names the element under a point. youDrive means the user has the mouse for clicks and typing — the assistant may still read and probe. DistroKid: distrokid_prefill + distrokid_upload_assets fill the /new/ form and attach files even while You drive. Do not click DistroKid Continue or Submit — the user reviews, then submits. Every other desk is open → read → act.',
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
