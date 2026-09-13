/** Custom SERGIK / OlliN Pro Ollama model (see ENV_VARIABLES.md — `ollama pull sergikai`). */
export const DEFAULT_OLLAMA_MODEL = 'sergikai:latest'

/** Shown when /api/tags is unreachable; live list wins when Ollama is running. */
export const STATIC_OLLAMA_MODEL_HINTS = [
  DEFAULT_OLLAMA_MODEL,
  'llama3.2',
  'llama3.1',
  'mistral',
  'mixtral',
  'phi3',
  'gemma2',
  'qwen2.5',
] as const
