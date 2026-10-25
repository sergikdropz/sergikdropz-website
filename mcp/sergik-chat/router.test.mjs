import assert from 'node:assert/strict'
import test from 'node:test'
import { ollamaModel, pickBackend } from './router.mjs'

test('everyday chat stays on the local model', () => {
  assert.equal(pickBackend(undefined), 'local')
  assert.equal(pickBackend('local'), 'local')
  assert.equal(pickBackend('sergikai:latest'), 'local')
})

test('cursor and claude names use the Cursor plan route', () => {
  assert.equal(pickBackend('cursor'), 'cursor')
  assert.equal(pickBackend('Claude'), 'cursor')
  assert.equal(pickBackend('cursor-claude'), 'cursor')
})

test('local model name falls through to the installed Sergik model', () => {
  const previous = process.env.OLLAMA_MODEL
  process.env.OLLAMA_MODEL = 'sergikai:latest'
  try {
    assert.equal(ollamaModel('local'), 'sergikai:latest')
    assert.equal(ollamaModel('qwen2.5vl:7b'), 'qwen2.5vl:7b')
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_MODEL
    else process.env.OLLAMA_MODEL = previous
  }
})
