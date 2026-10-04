import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inferSkillFromIntent } from '@/lib/ai/skills/registry'
import { formatMusicLawKnowledgeMarkdown, MUSIC_LAW_TOPICS, searchMusicLaw } from '@/lib/studio/music-law/corpus'
import { auditMusicCounsel } from '@/lib/studio/music-law/audit'
import { buildRightsPacketAuditAdminAiPrompt } from '@/lib/studio/studio-intelligence-actions'

describe('music business counsel', () => {
  it('covers a global practice set and the ingested digest', () => {
    expect(MUSIC_LAW_TOPICS.length).toBeGreaterThanOrEqual(35)
    const digest = formatMusicLawKnowledgeMarkdown()
    for (const topic of MUSIC_LAW_TOPICS) {
      expect(digest).toContain(`topic:${topic.id}`)
    }
    const onDisk = readFileSync(
      resolve(__dirname, '../../../../knowledge/music-law/GLOBAL_MUSIC_BUSINESS_LAW.md'),
      'utf8',
    )
    expect(onDisk).toContain('topic:two-copyrights')
    expect(onDisk).toContain('topic:france-moral-inalienable')
    expect(onDisk).toContain('topic:sergik-house-rules')
  })

  it('routes contract audits to counsel and checklist writes to Release Studio', () => {
    expect(inferSkillFromIntent('Audit this producer agreement for faults').id).toBe('music_business_counsel')
    expect(inferSkillFromIntent('Review the split sheet before we send it').id).toBe('music_business_counsel')
    expect(inferSkillFromIntent('Preview the copyright checklist').id).toBe('studio_release')
  })

  it('flags a combined master/composition perpetuity grant', () => {
    const report = auditMusicCounsel({
      dealKind: 'producer',
      jurisdiction: 'Arizona',
      text: `
        Producer agreement. The producer assigns the entire copyright in the composition and the master
        to the label in perpetuity, worldwide, in all media now known or hereafter devised.
        Producer is paid 3 points. This is a work made for hire. Moral rights are waived.
        The term renews automatically.
      `,
    })
    const ids = report.findings.map((finding) => finding.id)
    expect(ids).toContain('master-and-composition-one-grant')
    expect(ids).toContain('perpetual-grant')
    expect(ids).toContain('work-for-hire')
    expect(ids).toContain('future-media-grant')
    expect(ids).toContain('points-base-missing')
    expect(ids).toContain('no-audit-right')
    expect(ids).toContain('no-governing-law')
    expect(report.disclaimer).toMatch(/not legal advice/i)
    expect(report.addressPlan[0]).toMatch(/Master and composition/)
    expect(report.memo).toMatch(/Music Business Counsel memo/)
  })

  it('blocks incomplete splits, covers, and samples from Catalog', () => {
    const report = auditMusicCounsel({
      dealKind: 'split_sheet',
      tracks: [
        {
          title: 'Night Drive',
          splits: [
            { name: 'Ada Lovelace', percentage: 60, role: 'writer' },
            { name: 'Grace Hopper', percentage: 30, role: 'writer' },
          ],
          contributors: [
            { role: 'primary', name: 'Ada Lovelace' },
            { role: 'featured', name: 'Grace Hopper' },
          ],
          writer_legal_names: 'Ada Lovelace',
          contains_samples: true,
          origin: 'cover',
          mechanical_licensed: false,
          isrc_full: '',
        },
      ],
    })
    const ids = report.findings.map((finding) => finding.id)
    expect(ids.some((id) => id.startsWith('splits-'))).toBe(true)
    expect(ids.some((id) => id.startsWith('samples-'))).toBe(true)
    expect(ids.some((id) => id.startsWith('cover-mechanical-'))).toBe(true)
    expect(ids.some((id) => id.startsWith('collab-single-owner-'))).toBe(false)
    expect(report.severityCounts.blocker).toBeGreaterThanOrEqual(3)
  })

  it('blocks a GEMA exclusive publishing grab and a distributor-as-owner clause', () => {
    const gema = auditMusicCounsel({
      dealKind: 'publishing',
      text: 'Administration agreement. Writer is a GEMA member and exclusively assigns publishing and sync for the world, irrevocably, in perpetuity. GEMA shall not interfere.',
    })
    expect(gema.findings.map((finding) => finding.id)).toContain('gema-exclusive-conflict')

    const distro = auditMusicCounsel({
      dealKind: 'distribution',
      text: 'DistroKid is the copyright owner of the master and may collect all income.',
    })
    expect(distro.findings.map((finding) => finding.id)).toContain('distributor-as-owner')
  })

  it('finds France and GEMA cards from a question', () => {
    const hits = searchMusicLaw('GEMA moral rights France waiver', 4).map((topic) => topic.id)
    expect(hits).toContain('germany-gema-treuhand')
    expect(hits).toContain('france-moral-inalienable')
  })

  it('opens packet audit on the counsel agent', () => {
    const prompt = buildRightsPacketAuditAdminAiPrompt({
      releaseId: 'rel-1',
      releaseTitle: 'Night Drive',
      packetLabel: 'Producer agreement',
      packetKind: 'producer_agreement',
      packetText: 'short draft',
    })
    expect(prompt.agentMode).toBe('music_business_counsel')
    expect(prompt.message).toContain('audit_music_contract')
    expect(prompt.message).toContain('producer')
    expect(prompt.message).toMatch(/not a lawyer/i)
  })
})
