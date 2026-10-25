import { afterEach, describe, expect, it } from 'vitest'
import {
  compactOllamaAdminSystem,
  composeLocalAuditReply,
  formatAdminAiProbe,
  formatHarnessProbe,
  harnessProbeIsOffline,
  localAuditReplyFailed,
  localGroundingTranscript,
  shouldGroundLocalAdmin,
} from '@/lib/ai/ollama-admin-grounding'
import { formatPolymathAdminDesk } from '@/lib/ai/polymath-admin-desk'
import { getAllSkills } from '@/lib/ai/skills/registry'
import { pickOllamaAdminModel } from '@/lib/ai/ollama-model-resolve'

describe('shouldGroundLocalAdmin', () => {
  const previous = process.env.ADMIN_AI_CHAT_PROVIDER
  afterEach(() => {
    if (previous === undefined) delete process.env.ADMIN_AI_CHAT_PROVIDER
    else process.env.ADMIN_AI_CHAT_PROVIDER = previous
  })

  it('grounds ollama and an ollama env default', () => {
    process.env.ADMIN_AI_CHAT_PROVIDER = 'ollama'
    expect(shouldGroundLocalAdmin('ollama')).toBe(true)
    expect(shouldGroundLocalAdmin(null)).toBe(true)
    expect(shouldGroundLocalAdmin('anthropic')).toBe(false)
    expect(shouldGroundLocalAdmin('openai')).toBe(false)
    expect(shouldGroundLocalAdmin('crowelogic')).toBe(false)
    expect(shouldGroundLocalAdmin('cursor')).toBe(false)
  })
})

describe('formatAdminAiProbe', () => {
  it('names the admin model and does not invent a credit balance', () => {
    const text = formatAdminAiProbe()
    expect(text).toMatch(/qwen2\.5vl:7b|OLLAMA_ADMIN_MODEL/)
    expect(text).toMatch(/does not know API credit balances/)
  })
})

describe('formatHarnessProbe', () => {
  it('keeps the connectivity line and sonic DNA rollup', () => {
    const text = formatHarnessProbe({
      connectivity: { summary: 'OlliN Pro API offline — start AiBLETON/OlliN Pro on AIBLETON_API_BASE' },
      sonicDna: { unifiedIntelligenceTracks: 2, trackCount: 4, note: 'Partial unified Sonic DNA' },
      ollin: { probe: { ok: false, error: 'connection refused' } },
    })
    expect(text).toMatch(/OlliN Pro API offline/)
    expect(text).toMatch(/2\/4/)
    expect(text).toMatch(/connection refused/)
  })

  it('keeps harness skill and knowledge rows', () => {
    const text = formatHarnessProbe({
      connectivity: { summary: 'OlliN Pro API reachable · Harness probe OK' },
      ollin: {
        probe: {
          ok: true,
          data: {
            matches: {
              skills: [{ name: 'OlliN Pro intelligence harness', summary: 'Unified catalog and probe.' }],
              knowledge: [{ text: 'BPM transitions stay within five BPM.', metadata: { heading: 'BPM Transitions' } }],
            },
          },
        },
      },
    })
    expect(text).toMatch(/OlliN Pro intelligence harness/)
    expect(text).toMatch(/BPM Transitions/)
    expect(harnessProbeIsOffline(text)).toBe(false)
  })

  it('treats a Crowe key gap as online when OlliN answered', () => {
    const text = formatHarnessProbe({
      connectivity: {
        summary:
          'OlliN Pro API reachable · Harness probe OK · CroweLM chat not configured (customer credential missing)',
      },
    })
    expect(harnessProbeIsOffline(text)).toBe(false)
    expect(harnessProbeIsOffline('OlliN Pro API offline — start AiBLETON')).toBe(true)
  })
})

describe('formatPolymathAdminDesk', () => {
  it('lists every admin skill and the polymath specialists', () => {
    const text = formatPolymathAdminDesk('product_strategy')
    expect(text).toMatch(/genre lock/)
    expect(text).toMatch(/do not invent BPM/i)
    for (const skill of getAllSkills()) {
      expect(text).toContain(`[${skill.id}]`)
    }
    expect(text).toMatch(/\[product_strategy\] \(active\)/)
  })
})

describe('compactOllamaAdminSystem', () => {
  it('tells the local model to write from probes and drops the Ableton job', () => {
    const text = compactOllamaAdminSystem({
      skillName: 'Marketing & Product Strategy',
      pageContext: 'Release: Homes',
    })
    expect(text).toMatch(/## Verdict/)
    expect(text).toMatch(/polymath/)
    expect(text).toMatch(/Ignore any Ableton/)
    expect(text).toMatch(/Release: Homes/)
    expect(text).not.toMatch(/\/exec/)
  })
})

describe('localGroundingTranscript', () => {
  it('labels both probes', () => {
    const text = localGroundingTranscript('anthropic: missing', 'Harness probe offline: refused')
    expect(text).toMatch(/POLYMATH \+ ADMIN AI DESK/)
    expect(text).toMatch(/\[music_business_counsel\]/)
    expect(text).toMatch(/ADMIN AI PROBE/)
    expect(text).toMatch(/SERGIK UNIFIED INTELLIGENCE HARNESS/)
  })
})

describe('local audit reply', () => {
  it('rejects an apology and writes the audit from the probes', () => {
    expect(localAuditReplyFailed("I apologize for any confusion. Let's focus on creating a Hype")).toBe(true)
    const text = composeLocalAuditReply({
      message: 'audit the release',
      adminAi: 'anthropic: configured\nollama: admin chat uses qwen2.5vl:7b when that tag is installed',
      harness:
        'OlliN Pro API reachable · Harness probe OK · CroweLM chat not configured (customer credential missing) · Crowe Creative offline or key missing (CROWE_API_KEY)\nSonic DNA unified 2/4. Partial',
    })
    expect(text).toMatch(/^## Verdict/)
    expect(text).toMatch(/harness is up/)
    expect(text).toMatch(/audit the release/)
    expect(text).toMatch(/2 of 4/)
    expect(text).toMatch(/## Offline/)
    expect(text).toMatch(/CroweLM chat: credential missing/)
    expect(localAuditReplyFailed(text)).toBe(false)
  })
})

describe('pickOllamaAdminModel', () => {
  const previous = process.env.OLLAMA_ADMIN_MODEL
  afterEach(() => {
    if (previous === undefined) delete process.env.OLLAMA_ADMIN_MODEL
    else process.env.OLLAMA_ADMIN_MODEL = previous
  })

  it('prefers the base Qwen tag over sergikai', () => {
    delete process.env.OLLAMA_ADMIN_MODEL
    expect(pickOllamaAdminModel(['sergikai:latest', 'qwen2.5vl:7b'], 'sergikai:latest')).toBe('qwen2.5vl:7b')
  })

  it('honors OLLAMA_ADMIN_MODEL when that tag is installed', () => {
    process.env.OLLAMA_ADMIN_MODEL = 'sergikai:latest'
    expect(pickOllamaAdminModel(['sergikai:latest', 'qwen2.5vl:7b'], null)).toBe('sergikai:latest')
  })
})
