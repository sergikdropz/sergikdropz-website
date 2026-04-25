/**
 * Campaign Scheduler Worker
 * 
 * Purpose: Background job that:
 * 1. Finds campaigns ready to send (scheduled_send_at <= now, status = scheduled)
 * 2. For each campaign, loads sequences sorted by days_offset
 * 3. For each sequence, creates campaign_sends records for all fans (respecting filters)
 * 4. Updates campaign status to "sending"
 * 5. Triggers send worker to queue emails via Resend
 * 
 * Run via cron (recommend: every 1 minute for real-time scheduling)
 * Or via queue system (BullMQ) for more reliability
 * 
 * Example cron job:
 * * * * * curl -X POST https://yourdomain.com/api/cron/campaigns-scheduler
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

interface CampaignToSend {
  id: string
  name: string
  scheduled_send_at: string
  status: string
  fan_segment_filter?: any
  campaign_sequences?: Sequence[]
}

interface Sequence {
  id: string
  campaign_id: string
  template_id: string
  days_offset: number
  sequence_order: number
  campaign_templates: {
    name: string
    subject: string
    body_html: string
    variables: { name: string; type: string }[]
  }
}

interface Fan {
  id: string
  email: string
  name: string
  [key: string]: any
}

/**
 * Main scheduler function
 * Call this from a cron endpoint or queue worker
 */
