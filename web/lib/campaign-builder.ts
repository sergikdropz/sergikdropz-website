/**
 * Campaign Builder Utilities
 * 
 * Helpers for campaign creation, template selection, and sequence building
 * Used by campaign admin UI and campaign APIs
 */

/**
 * Release campaign template
 * T-3: Teaser
 * T0: Release day
 * T+2: Check it out
 * T+7: Follow-up engagement
 */
export const RELEASE_CAMPAIGN_TEMPLATE = {
  name: 'New Release Campaign',
  description: 'Automated release week sequence',
  sequences: [
    {
      days_offset: -3,
      sequence_order: 1,
      template_name: 'release_teaser',
      subject: 'New music coming soon',
      preview: 'T-3: Build anticipation with teaser',
    },
    {
      days_offset: 0,
      sequence_order: 2,
      template_name: 'release_announcement',
      subject: '${releaseTitle} is out now',
      preview: 'T0: Release day announcement',
    },
    {
      days_offset: 2,
      sequence_order: 3,
      template_name: 'release_reminder',
      subject: 'Listen now: ${releaseTitle}',
      preview: 'T+2: Gentle reminder with link',
    },
    {
      days_offset: 7,
      sequence_order: 4,
      template_name: 'release_engagement',
      subject: 'Your exclusive ${artistName} release',
      preview: 'T+7: Engagement and next steps',
    },
  ],
}

/**
 * Engagement campaign template
 * For ongoing engagement (fan updates, news, etc.)
 */
export const ENGAGEMENT_CAMPAIGN_TEMPLATE = {
  name: 'Fan Engagement Campaign',
  description: 'Regular engagement and updates',
  sequences: [
    {
      days_offset: 0,
      sequence_order: 1,
      template_name: 'engagement_main',
      subject: '${fanName}, new update from ${artistName}',
      preview: 'Main engagement message',
    },
    {
      days_offset: 3,
      sequence_order: 2,
      template_name: 'engagement_followup',
      subject: 'Did you see this?',
      preview: 'T+3: Light follow-up',
    },
  ],
}

/**
 * VIP/Exclusive campaign template
 * For superfans and exclusive content
 */
export const VIP_CAMPAIGN_TEMPLATE = {
  name: 'VIP Exclusive Campaign',
  description: 'Exclusive content for superfans',
  sequences: [
    {
      days_offset: 0,
      sequence_order: 1,
      template_name: 'vip_exclusive',
      subject: '🎁 ${fanName}, exclusive access inside',
      preview: 'VIP exclusive announcement',
    },
    {
      days_offset: 1,
      sequence_order: 2,
      template_name: 'vip_reminder',
      subject: 'Your exclusive ${contentType} expires soon',
      preview: 'T+1: Urgency reminder',
    },
  ],
}

export const CAMPAIGN_TEMPLATES = [
  RELEASE_CAMPAIGN_TEMPLATE,
  ENGAGEMENT_CAMPAIGN_TEMPLATE,
  VIP_CAMPAIGN_TEMPLATE,
]

/**
 * Build a campaign from a template
 * Used when creating campaign from preset
 */
export function buildCampaignFromTemplate(
  templateId: string,
  campaignName: string,
  variables: Record<string, string> = {}
) {
  const template = CAMPAIGN_TEMPLATES.find(
    (t) => t.name.toLowerCase().replace(/\s+/g, '-') === templateId
  )

  if (!template) {
    throw new Error(`Campaign template "${templateId}" not found`)
  }

  return {
    name: campaignName,
    description: template.description,
    sequences: template.sequences.map((seq) => ({
      ...seq,
      subject: interpolateTemplate(seq.subject, variables),
    })),
  }
}

/**
 * Simple template string interpolation
 * Supports ${variable} syntax
 */
function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g')
    result = result.replace(regex, value || '')
  }

  return result
}

/**
 * Calculate campaign send schedule
 * Returns array of { sequence, scheduledFor, dayOffset }
 */
export function calculateCampaignSchedule(
  campaignScheduledFor: Date,
  sequences: Array<{ days_offset: number; sequence_order: number; name: string }>
) {
  return sequences.map((seq) => {
    const sendDate = new Date(campaignScheduledFor)
    sendDate.setDate(sendDate.getDate() + seq.days_offset)

    return {
      sequence: seq.name,
      dayOffset: seq.days_offset,
      scheduledFor: sendDate,
      label: `T${seq.days_offset >= 0 ? '+' : ''}${seq.days_offset}`,
    }
  })
}

/**
 * Validate campaign data before creating
 */
export function validateCampaignData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Campaign name is required')
  }

  if (!data.scheduled_send_at) {
    errors.push('Campaign send date is required')
  }

  if (new Date(data.scheduled_send_at) < new Date()) {
    errors.push('Campaign send date must be in the future')
  }

  if (!data.sequences || data.sequences.length === 0) {
    errors.push('Campaign must have at least one email sequence')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
