import { namesForRole, parseContributors } from '@/lib/studio/track-credits'
import { seedWriterLegalRows } from '@/lib/studio/songwriter'
import { normalizeSplitRows, splitsAreSided } from '@/lib/studio/import-parse'
import {
  clearanceOnFile,
  parseTrackClearance,
  summarizeSplits,
  type RightsTrackLike,
} from '@/lib/studio/rights-ops'
import {
  MUSIC_LAW_DISCLAIMER,
  getMusicLawTopic,
  searchMusicLaw,
  type MusicLawTopic,
} from '@/lib/studio/music-law/corpus'

export type MusicDealKind =
  | 'split_sheet'
  | 'producer'
  | 'collab'
  | 'featured_artist'
  | 'publishing'
  | 'distribution'
  | 'sync'
  | 'sample'
  | 'session'
  | 'unknown'

export type CounselSeverity = 'blocker' | 'material' | 'watch' | 'note'

export type CounselFinding = {
  id: string
  severity: CounselSeverity
  topicId: string
  title: string
  issue: string
  whyItMatters: string
  address: string
}

export type MusicCounselReport = {
  disclaimer: string
  dealKind: MusicDealKind
  jurisdictionNotes: string[]
  findings: CounselFinding[]
  severityCounts: Record<CounselSeverity, number>
  knowledgeHits: Array<Pick<MusicLawTopic, 'id' | 'title' | 'regions' | 'summary'>>
  addressPlan: string[]
  memo: string
}

const SEVERITY_ORDER: CounselSeverity[] = ['blocker', 'material', 'watch', 'note']