export async function scheduleCampaignSends() {
  try {
    // 1. Find campaigns ready to send
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select(
        `
        id,
        name,
        scheduled_send_at,
        status,
        fan_segment_filter,
        campaign_sequences (
          id,
          campaign_id,
          template_id,
          days_offset,
          sequence_order,
          campaign_templates (
            id,
            name,
            subject,
            body_html,
            variables
          )
        )
      `
      )
      .eq('status', 'scheduled')
      .lte('scheduled_send_at', new Date().toISOString())
      .order('scheduled_send_at', { ascending: true })

    if (campaignError) throw campaignError

    if (!campaigns || campaigns.length === 0) {
      console.log('[Scheduler] No campaigns to send at this time')
      return { success: true, campaignsSent: 0 }
    }

    console.log(`[Scheduler] Found ${campaigns.length} campaign(s) to send`)

    let totalSends = 0

    // 2. Process each campaign
    for (const campaign of campaigns as unknown as CampaignToSend[]) {
      try {
        const sendCount = await processCampaign(supabase, campaign)
        totalSends += sendCount
        console.log(
          `[Scheduler] Campaign "${campaign.name}" queued ${sendCount} sends`
        )
      } catch (error) {
        console.error(`[Scheduler] Error processing campaign ${campaign.id}:`, error)
        // Continue with next campaign on error
      }
    }

    return { success: true, campaignsSent: campaigns.length, totalSends }
  } catch (error) {
    console.error('[Scheduler] Fatal error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Process a single campaign
 * Creates campaign_sends records for each fan in segment
 */
async function processCampaign(supabase: any, campaign: CampaignToSend) {
  // 1. Load fans to send to (apply segment filter if provided)
  const fansQuery = supabase.from('fans')
  const rawFilter = campaign.fan_segment_filter
  let filter: any = null

  if (rawFilter) {
    try {
      filter = typeof rawFilter === 'string' ? JSON.parse(rawFilter) : rawFilter
    } catch (error) {
      console.warn('[Scheduler] Invalid fan_segment_filter JSON; ignoring filter')
      filter = null
    }
  }

  if (filter) {
    // Example: {"is_superfan": true, "tags": ["vip"], "source": "contact_form", "segment_id": "..."}
    if (filter.is_superfan) {
      fansQuery.eq('is_superfan', true)
    }

    if (Array.isArray(filter.tags) && filter.tags.length > 0) {
      fansQuery.contains('tags', filter.tags)
    }

    if (filter.source) {
      fansQuery.eq('source', filter.source)
    }

    if (filter.segment_id) {
      const { data: members, error: membersError } = await supabase
        .from('fan_segment_members')
        .select('fan_id')
        .eq('segment_id', filter.segment_id)

      if (membersError) throw membersError

      const memberIds = (members || []).map((m: any) => m.fan_id)
      if (memberIds.length === 0) {
        return 0
      }
      fansQuery.in('id', memberIds)
    }
  }

  const { data: fans, error: fansError } = await fansQuery.select('id, email, name')

  if (fansError) throw fansError

  if (!fans || fans.length === 0) {
    console.log(`[Scheduler] Campaign ${campaign.id} has no fans to send to`)
    return 0
  }

  console.log(
    `[Scheduler] Campaign ${campaign.id}: ${fans.length} fans to send to`
  )

  // 2. Create campaign_sends for each sequence × fan combination
  let sendCount = 0

  const sequences = campaign.campaign_sequences || []

  for (const sequence of sequences) {
    for (const fan of fans) {
      // Calculate actual send time: now + days_offset
      const sendTime = new Date()
      sendTime.setDate(sendTime.getDate() + sequence.days_offset)

      const { error: sendError } = await createCampaignSend(supabase, {
        campaign_id: campaign.id,
        sequence_id: sequence.id,
        fan_id: fan.id,
        to_email: fan.email,
        to_name: fan.name,
        template: sequence.campaign_templates,
        scheduled_for: sendTime.toISOString(),
      })

      if (sendError) {
        console.error(`Error creating send for fan ${fan.id}:`, sendError)
      } else {
        sendCount++
      }
    }
  }

  // 3. Update campaign status to "sending"
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({
      status: 'sending',
      total_recipients: fans.length * sequences.length,
    })
    .eq('id', campaign.id)

  if (updateError) throw updateError

  return sendCount
}

/**
 * Create a single campaign_send record
 * Will be picked up by send worker
 */
async function createCampaignSend(
  supabase: any,
  {
    campaign_id,
    sequence_id,
    fan_id,
    to_email,
    to_name,
    template,
    scheduled_for,
  }: {
    campaign_id: string
    sequence_id: string
    fan_id: string
    to_email: string
    to_name: string
    template: any
    scheduled_for: string
  }
) {
  // Render template with fan data
  let bodyHtml = template.body_html
  let subject = template.subject

  // Simple variable substitution (e.g., ${fanName}, ${releaseTitle})
  if (template.variables && template.variables.length > 0) {
    const variableMap: { [key: string]: string } = {
      fanName: to_name,
      fanEmail: to_email,
      // Add more as needed (releaseTitle, artistName, etc.)
    }

    for (const [key, value] of Object.entries(variableMap)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g')
      bodyHtml = bodyHtml.replace(regex, value || '')
      subject = subject.replace(regex, value || '')
    }
  }

  // Insert campaign_send record
  const { data, error } = await supabase.from('campaign_sends').insert({
    campaign_id,
    sequence_id,
    fan_id,
    to_email,
    to_name,
    rendered_subject: subject,
    rendered_html: bodyHtml,
    status: 'pending',
    scheduled_for,
  })

  return { data, error }
}

/**
 * Send queued campaign emails
 * Call this from /api/cron/campaigns-sender or separate worker
 * Processes pending campaign_sends and actually sends via Resend
 */
export async function sendQueuedCampaignEmails(limit = 100) {
  try {
    // 1. Find pending sends ready to go
    const now = new Date().toISOString()

    const { data: sends, error: sendsError } = await supabase
      .from('campaign_sends')
      .select('id, to_email, rendered_subject, rendered_html, campaign_id, sequence_id')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(limit)

    if (sendsError) throw sendsError

    if (!sends || sends.length === 0) {
      console.log('[Sender] No pending campaign sends to send')
      return { success: true, sent: 0 }
    }

    console.log(`[Sender] Sending ${sends.length} campaign email(s)`)

    let sentCount = 0
    let failedCount = 0

    // 2. Send each email
    for (const send of sends) {
      try {
        await supabase
          .from('campaign_sends')
          .update({ status: 'queued', queued_at: new Date().toISOString() })
          .eq('id', send.id)

        const result = await sendEmail({
          to: send.to_email,
          subject: send.rendered_subject,
          html: send.rendered_html,
        })

        if (result.messageId) {
          // Update campaign_send with success
          const { error: updateError } = await supabase
            .from('campaign_sends')
            .update({
              status: 'sent',
              message_id: result.messageId,
              sent_at: new Date().toISOString(),
            })
            .eq('id', send.id)

          if (updateError) {
            console.error(`Error updating send ${send.id}:`, updateError)
            failedCount++
          } else {
            sentCount++
          }
        } else {
          failedCount++
          console.error(`Failed to send email to ${send.to_email}: no messageId returned`)
        }
      } catch (error) {
        failedCount++
        console.error(`Error sending email ${send.id}:`, error)
      }
    }

    // 3. Update campaign stats (if all sends done)
    // This is a simplification; you'd likely do this more carefully
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'sending')
      .limit(10)

    if (campaigns) {
      for (const campaign of campaigns) {
        const { data: stillPending } = await supabase
          .from('campaign_sends')
          .select('id')
          .eq('campaign_id', campaign.id)
          .eq('status', 'pending')
          .limit(1)

        if (!stillPending || stillPending.length === 0) {
          // All sends done, mark campaign as sent
          await supabase
            .from('campaigns')
            .update({ status: 'sent' })
            .eq('id', campaign.id)
        }
      }
    }

    console.log(`[Sender] Sent ${sentCount}, Failed ${failedCount}`)

    return { success: true, sent: sentCount, failed: failedCount }
  } catch (error) {
    console.error('[Sender] Fatal error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
