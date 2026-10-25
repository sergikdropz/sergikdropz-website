export const ADMIN_AI_CHAT_PROVIDERS = ['anthropic', 'openai', 'ollama', 'crowelogic', 'cursor'] as const

export type AdminAiChatProvider = (typeof ADMIN_AI_CHAT_PROVIDERS)[number]
