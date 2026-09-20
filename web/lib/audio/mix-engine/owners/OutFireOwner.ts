/**
 * OutFireOwner — fire gate + locked-media cue trust at OUT.
 */

export {
  canEnterFire,
  canEnter,
  type BlendStage,
} from '../blend-pipeline'
export { resolveFireIncomingCue } from '../alignment'
export { exactOverlapDurationSec, prearmLeadSec } from '../phrase-mix-doctrine'
export { PRE_AUDIBLE_LOCK_SEC } from '../pre-audible-nudge'
