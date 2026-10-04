import { describe, expect, it } from 'vitest'
import { previousFieldsFromPreview } from '@/lib/ai/admin-ai-checkpoints'

describe('admin-ai-checkpoints', () => {
  it('prefers the server preview before value over the model guess', () => {
    expect(
      previousFieldsFromPreview('elevator_pitch', 'guessed', {
        before: { elevator_pitch: 'actual from db' },
      }),
    ).toEqual({ elevator_pitch: 'actual from db' })
    expect(previousFieldsFromPreview('elevator_pitch', 'guessed', { before: {} })).toEqual({
      elevator_pitch: 'guessed',
    })
  })
})
