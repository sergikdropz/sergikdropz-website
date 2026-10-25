import { describe, expect, it } from 'vitest'
import {
  createReplyDeltaPump,
  deltaFromChatSse,
  takeChatStreamDeltas,
  visibleStreamingReply,
} from '@/lib/ai/admin-ai-reply-stream'

describe('admin reply stream', () => {
  it('reads openai and anthropic token events', () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"Here"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":" is"}}]}',
      'data: [DONE]',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" the"}}',
      '',
    ].join('\n')
    const parsed = takeChatStreamDeltas(raw)
    expect(parsed.deltas.join('')).toBe('Here is the')
    expect(parsed.rest).toBe('')
    expect(deltaFromChatSse('{"choices":[{"delta":{"content":null}}]}')).toBe('')
  })

  it('keeps a split event until the next chunk', () => {
    const first = takeChatStreamDeltas('data: {"choices":[{"delta":{"content":"Hel')
    expect(first.deltas).toEqual([])
    expect(first.rest.startsWith('data:')).toBe(true)
    const second = takeChatStreamDeltas(`${first.rest}lo"}}]}\n`)
    expect(second.deltas).toEqual(['Hello'])
  })

  it('flushes once the buffer is large enough', () => {
    const chunks: string[] = []
    const pump = createReplyDeltaPump((text) => chunks.push(text), { chars: 4, waitMs: 10_000 })
    pump.push('ab')
    expect(chunks).toEqual([])
    pump.push('cd')
    expect(chunks).toEqual(['abcd'])
    pump.push('e')
    pump.flush()
    expect(chunks).toEqual(['abcd', 'e'])
  })

  it('shows prose as it arrives and holds tool lines and open diff fences', () => {
    expect(visibleStreamingReply('Here is an honest read')).toBe('Here is an honest read')
    expect(
      visibleStreamingReply('Checking the page.\n/tool admin_browser {"action":"read"}\nFound the album.'),
    ).toBe('Checking the page.\nFound the album.')
    expect(visibleStreamingReply('Checking the page.\n/tool admin_browser {"act')).toBe('Checking the page.')
    expect(visibleStreamingReply('Before.\n```ai-diff\n{"field":"upc"')).toBe('Before.\n')
    expect(visibleStreamingReply('Before.\n```ai-diff\n{"field":"upc"}\n```\nAfter.')).toBe('Before.\n\nAfter.')
  })
})