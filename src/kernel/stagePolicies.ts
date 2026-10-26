import type {
  MaturityStage,
  ProposedAction,
  AgentRole,
  GateTier,
  ScoreInputs,
} from './types'
import { scoreActionTier } from './gateTiers'

export interface StagePolicy {
  stage: MaturityStage
  /** Max agents that may act in a run. */
  maxAgents: number
  /** Whether stub tools may be invoked. */
  allowTools: boolean
  /** Whether orchestrator may coordinate multiple specialists. */
  multiAgent: boolean
  /** Whether a policy gate runs before final action. */
  requirePolicyGate: boolean
  /** Whether human override is required before final action. */
  requireHumanOverride: boolean
  /** Whether an audit log entry is written for decisions. */
  auditEnabled: boolean
  /** Roles allowed to participate. */
  allowedRoles: AgentRole[]
}

export const STAGE_POLICIES: Record<MaturityStage, StagePolicy> = {
  1: {
    stage: 1,
    maxAgents: 1,
    allowTools: false,
    multiAgent: false,
    requirePolicyGate: false,
    requireHumanOverride: false,
    auditEnabled: false,
    allowedRoles: ['assistant'],
  },
  2: {
    stage: 2,
    maxAgents: 1,
    allowTools: true,
    multiAgent: false,
    requirePolicyGate: false,
    requireHumanOverride: false,
    auditEnabled: false,
    allowedRoles: ['planner'],
  },
  3: {
    stage: 3,
    maxAgents: 3,
    allowTools: true,
    multiAgent: true,
    requirePolicyGate: false,
    requireHumanOverride: false,
    auditEnabled: false,
    allowedRoles: ['researcher', 'planner', 'executor'],
  },
  4: {
    stage: 4,
    maxAgents: 3,
    allowTools: true,
    multiAgent: true,
    requirePolicyGate: true,
    requireHumanOverride: true,
    auditEnabled: true,
    allowedRoles: ['researcher', 'planner', 'executor'],
  },
}

export function getPolicy(stage: MaturityStage): StagePolicy {
  return STAGE_POLICIES[stage]
}

export interface PolicyGateResult {
  /**
   * Whether the action may proceed without waiting for a human. Tier 3
   * returns false, matching the gate's long-standing "paused for override"
   * meaning; Tier 1 and Tier 2 return true.
   */
  allowed: boolean
  reason: string
  tier: GateTier
  inputs: ScoreInputs
  floorApplied: boolean
}

/**
 * Deterministic tiered gate used at Stage 4. Scoring lives in
 * scoreActionTier (gateTiers.ts); this wraps the tier in the gate's
 * allowed / blocked contract.
 */
export function evaluatePolicyGate(action: ProposedAction): PolicyGateResult {
  const score = scoreActionTier(action)
  const scored = {
    tier: score.tier,
    inputs: score.inputs,
    floorApplied: score.floorApplied,
  }

  if (score.tier === 3) {
    if (score.floorApplied) {
      return {
        ...scored,
        allowed: false,
        reason: `Tier 3 (hard floor): "${score.inputs.actionClass}" actions always wait for a human at the Stage 4 gate. Floor classes (send, pay, delete, publish) cannot be argued down by scoring inputs.`,
      }
    }
    if (action.actionClass === undefined && action.risk === 'high' && !action.reversible) {
      return {
        ...scored,
        allowed: false,
        reason: 'Tier 3: high-risk irreversible actions require human override (Stage 4 gate).',
      }
    }
    if (action.actionClass === undefined && action.risk === 'high') {
      return {
        ...scored,
        allowed: false,
        reason: 'Tier 3: high-risk actions are paused for human review under Stage 4 policy.',
      }
    }
    return {
      ...scored,
      allowed: false,
      reason: `Tier 3: ${score.reasons[score.reasons.length - 1]}`,
    }
  }

  if (score.tier === 2) {
    return {
      ...scored,
      allowed: true,
      reason:
        'Tier 2 (notify): action proceeds within the policy envelope; a human is notified and the decision is audit-logged.',
    }
  }

  return {
    ...scored,
    allowed: true,
    reason:
      'Tier 1 (run free): action within automated policy envelope (contained, reversible, no floor class).',
  }
}
