/** Which engine answers. Local Ollama spends nothing. Cursor uses the Cursor plan, not ANTHROPIC_API_KEY. */

export function pickBackend(requested) {
  const value = String(requested || 'local')
    .trim()
    .toLowerCase()
  if (value === 'cursor' || value === 'claude' || value === 'cursor-claude') return 'cursor'
  return 'local'
}

export function ollamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
}

export function ollamaModel(requested) {
  const picked = String(requested || '').trim()
  if (picked && pickBackend(picked) === 'local' && picked.toLowerCase() !== 'local') return picked
  return process.env.OLLAMA_MODEL?.trim() || 'sergikai:latest'
}
