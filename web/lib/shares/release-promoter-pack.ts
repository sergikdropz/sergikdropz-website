import { zipSync, strToU8 } from 'fflate'
import { sanitizeSocialFilename } from '@/lib/studio/social-promo-assets'
import type { ResolvedSharePayload } from '@/lib/shares/types'
import { listenUrlWithUtm } from '@/lib/shares/share-utm'

export type PromoterPackInput = {
  releaseTitle: string
  leadTrackTitle: string
  payload: ResolvedSharePayload
  storyMp4: Blob
  storyFilename: string
  youtubeLinks: string[]
}

function buildLinksMd(input: PromoterPackInput): string {
  const { releaseTitle, leadTrackTitle, payload, youtubeLinks } = input
  const listen = payload.urls.listen
  const lines = [
    `# ${releaseTitle} — promoter links`,
    '',
    `Lead track: **${leadTrackTitle}**`,
    '',
    '## SERGIK listen (scrubbable waveform)',
    `- Default: ${listen}`,
    `- Instagram: ${listenUrlWithUtm(listen, 'instagram', releaseTitle)}`,
    `- TikTok / Reels: ${listenUrlWithUtm(listen, 'tiktok', releaseTitle)}`,
    `- X: ${listenUrlWithUtm(listen, 'x', releaseTitle)}`,
    `- WhatsApp / DJs: ${listenUrlWithUtm(listen, 'dj', releaseTitle)}`,
    '',
    '## Embed',
    '```html',
    payload.urls.embedHtml,
    '```',
    '',
  ]
  if (youtubeLinks.length) {
    lines.push('## YouTube visualizers', ...youtubeLinks.map((u) => `- ${u}`), '')
  }
  lines.push('---', 'Generated from SERGIK Release Studio.')
  return lines.join('\n')
}

function buildCaptionTxt(input: PromoterPackInput): string {
  const listen = listenUrlWithUtm(input.payload.urls.listen, 'promoter', input.releaseTitle)
  return [
    `New from SERGIK — ${input.releaseTitle}`,
    `▶ ${input.leadTrackTitle}`,
    '',
    `Listen & scrub the full release:`,
    listen,
    '',
    '#SERGIK #DeepNFunky #FunkyHouse #NewMusic',
  ].join('\n')
}

export async function buildReleasePromoterPackZip(
  input: PromoterPackInput,
): Promise<{ blob: Blob; filename: string }> {
  const slug = sanitizeSocialFilename(input.releaseTitle)
  const root = `${slug}-promoter-pack`
  const files: Record<string, Uint8Array> = {}

  files[`${root}/caption.txt`] = strToU8(buildCaptionTxt(input))
  files[`${root}/links.md`] = strToU8(buildLinksMd(input))
  files[`${root}/embed.html`] = strToU8(input.payload.urls.embedHtml)
  files[`${root}/README.txt`] = strToU8(
    [
      `${input.releaseTitle} — promoter pack`,
      '',
      '1. Post story/reel MP4 to IG/TikTok (add listen link sticker / bio).',
      '2. Paste caption.txt or edit to taste.',
      '3. Share UTM links from links.md per platform.',
      '4. embed.html for blogs and partner sites.',
    ].join('\n'),
  )

  const mp4Bytes = new Uint8Array(await input.storyMp4.arrayBuffer())
  files[`${root}/story/${input.storyFilename}`] = mp4Bytes

  const zipped = zipSync(files, { level: 6 })
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    filename: `${root}.zip`,
  }
}

export async function downloadReleasePromoterPack(input: PromoterPackInput): Promise<void> {
  const { blob, filename } = await buildReleasePromoterPackZip(input)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
