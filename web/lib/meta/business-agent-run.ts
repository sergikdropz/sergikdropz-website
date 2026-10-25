import { loadMetaRoyaltyAccess } from '@/lib/meta/connection'
import {
  callMetaBusinessAgent,
  metaBusinessAgentEntityId,
  type MetaBusinessAgentAction,
  type MetaBusinessAgentResult,
} from '@/lib/meta/business-agent'

const empty = (action: MetaBusinessAgentAction, note: string): MetaBusinessAgentResult => ({
  ok: false,
  action,
  note,
  eligible: null,
  agentResponse: null,
  conversationId: null,
  messageId: null,
  agentId: null,
  canOnboard: false,
  httpStatus: null,
})

export async function runMetaBusinessAgent(input: {
  action?: MetaBusinessAgentAction
  message?: string
  conversationId?: string
  entityId?: string
  /** Agent loop stays on status and test. The royalties button sets this for Create agent. */
  allowOnboard?: boolean
}): Promise<MetaBusinessAgentResult> {
  const requested = input.action === 'test' || input.action === 'onboard' ? input.action : 'status'
  const action: MetaBusinessAgentAction = requested === 'onboard' && !input.allowOnboard ? 'status' : requested
  const access = await loadMetaRoyaltyAccess()
  if (!access?.userToken) {
    return empty(action, 'Connect Meta on the royalties desk first. Business Agent uses that saved user token.')
  }
  const entityId = metaBusinessAgentEntityId(input.entityId, access.igUserId)
  if (!entityId) {
    return empty(
      action,
      'Set META_WHATSAPP_PHONE_NUMBER_ID to the phone number id in WhatsApp Manager, or connect the Instagram account.'
    )
  }
  if (action === 'test' && !(input.message || '').trim()) {
    return empty('test', 'Type a question for the Meta Business Agent test chat.')
  }
  return callMetaBusinessAgent({
    token: access.userToken,
    entityId,
    action,
    message: input.message,
    conversationId: input.conversationId,
  })
}
