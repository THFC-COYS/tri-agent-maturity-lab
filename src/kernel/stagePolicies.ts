import type {
  MaturityStage,
  ProposedAction,
  AgentRole,
} from './types'

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

/** Deterministic risk gate used at Stage 4. */
export function evaluatePolicyGate(action: ProposedAction): {
  allowed: boolean
  reason: string
} {
  if (action.risk === 'high' && !action.reversible) {
    return {
      allowed: false,
      reason: 'High-risk irreversible actions require human override (Stage 4 gate).',
    }
  }
  if (action.risk === 'high') {
    return {
      allowed: false,
      reason: 'High-risk actions are paused for human review under Stage 4 policy.',
    }
  }
  return {
    allowed: true,
    reason: 'Action within automated policy envelope (low/medium risk).',
  }
}