function clean(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function inferMusicDealKind(text: string, hinted?: string | null): MusicDealKind {
  const hint = clean(hinted).toLowerCase().replace(/[\s-]+/g, '_')
  const allowed: MusicDealKind[] = [
    'split_sheet',
    'producer',
    'collab',
    'featured_artist',
    'publishing',
    'distribution',
    'sync',
    'sample',
    'session',
    'unknown',
  ]
  if (allowed.includes(hint as MusicDealKind)) return hint as MusicDealKind
  const t = text.toLowerCase()
  if (/split sheet|ownership:|writer share/.test(t)) return 'split_sheet'
  if (/producer agreement|producer points|\bbuyout\b/.test(t)) return 'producer'
  if (/collab agreement|collaboration agreement/.test(t)) return 'collab'
  if (/featured artist|featuring agreement/.test(t)) return 'featured_artist'
  if (/publishing admin|co-publishing|copublishing|administration agreement/.test(t)) return 'publishing'
  if (/sync|synchroni[sz]/.test(t)) return 'sync'
  if (/sample licen[sc]e|interpolation/.test(t)) return 'sample'
  if (/session musician|sideman/.test(t)) return 'session'
  if (/distrokid|aggregat|distribution agreement/.test(t)) return 'distribution'
  return 'unknown'
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

function push(findings: CounselFinding[], finding: CounselFinding) {
  if (findings.some((row) => row.id === finding.id)) return
  findings.push(finding)
}

function auditProse(text: string, dealKind: MusicDealKind): CounselFinding[] {
  const findings: CounselFinding[] = []
  const raw = text.trim()
  if (raw.length < 40) return findings
  const longForm = raw.length > 280

  const grantsBoth =
    /all rights in the (song|composition|musical work) and the (recording|master)/i.test(raw) ||
    /assign(?:s|ed)?\s+(?:the\s+)?(?:entire\s+)?copyright in (?:both )?the (?:composition|song) and (?:the )?(?:master|recording)/i.test(raw)
  if (grantsBoth) {
    push(findings, {
      id: 'master-and-composition-one-grant',
      severity: 'blocker',
      topicId: 'two-copyrights',
      title: 'Master and composition granted together',
      issue: 'The draft moves the musical work and the sound recording in one grant.',
      whyItMatters: 'They are different copyrights with different owners, societies, and terms.',
      address: 'Split the grant into a composition clause and a master clause, each with its own owner, term, and reserved rights.',
    })
  }

  const perpetuity = /in perpetuity|forever and ever|for all time|life of copyright plus/i.test(raw)
  const ownershipSheet = dealKind === 'split_sheet'
  if (perpetuity && !ownershipSheet) {
    push(findings, {
      id: 'perpetual-grant',
      severity: 'material',
      topicId: 'term-of-protection',
      title: 'Perpetual or life-of-copyright grant',
      issue: 'The draft grants rights in perpetuity or for the life of copyright plus extensions.',
      whyItMatters:
        'Long grants are hard to exit. In the United States, author grants can raise a termination review, and work-for-hire labeling changes that analysis. Other countries limit broad assignments.',
      address: 'Replace perpetuity with a defined term and a reversion. If a US author is assigning, flag 17 USC 203 for counsel rather than adding a waiver of termination.',
    })
  }

  if (/work[\s-]*made[\s-]*for[\s-]*hire|work[\s-]*for[\s-]*hire/i.test(raw)) {
    push(findings, {
      id: 'work-for-hire',
      severity: 'material',
      topicId: 'work-made-for-hire',
      title: 'Work-made-for-hire language',
      issue: 'The draft uses work-for-hire ownership.',
      whyItMatters:
        'US for-hire status is limited to employees or signed commissions in statutory categories. It is a poor fit for independent producers and featured artists, and it is not how France, Germany, or the UK transfer copyright.',
      address: 'Use an assignment or exclusive license that states it applies only if for-hire status fails, and name who owns the master versus the composition.',
    })
  }

  if (/hereafter devised|now known or later|all media now known|future technologies/i.test(raw)) {
    push(findings, {
      id: 'future-media-grant',
      severity: 'material',
      topicId: 'ai-training-rights',
      title: 'Open-ended future-media grant',
      issue: 'The grant covers media and technologies not yet named.',
      whyItMatters: 'Buyers read this as AI training, voice cloning, and new platform rights, not only streaming.',
      address: 'List the allowed uses. Reserve model training, synthetic voice, and likeness unless they are priced and limited.',
    })
  }

  if (/train(?:ing)?\s+(?:of\s+)?(?:ai|machine learning|models?)|voice clon|synthetic vocal/i.test(raw) && /assign|grant|licen[sc]e|consent/i.test(raw)) {
    push(findings, {
      id: 'ai-training-granted',
      severity: 'material',
      topicId: 'ai-training-rights',
      title: 'AI training or voice-clone grant',
      issue: 'The draft affirmatively allows training or synthetic use of the performance or recording.',
      whyItMatters: 'That is a separate exploitation from distribution, and voice rights are not the same as the master copyright.',
      address: 'Keep the grant only if the fee, territory, term, and whether new outputs are owned are written. Otherwise strike it.',
    })
  }

  if (/waiv\w+[^.]{0,80}moral rights/i.test(raw) || /moral rights[^.]{0,80}waiv/i.test(raw)) {
    const france = /france|french|sacem/i.test(raw)
    push(findings, {
      id: 'moral-rights-waiver',
      severity: france ? 'blocker' : 'watch',
      topicId: france ? 'france-moral-inalienable' : 'credits-and-moral-attribution',
      title: france ? 'Moral-rights waiver aimed at France' : 'Moral-rights waiver',
      issue: france
        ? 'The draft waives moral rights in a document that mentions France or SACEM.'
        : 'The draft waives moral rights.',
      whyItMatters: france
        ? 'French author moral rights are inalienable. A waiver line does not remove them.'
        : 'Waivers can work in the UK and Canada when they are express, and they do little for US musical works. They do not work as written in France, and German moral rights are not freely disposable.',
      address: 'Limit any waiver to countries where a waiver is effective, keep a credit obligation, and send French or German authors to local counsel.',
    })
  }

  const statesTerm = /\b(in perpetuity|term of|for the term|for \d+ (?:year|month)s?|until \d{4}|expires on)\b/i.test(raw)
  const blankTerm = /term:\s*_{3,}/i.test(raw)
  if (dealKind !== 'split_sheet' && longForm && !statesTerm && !blankTerm) {
    push(findings, {
      id: 'no-defined-term',
      severity: 'material',
      topicId: 'clause-checklist',
      title: 'No defined term',
      issue: 'The draft grants rights and does not say when the grant ends.',
      whyItMatters: 'A worldwide distribution or producer consent with no end date reads as an open-ended license.',
      address: 'Add a term (or a clear life-of-copyright sale, if that is the price) and what reverts when it ends, including who keeps the ISRC.',
    })
  }

  if (/Term:\s*_{3,}|Territory:\s*_{3,}|Governing law:\s*_{3,}|Forum:\s*_{3,}|the base is\s*_{3,}/i.test(raw)) {
    push(findings, {
      id: 'unfilled-blanks',
      severity: 'blocker',
      topicId: 'clause-checklist',
      title: 'Blank deal terms',
      issue: 'The draft still has unfilled blanks.',
      whyItMatters: 'A blank term, territory, royalty base, or governing law is not an agreed contract.',
      address: 'Fill every blank from the parties’ deal, then send the completed draft to a lawyer admitted in that jurisdiction before anyone signs.',
    })
  }

  if (dealKind !== 'split_sheet' && longForm && !/governing law|governed by the laws|this agreement is governed/i.test(raw)) {
    push(findings, {
      id: 'no-governing-law',
      severity: 'material',
      topicId: 'dispute-governing-law',
      title: 'No governing law',
      issue: 'The draft never chooses a governing law.',
      whyItMatters: 'Forum fights and mandatory local copyright rules fill the gap, especially on cross-border features.',
      address: 'Add governing law, forum or a named arbitration seat, and which language controls.',
    })
  }

  if (longForm && !/territor|worldwide|universe|united states|europe|germany|france|united kingdom|canada|japan|australia/i.test(raw)) {
    push(findings, {
      id: 'no-territory',
      severity: 'material',
      topicId: 'clause-checklist',
      title: 'No territory',
      issue: 'The draft does not name a territory.',
      whyItMatters: 'Worldwide is a commercial choice with society consequences. Silence is worse.',
      address: 'State the territory and carve out countries where a society already holds the rights.',
    })
  }

  if (
    /cross[-\s]?collateral/i.test(raw) &&
    !/no cross[-\s]?collateral|without cross[-\s]?collateral|not cross[-\s]?collateral/i.test(raw)
  ) {
    push(findings, {
      id: 'cross-collateral',
      severity: 'material',
      topicId: 'accounting-audit-recoupment',
      title: 'Cross-collateralization',
      issue: 'Losses or unrecouped balances can be charged across projects or income streams.',
      whyItMatters: 'A failed release or a publishing advance can eat master royalties, or the reverse.',
      address: 'Strike it or confine it to one named recording and one named cost list.',
    })
  }

  if (/controlled composition/i.test(raw)) {
    push(findings, {
      id: 'controlled-composition',
      severity: 'material',
      topicId: 'deal-red-flags',
      title: 'Controlled-composition clause',
      issue: 'Mechanicals on compositions the artist controls are reduced or capped.',
      whyItMatters: 'Writer and publisher income drops below the rate the parties think they registered.',
      address: 'Delete the clause or set the rate at the full statutory or agreed mechanical, with no free-goods or cap reduction.',
    })
  }

  if (/\b360\b|touring income|merchandise income|merch income|sponsorship income/i.test(raw)) {
    push(findings, {
      id: 'three-sixty',
      severity: 'material',
      topicId: 'three-sixty-and-likeness',
      title: 'Income beyond the recording',
      issue: 'The draft reaches touring, merch, sponsorship, or a 360 share.',
      whyItMatters: 'Those are not included in a normal master license or producer agreement unless priced.',
      address: 'Remove non-record income, or give each stream a rate, a base, and an expense cap.',
    })
  }

  if (/name[, ]+image[, ]+and likeness|right of publicity/i.test(raw) && perpetuity) {
    push(findings, {
      id: 'perpetual-likeness',
      severity: 'material',
      topicId: 'three-sixty-and-likeness',
      title: 'Perpetual name-and-likeness grant',
      issue: 'Name, image, and likeness are granted without an end date.',
      whyItMatters: 'Publicity rights are separate from the master and should be limited to the campaign.',
      address: 'License likeness only to advertise the named recordings, for a stated term, with no right to sell it on.',
    })
  }

  if (dealKind !== 'split_sheet' && /royalt|net receipts|net profits|points/.test(raw.toLowerCase())) {
    if (!/audit|inspect the books|accounting statement/i.test(raw)) {
      push(findings, {
        id: 'no-audit-right',
        severity: 'material',
        topicId: 'accounting-audit-recoupment',
        title: 'Royalty deal without an audit right',
        issue: 'Money is promised and the payee cannot inspect the account.',
        whyItMatters: 'Net receipts and points are unauditable numbers without a lookback and a statement calendar.',
        address: 'Add semi-annual statements, a payment window, and an audit right with a lookback of at least two years.',
      })
    }
    if (/net receipts|net profits/i.test(raw) && !/net receipts means|net profits means|defined as/i.test(raw)) {
      push(findings, {
        id: 'net-undefined',
        severity: 'material',
        topicId: 'accounting-audit-recoupment',
        title: '“Net” is not defined',
        issue: 'The royalty base is net receipts or net profits without a definition.',
        whyItMatters: 'Off-the-top fees can reduce the royalty to zero.',
        address: 'Define every deduction. Prefer a percentage of a named amount (for example artist net or a master-side share) over an open net.',
      })
    }
  }

  if (/distrokid|identifyy|cdbaby|tunecore/i.test(raw) && /owns the (master|copyright|recording)|copyright owner/i.test(raw)) {
    push(findings, {
      id: 'distributor-as-owner',
      severity: 'blocker',
      topicId: 'distribution-not-ownership',
      title: 'Distributor written as copyright owner',
      issue: 'An aggregator or Content ID vendor is named as the owner.',
      whyItMatters: 'SERGIK delivery is a license to distribute. Dual Content ID enrollment conflicts with the first-party UGC pack.',
      address: 'Name the artist or the signed assignee as owner. Keep the distributor as a delivery vendor. Keep UGC partner = SERGIK.',
    })
  }

  if (/sample|interpolat/i.test(raw) && /warrant(?:s|y)? that .{0,40}original|no samples|does not contain samples/i.test(raw) && /contains a sample|includes a sample|uncleared/i.test(raw)) {
    push(findings, {
      id: 'sample-warranty-conflict',
      severity: 'blocker',
      topicId: 'samples-and-interpolations',
      title: 'Originality warranty conflicts with a sample',
      issue: 'The draft both admits a sample and warrants that the recording is sample-free.',
      whyItMatters: 'Distributors, sync supervisors, and Content ID disputes treat that as a broken chain of title.',
      address: 'Attach the master license and the composition license, or remove the recording from the release.',
    })
  }

  if (dealKind === 'sync' && !/master[- ]use|sound recording licen/i.test(raw)) {
    push(findings, {
      id: 'sync-missing-master',
      severity: 'blocker',
      topicId: 'sync-both-sides',
      title: 'Sync grant without a master license',
      issue: 'A synchronization deal does not also license the sound recording.',
      whyItMatters: 'Picture uses need both copyrights unless the producer is making a new recording they already own.',
      address: 'Add a master-use grant with its own fee, or state that the licensee will record a new master and owns that new master only.',
    })
  }

  if (dealKind === 'producer' && /\bpoints?\b/i.test(raw) && !/ppd|published price|wholesale|net receipts|artist net|master royalties/i.test(raw)) {
    push(findings, {
      id: 'points-base-missing',
      severity: 'material',
      topicId: 'producer-points-vs-buyout',
      title: 'Producer points have no base',
      issue: 'Points are stated without PPD, net receipts, artist net, or another defined base.',
      whyItMatters: '“3 points” is not a royalty until the base and the recoupment rule exist.',
      address: 'Define the base, when points are calculated, and whether the fee recoups against them.',
    })
  }

  if (
    (dealKind === 'publishing' || /administration agreement|co-publishing/i.test(raw)) &&
    /in perpetuity|irrevocable/i.test(raw)
  ) {
    push(findings, {
      id: 'perpetual-admin',
      severity: 'material',
      topicId: 'publishing-admin-vs-copub',
      title: 'Publishing deal does not end',
      issue: 'Admin or co-publishing is irrevocable or perpetual.',
      whyItMatters: 'Admin is a service. A perpetual copyright assignment is a sale and should be priced as one.',
      address: 'Set a term, a post-term collection window, and what copyright and registrations revert.',
    })
  }

  if (has(raw, /gema/i) && /exclusive(?:ly)?\s+(?:\w+\s+){0,6}(?:publishing|synchroni[sz]|assignment)/i.test(raw)) {
    push(findings, {
      id: 'gema-exclusive-conflict',
      severity: 'blocker',
      topicId: 'germany-gema-treuhand',
      title: 'Exclusive grant may conflict with GEMA',
      issue: 'The draft takes an exclusive publishing or sync grant and mentions GEMA.',
      whyItMatters: 'GEMA members already place performing and mechanical rights with GEMA.',
      address: 'Carve out rights held by GEMA and have German counsel read the grant before anyone signs.',
    })
  }

  if (longForm && /indemnif/i.test(raw) && !/mutual|each party shall indemnify/i.test(raw)) {
    push(findings, {
      id: 'one-way-indemnity',
      severity: 'watch',
      topicId: 'deal-red-flags',
      title: 'One-way indemnity',
      issue: 'Indemnity runs only one direction.',
      whyItMatters: 'Uncapped one-way indemnities shift the other party’s mistakes, including sample and credit errors, onto the artist.',
      address: 'Make indemnity mutual, exclude the other party’s negligence, and consider a cap tied to amounts paid under the deal.',
    })
  }

  if (longForm && /automatic(?:ally)? renew|successive option/i.test(raw) && !/\d+\s+days['’]? notice|notice of non-renewal/i.test(raw)) {
    push(findings, {
      id: 'autorenew-no-notice',
      severity: 'watch',
      topicId: 'deal-red-flags',
      title: 'Renewal or option without a notice window',
      issue: 'The term extends automatically and the draft does not give a notice period.',
      whyItMatters: 'Options are how short deals become long ones.',
      address: 'Require written notice a stated number of days before renewal, and cap the number of options.',
    })
  }

  return findings
}

function auditCatalog(tracks: RightsTrackLike[], dealKind: MusicDealKind): CounselFinding[] {
  const findings: CounselFinding[] = []
  if (!tracks.length) return findings

  for (const track of tracks) {
    const title = clean(track.title) || 'Untitled'
    const summary = summarizeSplits(track.splits)
    if (!summary.ok) {
      push(findings, {
        id: `splits-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        severity: 'blocker',
        topicId: 'split-sheet-practice',
        title: `Splits incomplete on ${title}`,
        issue: summary.total == null ? `${title} has no split rows.` : `${title} splits total ${summary.total}%, not 100% (${summary.label}).`,
        whyItMatters: 'Societies and DSPs will not pay a sheet that does not total the copyright it describes.',
        address: 'Complete Catalog splits to 100% with legal names before sending the packet. Do not invent percentages.',
      })
    }

    const writers = seedWriterLegalRows(track.contributors, track.writer_legal_names)
    const missingLegal = writers.filter((row) => row.stage && !row.legal)
    if (missingLegal.length) {
      push(findings, {
        id: `legal-name-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
        severity: 'material',
        topicId: 'split-sheet-practice',
        title: `Legal name missing on ${title}`,
        issue: `Stage name only for ${missingLegal.map((row) => row.stage).join(', ')}.`,
        whyItMatters: 'PROs, The MLC, and Apple songwriter fields match legal names and IPI numbers, not stage names.',
        address: 'Fill writer legal names in Catalog. SERGIK’s songwriter legal name on file is Jordan Caboga.',
      })
    }

    if (!clean(track.isrc_full)) {
      push(findings, {
        id: `isrc-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
        severity: 'watch',
        topicId: 'sergik-house-rules',
        title: `ISRC missing on ${title}`,
        issue: 'The recording has no ISRC on the Catalog row.',
        whyItMatters: 'Neighboring rights, Content ID, and distributor moves all key off the ISRC. SERGIK codes use prefix QTA53.',
        address: 'Assign an ISRC in Catalog before the packet is treated as final. Do not let a distributor mint a second code for the same master.',
      })
    }

    const sampleCleared =
      clearanceOnFile(track.clearance?.sample_master) && clearanceOnFile(track.clearance?.sample_composition)
    if (track.contains_samples && !sampleCleared) {
      push(findings, {
        id: `samples-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
        severity: 'blocker',
        topicId: 'samples-and-interpolations',
        title: `Sample flag on ${title}`,
        issue: 'Catalog marks this recording as containing samples.',
        whyItMatters: 'A sample needs a master license and, if the composition is copied, a composition license. A warranty of originality does not replace either.',
        address: 'Attach both licenses or clear the sample flag only when the recording truly has none.',
      })
    }

    const mechanicalOnFile = track.mechanical_licensed === true || clearanceOnFile(track.clearance?.mechanical)
    if (clean(track.origin).toLowerCase() === 'cover' && !mechanicalOnFile) {
      push(findings, {
        id: `cover-mechanical-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
        severity: 'blocker',
        topicId: 'us-mechanical-mlc',
        title: `Cover mechanical open on ${title}`,
        issue: 'The track is marked as a cover and the mechanical license is not confirmed.',
        whyItMatters: 'A new master of someone else’s composition still needs a mechanical path. DSP delivery does not create that license.',
        address: 'Confirm the mechanical (direct or blanket) and the original writer metadata before release.',
      })
    }

    const sided = splitsAreSided(normalizeSplitRows(track.splits))
    if (sided) {
      const composition = normalizeSplitRows(track.splits).filter((row) => row.copyright === 'composition' && row.name)
      const missingPro = composition.filter((row) => !row.pro || !row.ipi)
      if (missingPro.length) {
        push(findings, {
          id: `pro-ipi-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
          severity: 'material',
          topicId: 'collection-society-conflicts',
          title: `PRO or IPI missing on ${title}`,
          issue: `Composition table is missing a PRO or IPI for ${missingPro.map((row) => row.name).join(', ')}.`,
          whyItMatters: 'Societies match writer shares on IPI numbers and PRO affiliation, not stage names.',
          address: 'Add PRO and IPI on each composition row. Leave neighboring-rights registration on the master, not this table.',
        })
      }
    }

    const contributors = parseContributors(track.contributors)
    const primary = namesForRole(contributors, 'primary')
    const featured = namesForRole(contributors, 'featured')
    const collabBilled = primary.length > 1 || featured.length > 0
    if (collabBilled && summary.ok && summary.names.length === 1) {
      push(findings, {
        id: `collab-single-owner-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
        severity: 'blocker',
        topicId: 'split-sheet-practice',
        title: `Collab billed but one owner on ${title}`,
        issue: `${title} bills ${[...primary, ...featured].join(', ')} and the split names only ${summary.names[0]}.`,
        whyItMatters: 'A SERGIK-only sheet on a billed collaboration is not a valid collab split.',
        address: 'Seed shares from the billed parties in Catalog, then confirm the numbers with them. Do not leave a 100% single-party sheet in place.',
      })
    }
  }

  if ((dealKind === 'split_sheet' || dealKind === 'collab' || dealKind === 'unknown') && tracks.length) {
    push(findings, {
      id: 'composition-vs-master-tables',
      severity: 'note',
      topicId: 'two-copyrights',
      title: 'Keep two ownership tables',
      issue: 'Confirm the packet states composition shares and master shares separately.',
      whyItMatters: 'Writer PRO income and master/SoundExchange/neighboring income are different payments.',
      address: 'If the sheet has one percentage column, label which copyright it divides before anyone signs.',
    })
  }

  return findings
}

function jurisdictionNotes(text: string, hinted?: string | null): string[] {
  const blob = `${hinted || ''}\n${text}`.toLowerCase()
  const notes: string[] = []
  const add = (label: string, topicId: string) => {
    const topic = getMusicLawTopic(topicId)
    if (!topic) return
    notes.push(`${label}: ${topic.summary}`)
  }
  if (/france|sacem|french/.test(blob)) add('France', 'france-moral-inalienable')
  if (/germany|gema|gvl|german/.test(blob)) add('Germany', 'germany-gema-treuhand')
  if (/united kingdom|england|\buk\b|prs for music|\bppl\b/.test(blob)) add('United Kingdom', 'uk-cdpa-prs-ppl')
  if (/canada|socan|re:sound|resound/.test(blob)) add('Canada', 'canada-socan-resound')
  if (/australia|apra|ppca|new zealand/.test(blob)) add('Australia / New Zealand', 'australia-apra-ppca')
  if (/japan|jasrac|nextone/.test(blob)) add('Japan', 'japan-jasrac')
  if (/korea|komca/.test(blob)) add('Korea', 'korea-komca')
  if (/mexico|sacm|brazil|ecad|ubc|argentina|sadaic|colombia|sayco|spain|sgae|chile|scd/.test(blob)) add('Spain / Latin America', 'latam-cmos')
  if (/south africa|samro|nigeria|kenya/.test(blob)) add('Africa', 'africa-cmos-caution')
  if (/united states|arizona|\busa\b|u\.s\.|ascap|bmi|soundexchange|the mlc/.test(blob) || !notes.length) {
    add('United States (SERGIK home base)', 'us-copyright-act')
  }
  return notes.slice(0, 4)
}

function toHits(topics: MusicLawTopic[]) {
  return topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    regions: topic.regions,
    summary: topic.summary,
  }))
}

function buildMemo(report: Omit<MusicCounselReport, 'memo' | 'addressPlan' | 'knowledgeHits'> & { addressPlan: string[] }): string {
  const lines = [
    '# Music Business Counsel memo',
    '',
    report.disclaimer,
    '',
    `Deal type reviewed: ${report.dealKind.replace(/_/g, ' ')}.`,
    '',
    '## Address first',
    ...(report.addressPlan.length ? report.addressPlan.map((step, index) => `${index + 1}. ${step}`) : ['No catalog or contract defects were detected in the text provided.']),
    '',
    '## Findings',
  ]
  if (!report.findings.length) {
    lines.push('None.')
  } else {
    for (const finding of report.findings) {
      lines.push(`- **${finding.severity.toUpperCase()}** ${finding.title} — ${finding.issue} Address: ${finding.address} _(${finding.topicId})_`)
    }
  }
  if (report.jurisdictionNotes.length) {
    lines.push('', '## Jurisdiction notes', ...report.jurisdictionNotes.map((note) => `- ${note}`))
  }
  lines.push('', 'Do not change Catalog percentages or parties unless Catalog data contradicts the draft. Do not mark copyright checklist items true from this memo.')
  return lines.join('\n')
}

export function tracksForCounsel(rows: Array<Record<string, unknown>> | null | undefined): RightsTrackLike[] {
  if (!rows?.length) return []
  return rows.map((row) => ({
    id: clean(row.id),
    title: clean(row.title),
    contributors: row.contributors,
    splits: row.splits,
    iswc: row.iswc != null ? String(row.iswc) : null,
    isrc_full: row.isrc_full != null ? String(row.isrc_full) : null,
    publisher_name: row.publisher_name != null ? String(row.publisher_name) : null,
    publisher_ipi: row.publisher_ipi != null ? String(row.publisher_ipi) : null,
    origin: row.origin != null ? String(row.origin) : null,
    cover_original_title: row.cover_original_title != null ? String(row.cover_original_title) : null,
    cover_original_artist: row.cover_original_artist != null ? String(row.cover_original_artist) : null,
    writer_legal_names: row.writer_legal_names != null ? String(row.writer_legal_names) : null,
    mechanical_licensed: typeof row.mechanical_licensed === 'boolean' ? row.mechanical_licensed : null,
    contains_samples: typeof row.contains_samples === 'boolean' ? row.contains_samples : null,
    clearance: parseTrackClearance(
      row.clearance ??
        (row.sonic_snapshot && typeof row.sonic_snapshot === 'object'
          ? (row.sonic_snapshot as { clearance?: unknown }).clearance
          : null),
    ),
  }))
}

export function auditMusicCounsel(input: {
  text?: string | null
  dealKind?: string | null
  jurisdiction?: string | null
  question?: string | null
  tracks?: RightsTrackLike[] | null
  documentLabel?: string | null
}): MusicCounselReport {
  const text = clean(input.text)
  const dealKind = inferMusicDealKind(`${input.question || ''}\n${text}`, input.dealKind)
  const findings = [
    ...auditCatalog(input.tracks || [], dealKind),
    ...auditProse(input.documentLabel ? `${input.documentLabel}\n${text}` : text, dealKind),
  ].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))

  const severityCounts: Record<CounselSeverity, number> = { blocker: 0, material: 0, watch: 0, note: 0 }
  for (const finding of findings) severityCounts[finding.severity] += 1

  const topicIds = findings.map((finding) => finding.topicId)
  const fromFindings = topicIds
    .map((id) => getMusicLawTopic(id))
    .filter((topic): topic is MusicLawTopic => Boolean(topic))
  const fromQuestion = input.question?.trim() ? searchMusicLaw(input.question, 4) : []
  const knowledgeHits = toHits(
    [...fromFindings, ...fromQuestion].filter((topic, index, all) => all.findIndex((row) => row.id === topic.id) === index).slice(0, 8),
  )

  const addressPlan = findings
    .filter((finding) => finding.severity === 'blocker' || finding.severity === 'material')
    .map((finding) => `${finding.title}: ${finding.address}`)
    .slice(0, 12)

  const jurisdiction = jurisdictionNotes(`${input.jurisdiction || ''}\n${input.question || ''}\n${text}`, input.jurisdiction)
  const partial = {
    disclaimer: MUSIC_LAW_DISCLAIMER,
    dealKind,
    jurisdictionNotes: jurisdiction,
    findings,
    severityCounts,
    addressPlan,
  }
  return {
    ...partial,
    knowledgeHits,
    memo: buildMemo(partial),
  }
}

export function mergeCounselReports(reports: MusicCounselReport[]): MusicCounselReport {
  const usable = reports.filter(Boolean)
  if (!usable.length) {
    return auditMusicCounsel({})
  }
  const findings: CounselFinding[] = []
  for (const report of usable) {
    for (const finding of report.findings) push(findings, finding)
  }
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  const severityCounts: Record<CounselSeverity, number> = { blocker: 0, material: 0, watch: 0, note: 0 }
  for (const finding of findings) severityCounts[finding.severity] += 1
  const addressPlan = findings
    .filter((finding) => finding.severity === 'blocker' || finding.severity === 'material')
    .map((finding) => `${finding.title}: ${finding.address}`)
    .slice(0, 12)
  const knowledgeHits = usable
    .flatMap((report) => report.knowledgeHits)
    .filter((topic, index, all) => all.findIndex((row) => row.id === topic.id) === index)
    .slice(0, 8)
  const jurisdictionNotes = usable
    .flatMap((report) => report.jurisdictionNotes)
    .filter((note, index, all) => all.indexOf(note) === index)
    .slice(0, 4)
  const dealKind = usable.find((report) => report.dealKind !== 'unknown')?.dealKind || usable[0]!.dealKind
  const partial = {
    disclaimer: MUSIC_LAW_DISCLAIMER,
    dealKind,
    jurisdictionNotes,
    findings,
    severityCounts,
    addressPlan,
  }
  return { ...partial, knowledgeHits, memo: buildMemo(partial) }
}
