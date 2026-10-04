import { describe, expect, it } from 'vitest'
import { messageAlreadyHasControlState, messageWantsFormProbe, messageWantsLiveContext } from '@/lib/ai/admin-ai-chat-live-context'

describe('admin-ai-chat-live-context', () => {
  it('detects when a message needs live browser or release grounding', () => {
    expect(messageWantsLiveContext('hello')).toBe(false)
    expect(
      messageWantsLiveContext(
        'what about this?\nPage: https://distrokid.com/new/\nHTML Element: <input>',
      ),
    ).toBe(true)
    expect(messageWantsLiveContext('Selected: A field labeled UPC')).toBe(true)
    expect(messageWantsLiveContext('probe the open DistroKid form')).toBe(true)
  })

  it('detects form probe intent', () => {
    expect(messageWantsFormProbe('is DistroKid going to set its own upc')).toBe(true)
    expect(messageWantsFormProbe('nice screenshot of the hero')).toBe(false)
    expect(messageWantsFormProbe('<input name="customUpc">')).toBe(true)
    expect(
      messageAlreadyHasControlState(
        'Page: https://distrokid.com/new/\nState: value=(empty)\nHTML Element: <input id="customUpc">',
      ),
    ).toBe(true)
    expect(messageAlreadyHasControlState('is DistroKid going to set its own upc')).toBe(false)
  })
})
