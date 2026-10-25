import { describe, expect, it } from 'vitest'
import {
  agentReasoningProviderOrder,
  clipChatHistory,
  extractFollowUp,
  reasoningFollowUp,
  readAnthropicAgentContent,
  resolveTurnToolCalls,
  seedAgentTranscript,
  toAnthropicMessages,
  toOpenAiMessages,
  toolCallsFromOpenAiMessage,
  type AgentTranscriptMessage,
} from '@/lib/ai/admin-ai-agent-transcript'

const transcript: AgentTranscriptMessage[] = [
  { role: 'user', content: 'Pull the DK ISRCs' },
  {
    role: 'assistant',
    content: 'Reading the album page.',
    toolCalls: [{ id: 'call_1', name: 'admin_browser', arguments: { action: 'read' } }],
  },
  {
    role: 'tool',
    toolCallId: 'call_1',
    name: 'admin_browser',
    content: '{"distrokidCodes":{"tracks":[{"n":1,"isrc":"QZES72569811"}]}}',
  },
  { role: 'user', content: 'Quote those codes.' },
]

describe('admin agent transcript', () => {
  it('keeps assistant tool calls and the following result for OpenAI', () => {
    const messages = toOpenAiMessages('system', transcript.slice(0, 3))
    expect(messages[0]).toEqual({ role: 'system', content: 'system' })
    expect(messages[2]).toMatchObject({
      role: 'assistant',
      content: 'Reading the album page.',
    })
    const toolCalls = (messages[2] as { tool_calls: Array<{ function: { name: string; arguments: string } }> })
      .tool_calls
    expect(toolCalls[0]?.function.name).toBe('admin_browser')
    expect(JSON.parse(toolCalls[0]?.function.arguments || '{}')).toEqual({ action: 'read' })
    expect(messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' })
    expect(String(messages[3]?.content)).toContain('QZES72569811')
  })

  it('groups a tool result and the next user note into one Anthropic user turn', () => {
    const messages = toAnthropicMessages(transcript)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
    const follow = messages[2]?.content
    expect(Array.isArray(follow)).toBe(true)
    if (!Array.isArray(follow)) return
    expect(follow[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'call_1' })
    expect(follow[1]).toMatchObject({ type: 'text', text: 'Quote those codes.' })
  })

  it('prefers native tool calls over a /tool line in the same reply', () => {
    const native = toolCallsFromOpenAiMessage({
      tool_calls: [
        {
          id: 'call_9',
          function: { name: 'admin_browser', arguments: '{"action":"read"}' },
        },
      ],
    })
    const text = '/tool admin_browser {"action":"navigate","url":"https://distrokid.com/isrc/"}'
    expect(resolveTurnToolCalls(native, text)).toEqual([
      { id: 'call_9', name: 'admin_browser', arguments: { action: 'read' } },
    ])
    expect(resolveTurnToolCalls([], text)[0]?.arguments).toEqual({
      action: 'navigate',
      url: 'https://distrokid.com/isrc/',
    })
  })

  it('reads Anthropic tool_use blocks and asks for the album page until codes arrive', () => {
    const read = readAnthropicAgentContent([
      { type: 'text', text: 'Opening the album.' },
      { type: 'tool_use', id: 'toolu_1', name: 'admin_browser', input: { action: 'read' } },
    ])
    expect(read.text).toBe('Opening the album.')
    expect(read.toolCalls[0]?.id).toBe('toolu_1')
    const seeded = seedAgentTranscript(
      clipChatHistory([
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Working…' },
        { role: 'system', content: 'ignore' },
      ]),
      'Pull the DK ISRCs',
    )
    expect(seeded.map((message) => message.role)).toEqual(['user', 'user'])
    expect(extractFollowUp('Pull the DK ISRCs', seeded)).toMatch(/distrokidCodes/)
    expect(extractFollowUp('Pull the DK ISRCs', transcript)).toBeNull()
    const previousProvider = process.env.ADMIN_AI_CHAT_PROVIDER
    delete process.env.ADMIN_AI_CHAT_PROVIDER
    try {
      expect(agentReasoningProviderOrder()).toEqual(['openai', 'crowelogic', 'cursor', 'ollama'])
    } finally {
      if (previousProvider === undefined) delete process.env.ADMIN_AI_CHAT_PROVIDER
      else process.env.ADMIN_AI_CHAT_PROVIDER = previousProvider
    }
  })

  it('asks for the owning source on any project question, and for a preview when a save is claimed', () => {
    const empty: AgentTranscriptMessage[] = [{ role: 'user', content: 'How many listeners do we have on Spotify?' }]
    expect(reasoningFollowUp(empty[0] && empty[0].role === 'user' ? empty[0].content : '', empty)).toMatch(
      /query_platform_growth_snapshot/,
    )
    expect(reasoningFollowUp('How many listeners do we have on Spotify?', empty, true)).toBeNull()

    const claimed: AgentTranscriptMessage[] = [
      { role: 'user', content: 'Update the Spotify pitch for this release' },
      { role: 'assistant', content: 'I updated the pitch and saved it.', toolCalls: [] },
    ]
    expect(reasoningFollowUp('Update the Spotify pitch for this release', claimed)).toMatch(/dry run/)
    const invented: AgentTranscriptMessage[] = [
      { role: 'user', content: 'What ISRC is on track 1?' },
      { role: 'assistant', content: 'Track 1 is QTA532512345.', toolCalls: [] },
      { role: 'tool', toolCallId: 't1', name: 'query_release_studio_snapshot', content: '{"tracks":[]}' },
    ]
    expect(reasoningFollowUp('What ISRC is on track 1?', invented)).toMatch(/QTA532512345/)
    expect(
      reasoningFollowUp(
        'When does this release?',
        [
          { role: 'user', content: 'When does this release?' },
          { role: 'assistant', content: 'It releases on 2026-11-02.', toolCalls: [] },
        ],
        true,
        'release_date: 2026-04-01',
      ),
    ).toMatch(/2026-11-02/)
    expect(
      reasoningFollowUp(
        'What is the UPC?',
        [
          { role: 'user', content: 'What is the UPC?' },
          { role: 'assistant', content: 'The UPC is empty.', toolCalls: [] },
        ],
        true,
        'upc: 012345678905',
      ),
    ).toMatch(/already has a UPC/)
    expect(
      reasoningFollowUp(
        'How many tracks are on this release?',
        [
          { role: 'user', content: 'How many tracks are on this release?' },
          { role: 'assistant', content: 'There are 14 tracks.', toolCalls: [] },
        ],
        true,
        '{"trackCount":4,"title":"Night Drive"}',
      ),
    ).toMatch(/14/)
    expect(
      reasoningFollowUp(
        'What is track 1 called?',
        [
          { role: 'user', content: 'What is track 1 called?' },
          { role: 'assistant', content: 'Track 1 is "Midnight Highway".', toolCalls: [] },
        ],
        true,
        '{"title":"Night Drive"}',
      ),
    ).toMatch(/Midnight Highway/)
    expect(
      reasoningFollowUp(
        'What is track 1 called?',
        [
          { role: 'user', content: 'What is track 1 called?' },
          { role: 'assistant', content: 'Track 1 is "Night Drive".', toolCalls: [] },
        ],
        true,
        '{"title":"Night Drive"}',
      ),
    ).toBeNull()
    expect(
      resolveTurnToolCalls(
        [{ id: 'call_pitch', name: 'patch_release_marketing_copy', arguments: { releaseId: 'abc', merge: true } }],
        '',
      )[0]?.name,
    ).toBe('patch_release_marketing_copy')
    expect(resolveTurnToolCalls([{ id: 'nope', name: 'run_applescript', arguments: {} }], '')).toEqual([])
  })
})