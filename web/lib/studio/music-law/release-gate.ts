import { auditMusicCounsel, type CounselFinding, type MusicCounselReport } from '@/lib/studio/music-law/audit'
import type { RightsPacketKind } from '@/lib/studio/rights-packets'
import type { RightsTrackLike } from '@/lib/studio/rights-ops'

export type CounselAuditRecord = {
  audited_at: string
  deal_kind: string
  severity_counts: MusicCounselReport['severityCounts']
  blockers: string[]
  memo: string
}

const KIND_TO_DEAL: Record<RightsPacketKind, string> = {
  split_sheet: 'split_sheet',
  producer_agreement: 'producer',
  collab_agreement: 'collab',
}

export function counselAuditRecord(report: MusicCounselReport, auditedAt = new Date().toISOString()): CounselAuditRecord {
  return {
    audited_at: auditedAt,
    deal_kind: report.dealKind,
    severity_counts: report.severityCounts,
    blockers: report.findings.filter((finding) => finding.severity === 'blocker').map((finding) => finding.title),
    memo: report.memo,
  }
}

export function counselGateForPacket(input: {
  text: string
  kind: RightsPacketKind | string
  tracks?: RightsTrackLike[] | null
}): { report: MusicCounselReport; blockers: CounselFinding[] } {
  const dealKind = KIND_TO_DEAL[input.kind as RightsPacketKind] || input.kind || 'unknown'
  const report = auditMusicCounsel({
    text: input.text,
    dealKind,
    tracks: input.tracks || [],
    documentLabel: String(input.kind || 'packet'),
  })
  return {
    report,
    blockers: report.findings.filter((finding) => finding.severity === 'blocker'),
  }
}

export function parseCounselAudit(raw: unknown): CounselAuditRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Partial<CounselAuditRecord>
  if (!row.audited_at || !row.memo) return null
  return {
    audited_at: String(row.audited_at),
    deal_kind: String(row.deal_kind || 'unknown'),
    severity_counts: {
      blocker: Number(row.severity_counts?.blocker || 0),
      material: Number(row.severity_counts?.material || 0),
      watch: Number(row.severity_counts?.watch || 0),
      note: Number(row.severity_counts?.note || 0),
    },
    blockers: Array.isArray(row.blockers) ? row.blockers.map((item) => String(item)) : [],
    memo: String(row.memo),
  }
}
