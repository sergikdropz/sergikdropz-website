import assert from 'node:assert/strict'
import test from 'node:test'
import { completeWithCursor } from './cursor.mjs'

test('cursor_chat refuses to start without a Cursor plan key', async () => {
  const previous = process.env.CURSOR_API_KEY
  delete process.env.CURSOR_API_KEY
  try {
    await assert.rejects(completeWithCursor('hello'), /CURSOR_API_KEY/)
  } finally {
    if (previous === undefined) delete process.env.CURSOR_API_KEY
    else process.env.CURSOR_API_KEY = previous
  }
})
