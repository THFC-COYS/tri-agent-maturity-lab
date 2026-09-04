import { describe, expect, it } from 'vitest'
import { createOrchestrator } from '../kernel/orchestrator'

describe('orchestrator stage behavior', () => {
  it('stage 1: single assistant suggestion, no tools, no action execution', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'Help recover West pipeline',
      stage: 1,
      skin: 'enterprise',
    })
    expect(result.awaitingOverride).toBe(false)
    expect(result.messages.some((m) => m.agent === 'assistant')).toBe(true)
    expect(result.messages.some((m) => m.agent === 'researcher')).toBe(false)
    expect(result.events.some((e) => e.kind === 'tool.called')).toBe(false)
    expect(result.events.some((e) => e.kind === 'action.executed')).toBe(false)
    expect(result.audit).toHaveLength(0)
  })

  it('stage 2: one tool-using planner agent', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'West region pipeline velocity is down',
      stage: 2,
      skin: 'enterprise',
    })
    expect(result.messages.some((m) => m.agent === 'planner')).toBe(true)
    expect(result.messages.some((m) => m.agent === 'researcher')).toBe(false)
    expect(result.events.some((e) => e.kind === 'tool.called')).toBe(true)
    expect(result.proposedAction).not.toBeNull()
    expect(result.awaitingOverride).toBe(false)
  })

  it('stage 3: orchestrator coordinates at least two specialists and executes', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'STEM retention decline — design outreach',
      stage: 3,
      skin: 'highered',
    })
    const agents = new Set(
      result.messages.filter((m) => m.role === 'agent').map((m) => m.agent),
    )
    expect(agents.has('researcher')).toBe(true)
    expect(agents.has('planner')).toBe(true)
    expect(agents.has('executor')).toBe(true)
    expect(agents.has('robot')).toBe(true)
    expect(result.events.some((e) => e.kind === 'action.executed')).toBe(true)
    expect(result.metrics).not.toBeNull()
    expect(result.awaitingOverride).toBe(false)
    expect(result.audit).toHaveLength(0)
  })

  it('stage 4 higher-ed: policy gate + audit + human override before final action', () => {
    const orch = createOrchestrator()
    const paused = orch.run({
      prompt: 'Launch urgent retention outreach',
      stage: 4,
      skin: 'highered',
    })
    expect(paused.awaitingOverride).toBe(true)
    expect(paused.proposedAction).not.toBeNull()
    expect(paused.events.some((e) => e.kind === 'human.override.requested')).toBe(
      true,
    )
    expect(paused.events.some((e) => e.kind === 'policy.check')).toBe(true)
    expect(paused.audit.length).toBeGreaterThan(0)
    expect(paused.events.some((e) => e.kind === 'action.executed')).toBe(false)
    expect(paused.latency).toBeNull()

    const approved = orch.resolveOverride({ approved: true, note: 'Looks good' })
    expect(approved.awaitingOverride).toBe(false)
    expect(approved.events.some((e) => e.kind === 'action.executed')).toBe(true)
    expect(approved.events.some((e) => e.kind === 'human.override.decision')).toBe(
      true,
    )
    expect(approved.audit.some((a) => a.decision === 'approved')).toBe(true)
  })

  it('stage 4 higher-ed reject path records override without execution', () => {
    const orch = createOrchestrator()
    orch.run({
      prompt: 'Critical irreversible purge of student records',
      stage: 4,
      skin: 'highered',
    })
    const rejected = orch.resolveOverride({ approved: false, note: 'Too risky' })
    expect(rejected.events.some((e) => e.kind === 'action.executed')).toBe(false)
    expect(rejected.audit.some((a) => a.decision === 'overridden')).toBe(true)
    expect(rejected.finalSummary).toMatch(/rejected/i)
  })

  it('stage 4 enterprise: rack-protection auto-shed with latency (no human wait)', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'Row B rack load climbing toward breaker limit',
      stage: 4,
      skin: 'enterprise',
    })
    expect(result.awaitingOverride).toBe(false)
    expect(result.latency).not.toBeNull()
    expect(result.events.some((e) => e.kind === 'action.executed')).toBe(true)
    expect(result.events.some((e) => e.kind === 'breaker.latency')).toBe(true)
  })
})
