import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_REGISTRY,
  type RegisteredAgent,
} from '../governance/agentRegistry'
import { GovernanceAuditLog } from '../governance/audit'
import {
  evaluateEmailCheckpoint,
  runEmailAction,
  type EmailAction,
} from '../governance/checkpoint'

const agent = DEFAULT_AGENT_REGISTRY[0]!

function transcriptTo(to: string): EmailAction {
  return {
    agentId: agent.id,
    tool: 'send_email',
    to,
    attachmentKind: 'student_record',
    subject: 'Student transcript (fake)',
  }
}

describe('employee-agent governance checkpoint', () => {
  it('allows a student record emailed to an address at the school domain', () => {
    const gate = evaluateEmailCheckpoint(
      transcriptTo(`registrar@${agent.schoolDomain}`),
    )
    expect(gate.allowed).toBe(true)
    expect(gate.requiresHumanOverride).toBe(false)
    expect(gate.reason.toLowerCase()).toContain('allowed')

    const audit = new GovernanceAuditLog()
    const result = runEmailAction(
      transcriptTo(`registrar@${agent.schoolDomain}`),
      { audit },
    )
    expect(result.sent).toBe(true)
    expect(result.simulated).toBe(true)
    expect(result.auditDecision).toBe('allowed')
    expect(audit.list()).toHaveLength(1)
    expect(audit.list()[0]!.decision).toBe('allowed')
  })

  it('blocks a student record emailed to an outside Gmail address', () => {
    const gate = evaluateEmailCheckpoint(
      transcriptTo('parent.example@gmail.com'),
    )
    expect(gate.allowed).toBe(false)
    expect(gate.requiresHumanOverride).toBe(true)
    expect(gate.reason.toLowerCase()).toContain('blocked')
    expect(gate.reason.toLowerCase()).toContain('gmail')

    const audit = new GovernanceAuditLog()
    const result = runEmailAction(transcriptTo('parent.example@gmail.com'), {
      audit,
      onHumanOverride: () => 'deny',
    })
    expect(result.sent).toBe(false)
    expect(result.override).toBe('deny')
    expect(result.auditDecision).toBe('override_denied')
    expect(audit.list()).toHaveLength(1)
    expect(audit.list()[0]!.decision).toBe('override_denied')
  })

  it('fail-closed: corrupt or missing registry blocks a transcript send', () => {
    const throwing = evaluateEmailCheckpoint(
      transcriptTo(`registrar@${agent.schoolDomain}`),
      () => {
        throw new Error('registry unreadable')
      },
    )
    expect(throwing.allowed).toBe(false)
    expect(throwing.requiresHumanOverride).toBe(false)
    expect(throwing.reason.toLowerCase()).toContain('fail-closed')

    const corrupt = evaluateEmailCheckpoint(
      transcriptTo(`registrar@${agent.schoolDomain}`),
      () => [{ id: 123 } as unknown as RegisteredAgent],
    )
    expect(corrupt.allowed).toBe(false)
    expect(corrupt.reason.toLowerCase()).toContain('fail-closed')

    const empty = evaluateEmailCheckpoint(
      transcriptTo(`registrar@${agent.schoolDomain}`),
      () => [],
    )
    // Empty registry: agent not found → blocked (fail-closed posture)
    expect(empty.allowed).toBe(false)
  })
})
