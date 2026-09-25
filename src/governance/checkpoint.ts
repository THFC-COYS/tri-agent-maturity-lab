/**
 * Deterministic email checkpoint for registered employee agents.
 * Mirrors Stage-4 evaluatePolicyGate style: allowed + reason, fail-closed.
 */

import {
  DEFAULT_AGENT_REGISTRY,
  findAgent,
  loadAgentRegistry,
  type RegistryLoader,
  type RegisteredAgent,
} from './agentRegistry'
import {
  GovernanceAuditLog,
  type GovernanceDecision,
} from './audit'

export type AttachmentKind = 'student_record' | 'other'

export interface EmailAction {
  agentId: string
  tool: 'send_email'
  to: string
  /** Attachment label. student_record covers transcripts and similar. */
  attachmentKind: AttachmentKind
  subject?: string
}

export interface CheckpointResult {
  allowed: boolean
  reason: string
  requiresHumanOverride: boolean
  agent?: RegisteredAgent
}

export type HumanOverrideDecision = 'approve' | 'deny'

export interface RunEmailOptions {
  loadRegistry?: RegistryLoader
  audit?: GovernanceAuditLog
  /**
   * Called only when the checkpoint blocks and requires human override.
   * Demo scripts should return 'deny' (or 'approve') deliberately.
   */
  onHumanOverride?: (
    action: EmailAction,
    gate: CheckpointResult,
  ) => HumanOverrideDecision
}

export interface RunEmailResult {
  sent: boolean
  simulated: boolean
  gate: CheckpointResult
  override?: HumanOverrideDecision
  auditDecision: GovernanceDecision
  message: string
}

function recipientDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return null
  return email.slice(at + 1).toLowerCase()
}

function describeOutside(domain: string): string {
  if (domain === 'gmail.com') return 'Gmail'
  return domain
}

function defaultLoader(): typeof DEFAULT_AGENT_REGISTRY {
  return DEFAULT_AGENT_REGISTRY
}

/**
 * Deterministic policy gate: runs BEFORE any send.
 * Blocks student_record attachments to recipients outside the school domain.
 * FAIL CLOSED: any throw / unreadable registry / missing agent → blocked.
 */
export function evaluateEmailCheckpoint(
  action: EmailAction,
  loadRegistry: RegistryLoader = defaultLoader,
): CheckpointResult {
  try {
    // Force a full registry parse first (fail-closed on corrupt data).
    loadAgentRegistry(loadRegistry)

    const agent = findAgent(action.agentId, loadRegistry)
    if (!agent) {
      return {
        allowed: false,
        reason:
          'Blocked. No registered agent matched this request, so the action was denied.',
        requiresHumanOverride: false,
      }
    }

    if (!agent.allowedTools.includes(action.tool)) {
      return {
        allowed: false,
        reason: `Blocked. The advising agent, owned by ${agent.owner}, is not allowed to use the ${action.tool} tool.`,
        requiresHumanOverride: false,
        agent,
      }
    }

    const domain = recipientDomain(action.to)
    if (!domain) {
      return {
        allowed: false,
        reason: `Blocked. The advising agent, owned by ${agent.owner}, tried to email an address that could not be parsed.`,
        requiresHumanOverride: false,
        agent,
      }
    }

    const outsideSchool = domain !== agent.schoolDomain.toLowerCase()
    const isStudentRecord = action.attachmentKind === 'student_record'

    if (isStudentRecord && outsideSchool) {
      return {
        allowed: false,
        reason: `Blocked. The advising agent, owned by ${agent.owner}, tried to email a student transcript to an outside ${describeOutside(domain)} address. A human has to approve this before it can go out.`,
        requiresHumanOverride: true,
        agent,
      }
    }

    return {
      allowed: true,
      reason: `Allowed. The advising agent, owned by ${agent.owner}, may email this ${isStudentRecord ? 'student transcript' : 'message'} to an address at ${agent.schoolDomain}.`,
      requiresHumanOverride: false,
      agent,
    }
  } catch {
    return {
      allowed: false,
      reason:
        'Blocked. The governance checkpoint could not read the agent registry, so the action was denied (fail-closed).',
      requiresHumanOverride: false,
    }
  }
}

/**
 * Run an email action through the checkpoint, optional human override, and audit.
 * Never sends real mail — success is a simulated send only.
 */
export function runEmailAction(
  action: EmailAction,
  options: RunEmailOptions = {},
): RunEmailResult {
  const audit = options.audit ?? new GovernanceAuditLog()
  const gate = evaluateEmailCheckpoint(action, options.loadRegistry)
  const owner = gate.agent?.owner ?? 'unknown'
  const agentId = action.agentId
  const actionLabel = `send_email to ${action.to} (${action.attachmentKind})`

  if (gate.allowed) {
    audit.record({
      agentId,
      owner,
      action: actionLabel,
      decision: 'allowed',
      detail: gate.reason,
    })
    return {
      sent: true,
      simulated: true,
      gate,
      auditDecision: 'allowed',
      message: `${gate.reason} Simulated send completed. No real email was sent.`,
    }
  }

  if (gate.requiresHumanOverride) {
    const override = options.onHumanOverride?.(action, gate) ?? 'deny'
    if (override === 'approve') {
      audit.record({
        agentId,
        owner,
        action: actionLabel,
        decision: 'override_approved',
        detail: `${gate.reason} Scripted human override: approved.`,
      })
      return {
        sent: true,
        simulated: true,
        gate,
        override,
        auditDecision: 'override_approved',
        message: `${gate.reason} Scripted human override: approved. Simulated send completed. No real email was sent.`,
      }
    }
    audit.record({
      agentId,
      owner,
      action: actionLabel,
      decision: 'override_denied',
      detail: `${gate.reason} Scripted human override: denied.`,
    })
    return {
      sent: false,
      simulated: false,
      gate,
      override,
      auditDecision: 'override_denied',
      message: `${gate.reason} Scripted human override: denied.`,
    }
  }

  audit.record({
    agentId,
    owner,
    action: actionLabel,
    decision: 'blocked',
    detail: gate.reason,
  })
  return {
    sent: false,
    simulated: false,
    gate,
    auditDecision: 'blocked',
    message: gate.reason,
  }
}
