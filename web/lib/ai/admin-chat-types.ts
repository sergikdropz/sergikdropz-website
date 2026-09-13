export const ADMIN_AI_CHAT_PROVIDERS = ['anthropic', 'openai', 'ollama', 'crowelogic'] as const

export type AdminAiChatProvider = (typeof ADMIN_AI_CHAT_PROVIDERS)[number]
