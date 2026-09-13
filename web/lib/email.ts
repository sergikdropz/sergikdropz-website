/**
 * Email utility for sending transactional emails via Resend
 * Configure: Add RESEND_API_KEY to .env.local
 */

import { Resend } from 'resend'

// Lazy initialization to avoid build-time errors when API key is not set
let resend: Resend | null = null
function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY || '')
  }
  return resend
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

/**
 * Send an email via Resend
 */
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  tags,
}: EmailOptions) {
  try {
    const fromEmail = process.env.NEXT_PUBLIC_FROM_EMAIL || 'noreply@sergikdropz.com'

    const response = await getResend().emails.send({
      from: `SERGIK <${fromEmail}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      reply_to: replyTo,
      tags,
    })

    if (response.error) {
      throw new Error(response.error.message)
    }

    return {
      success: true,
      messageId: response.data?.id,
    }
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

/**
 * Email template: Campaign notification
 */
export function campaignNotificationTemplate(data: {
  fanName: string
  campaignName: string
  ctaUrl: string
  ctaText: string
}) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        color: #333;
        background: #f5f5f5;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: white;
        padding: 40px;
        border-radius: 8px;
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
      }
      .header h1 {
        margin: 0;
        font-size: 28px;
        color: #000;
      }
      .content {
        margin: 30px 0;
      }
      .cta {
        display: inline-block;
        background: #9333ea;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 600;
        margin: 20px 0;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #eee;
        font-size: 12px;
        color: #999;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>SERGIK</h1>
      </div>

      <div class="content">
        <p>Hey ${data.fanName || 'there'},</p>
        <p>${data.campaignName}</p>
        <p>
          <a href="${data.ctaUrl}" class="cta">${data.ctaText}</a>
        </p>
      </div>

      <div class="footer">
        <p>© 2026 SERGIK. All rights reserved.</p>
        <p>
          <a href="[unsubscribe_url]" style="color: #999; text-decoration: none;">Unsubscribe</a>
        </p>
      </div>
    </div>
  </body>
</html>
  `
}

/**
 * Email template: Release announcement
 */
export function releaseAnnouncementTemplate(data: {
  fanName: string
  releaseTitle: string
  releaseDate: string
  spotifyUrl: string
  artworkUrl?: string
}) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        color: #333;
        background: #1a1a1a;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: #0a0a0a;
        padding: 40px;
        border-radius: 8px;
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
        color: white;
      }
      .header h1 {
        margin: 0;
        font-size: 32px;
        color: #fff;
        text-transform: uppercase;
      }
      .artwork {
        text-align: center;
        margin: 30px 0;
      }
      .artwork img {
        max-width: 300px;
        border-radius: 8px;
      }
      .content {
        margin: 30px 0;
        color: #ddd;
      }
      .cta {
        display: inline-block;
        background: #9333ea;
        color: white;
        padding: 14px 32px;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 600;
        margin: 20px 0;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #333;
        font-size: 12px;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>SERGIK</h1>
        <p style="margin: 10px 0; color: #aaa; font-size: 14px;">New Release</p>
      </div>

      ${
        data.artworkUrl
          ? `<div class="artwork"><img src="${data.artworkUrl}" alt="${data.releaseTitle}" /></div>`
          : ''
      }

      <div class="content">
        <p>Hey ${data.fanName || 'there'},</p>
        <p style="font-size: 18px; font-weight: 600; color: #fff;">
          ${data.releaseTitle}
        </p>
        <p>Out now on all platforms</p>
        <p>
          <a href="${data.spotifyUrl}" class="cta">Listen on Spotify</a>
        </p>
      </div>

      <div class="footer">
        <p>© 2026 SERGIK. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
  `
}

/**
 * Email template: Mission completed
 */
export function missionCompletedTemplate(data: {
  fanName: string
  missionName: string
  pointsEarned: number
  unlockedReward?: string
}) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background: white;
        padding: 40px;
        border-radius: 8px;
      }
      .badge {
        display: inline-block;
        background: #9333ea;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-weight: 600;
        margin: 10px 0;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Mission Completed! 🎉</h1>
      <p>Hey ${data.fanName},</p>
      <p>You completed the mission: <strong>${data.missionName}</strong></p>
      <p><span class="badge">+${data.pointsEarned} points</span></p>
      ${
        data.unlockedReward
          ? `<p>You unlocked: <strong>${data.unlockedReward}</strong></p>`
          : ''
      }
    </div>
  </body>
</html>
  `
}
