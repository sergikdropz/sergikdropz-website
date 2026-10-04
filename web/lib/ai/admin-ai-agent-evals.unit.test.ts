/**
 * Golden eval harness for Admin AI Agent behavior (no live LLM).
 * These cases lock the routing + tool allowlist that make Agent feel like Cursor.
 */
import { describe, expect, it } from 'vitest'
import { resolveInferredSkillForAdminChat } from '@/lib/ai/admin-chat-infer-skill'
import { parseAgentToolCalls } from '@/lib/ai/admin-ai-agent-tools'
import { expandAdminAiMentions } from '@/lib/ai/admin-ai-mentions'
import { annotateElementPick, isChromeElementPick } from '@/lib/ai/admin-ai-tool-literacy'
import { messageWantsLiveContext } from '@/lib/ai/admin-ai-chat-live-context'
import { deskSkillHintFromMessage } from '@/lib/ai/admin-ai-desks'

const CASES = [
  {
    id: 'upc-on-distrokid',
    message: [
      'is distrokid going to set its own upc?',
      'Page: https://distrokid.com/new/',
      'State: value=(empty)',
      'HTML Element: <input id="customUpc" placeholder="UPC">',
    ].join('\n'),
    expectSkill: 'studio_release',
    expectLive: true,
  },
  {
    id: 'growth-s4a',
    message: 'Page: https://artists.spotify.com/\nHow do we grow monthly listeners?',
    expectSkill: 'growth_marketing',
    expectLive: true,
  },
  {
    id: 'mention-release',
    message: '@release what blockers remain?',
    expectSkill: 'studio_release',
    expectLive: true,
  },
  {
    id: 'toolbar-chrome',
    message: [
      'DOM Path: div.shrink-0',
      'Visible: BROWSER Back Reload Site Spotify DistroKid',
      'HTML Element: <div class="shrink-0"></div>',
    ].join('\n'),
    expectChrome: true,
  },
] as const

describe('admin-ai-agent-evals', () => {
  it.each(CASES)('$id', (c) => {
    if ('expectSkill' in c && c.expectSkill) {
      const skill = resolveInferredSkillForAdminChat(c.message, {
        skillId: null,
        stickySkillId: 'product_strategy',
      })
      expect(skill.id).toBe(c.expectSkill)
      if (c.id === 'upc-on-distrokid') {
        expect(deskSkillHintFromMessage(c.message)).toBe('studio_release')
      }
    }
    if ('expectLive' in c && c.expectLive) {
      expect(messageWantsLiveContext(c.message)).toBe(true)
    }
    if ('expectChrome' in c && c.expectChrome) {
      expect(isChromeElementPick(c.message)).toBe(true)
      expect(annotateElementPick(c.message)).not.toContain('DOM Path:')
    }
  })

  it('blocks write tools from the agent auto-loop', () => {
    const calls = parseAgentToolCalls(
      '/tool assign_isrcs {"releaseId":"x"}\n/tool query_ops_snapshot {"focus":"studio"}',
    )
    expect(calls.map((c) => c.tool)).toEqual(['query_ops_snapshot'])
  })

  it('expands @desk and @growth into tool bootstraps', () => {
    const expanded = expandAdminAiMentions({
      message: '@desk:YouTube Studio @growth check Spotlight',
      releaseId: null,
    })
    expect(expanded.context).toContain('YouTube Studio')
    expect(expanded.requestedTools.some((t) => t.tool === 'query_platform_growth_snapshot')).toBe(true)
  })
})
