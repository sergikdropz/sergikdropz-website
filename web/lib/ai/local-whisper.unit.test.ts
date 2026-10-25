import { describe, expect, it } from 'vitest'
import { localWhisperArgs } from '@/lib/ai/local-whisper'

describe('localWhisperArgs', () => {
  it('writes a text transcript with the cached base model', () => {
    expect(localWhisperArgs('/tmp/dictation.webm', '/tmp/out')).toEqual([
      '/tmp/dictation.webm',
      '--model',
      'base',
      '--language',
      'English',
      '--task',
      'transcribe',
      '--output_format',
      'txt',
      '--output_dir',
      '/tmp/out',
      '--fp16',
      'False',
      '--verbose',
      'False',
    ])
  })
})
