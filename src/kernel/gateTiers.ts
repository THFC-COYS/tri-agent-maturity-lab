import type {
  ActionClass,
  GateTier,
  ProposedAction,
  ScoreInputs,
} from './types'

/**
 * Tier scoring for the Stage 4 policy gate.
 *
 * The gate used to read only the caller-supplied risk + reversible flags.
 * It now scores four inputs (action class, reversibility, blast radius,
 * leaves-the-system) into one of three tiers:
 *
 *   Tier 1, run free. Contained, reversible work: research, drafting,
 *            internal steps.
 *   Tier 2, notify. The action proceeds, a human is notified, and the
 *            decision is written to the audit log.
 *   Tier 3, wait for a human. Blocked until a human override approves it.
 *
 * Hard floor: the classes send, pay, delete, and publish are Tier 3
 * ALWAYS. A caller cannot argue a floor class down by claiming the action
 * is reversible, low blast radius, or contained; those claims are exactly
 * what the floor exists to distrust.
 */
export const FLOOR_CLASSES: readonly ActionClass[] = [
  'send',
  'pay',
  'delete',
  'publish',
]

export interface TierScore {
  tier: GateTier
  inputs: ScoreInputs
  /** True when the hard floor forced Tier 3 regardless of the other inputs. */
  floorApplied: boolean
  reasons: string[]
}

/**
 * Fill in any scoring inputs the caller did not supply, deterministically:
 * - actionClass defaults to 'other'.
 * - blastRadius defaults from the action's risk rating (same scale).
 * - leavesSystem defaults to true for send / pay / publish (their effects
 *   land outside this system by definition) and false for every other class.
 */
export function resolveScoreInputs(action: ProposedAction): ScoreInputs {
  const actionClass: ActionClass = action.actionClass ?? 'other'
  return {
    actionClass,
    reversible: action.reversible,
    blastRadius: action.blastRadius ?? action.risk,
    leavesSystem:
      action.leavesSystem ??
      (actionClass === 'send' ||
        actionClass === 'pay' ||
        actionClass === 'publish'),
  }
}

/** Score a proposed action into a gate tier. Pure and deterministic. */
export function scoreActionTier(action: ProposedAction): TierScore {
  const inputs = resolveScoreInputs(action)
  const reasons: string[] = []

  // Hard floor first, before any other rule reads the caller's claims.
  if (FLOOR_CLASSES.includes(inputs.actionClass)) {
    reasons.push(
      `Hard floor: "${inputs.actionClass}" is a floor class (send, pay, delete, publish), so the action is Tier 3 regardless of reversible=${inputs.reversible}, blastRadius=${inputs.blastRadius}, leavesSystem=${inputs.leavesSystem}.`,
    )
    return { tier: 3, inputs, floorApplied: true, reasons }
  }

  // Legacy path: an action with NO declared class keeps the pre-tier gate
  // behavior exactly. High risk paused for review, and high risk plus
  // irreversible blocked; both were "not allowed", both are Tier 3 now.
  if (action.actionClass === undefined && action.risk === 'high') {
    reasons.push(
      'Unclassified high-risk action: Tier 3 under the legacy gate rule (high risk paused; high risk and irreversible blocked).',
    )
    return { tier: 3, inputs, floorApplied: false, reasons }
  }

  let tier: GateTier = 1

  if (inputs.leavesSystem) {
    tier = 2
    reasons.push('Leaves the system: at least Tier 2 (proceed, human notified).')
    if (!inputs.reversible) {
      tier = 3
      reasons.push('Leaves the system and is irreversible: Tier 3 (wait for a human).')
    } else if (inputs.blastRadius === 'high') {
      tier = 3
      reasons.push('Leaves the system with high blast radius: Tier 3 (wait for a human).')
    }
  }

  if (!inputs.reversible) {
    if (tier < 2) {
      tier = 2
      reasons.push('Irreversible: at least Tier 2 (proceed, human notified).')
    }
    if (inputs.blastRadius === 'high' && tier < 3) {
      tier = 3
      reasons.push('Irreversible with high blast radius: Tier 3 (wait for a human).')
    }
  }

  if (tier === 1) {
    reasons.push(
      'Contained, reversible, and no floor class applies: Tier 1 (run free).',
    )
  }

  return { tier, inputs, floorApplied: false, reasons }
}
