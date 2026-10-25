import { describe, expect, it } from 'vitest'
import { scoreActionTier, FLOOR_CLASSES } from '../kernel/gateTiers'
import { evaluatePolicyGate } from '../kernel/stagePolicies'
import { createOrchestrator } from '../kernel/orchestrator'
import type { ActionClass, BlastRadius, ProposedAction } from '../kernel/types'

function action(partial: Partial<ProposedAction>): ProposedAction {
  return {
    id: 't1',
    title: 'Test action',
    description: 'Gate tier test',
    risk: 'low',
    reversible: true,
    ...partial,
  }
}

describe('hard floor: send / pay / delete / publish are always Tier 3', () => {
  for (const cls of FLOOR_CLASSES) {
    it(`${cls}: caller claims reversible, low blast, contained, still Tier 3`, () => {
      const a = action({
        actionClass: cls,
        risk: 'low',
        reversible: true,
        blastRadius: 'low',
        leavesSystem: false,
      })
      const score = scoreActionTier(a)
      expect(score.tier).toBe(3)
      expect(score.floorApplied).toBe(true)
      expect(evaluatePolicyGate(a).allowed).toBe(false)
    })
  }

  it('send: all 8 combinations of the caller-supplied inputs still score Tier 3', () => {
    const combos: Array<[boolean, boolean, BlastRadius]> = []
    for (const reversible of [true, false]) {
      for (const leavesSystem of [true, false]) {
        for (const blastRadius of ['low', 'high'] as BlastRadius[]) {
          combos.push([reversible, leavesSystem, blastRadius])
        }
      }
    }
    expect(combos).toHaveLength(8)
    for (const [reversible, leavesSystem, blastRadius] of combos) {
      const score = scoreActionTier(
        action({
          actionClass: 'send' as ActionClass,
          risk: blastRadius === 'high' ? 'high' : 'low',
          reversible,
          leavesSystem,
          blastRadius,
        }),
      )
      expect(score.tier).toBe(3)
      expect(score.floorApplied).toBe(true)
    }
  })
})

describe('tier 1: run free', () => {
  it('research (read-only) scores Tier 1 and the gate allows it', () => {
    const a = action({ actionClass: 'research', risk: 'low', reversible: true })
    expect(scoreActionTier(a).tier).toBe(1)
    expect(evaluatePolicyGate(a).allowed).toBe(true)
  })

  it('draft scores Tier 1 and the gate allows it', () => {
    const a = action({
      actionClass: 'draft',
      risk: 'low',
      reversible: true,
      blastRadius: 'low',
      leavesSystem: false,
    })
    expect(scoreActionTier(a).tier).toBe(1)
    expect(evaluatePolicyGate(a).allowed).toBe(true)
  })

  it('reversible internal action with low blast radius scores Tier 1', () => {
    const a = action({
      actionClass: 'internal',
      risk: 'medium',
      reversible: true,
      blastRadius: 'low',
      leavesSystem: false,
    })
    const gate = evaluatePolicyGate(a)
    expect(gate.tier).toBe(1)
    expect(gate.allowed).toBe(true)
    expect(gate.floorApplied).toBe(false)
  })
})

describe('tier 2: notify', () => {
  it('a leaves-system notify action scores Tier 2 and proceeds', () => {
    const a = action({
      actionClass: 'notify',
      risk: 'low',
      reversible: true,
      blastRadius: 'low',
      leavesSystem: true,
    })
    const gate = evaluatePolicyGate(a)
    expect(gate.tier).toBe(2)
    expect(gate.allowed).toBe(true)
  })

  it('an irreversible internal action with medium blast radius scores Tier 2', () => {
    const a = action({
      actionClass: 'internal',
      risk: 'medium',
      reversible: false,
      blastRadius: 'medium',
      leavesSystem: false,
    })
    const score = scoreActionTier(a)
    expect(score.tier).toBe(2)
    expect(score.floorApplied).toBe(false)
    expect(evaluatePolicyGate(a).allowed).toBe(true)
  })

  it('leaves-system plus irreversible escalates to Tier 3', () => {
    const a = action({
      actionClass: 'notify',
      risk: 'medium',
      reversible: false,
      blastRadius: 'medium',
      leavesSystem: true,
    })
    expect(scoreActionTier(a).tier).toBe(3)
    expect(evaluatePolicyGate(a).allowed).toBe(false)
  })
})

describe('input derivation defaults', () => {
  it('blastRadius defaults from risk and actionClass defaults to other', () => {
    const score = scoreActionTier(action({ risk: 'medium', reversible: true }))
    expect(score.inputs.blastRadius).toBe('medium')
    expect(score.inputs.actionClass).toBe('other')
    expect(score.inputs.leavesSystem).toBe(false)
  })

  it('leavesSystem defaults true for send and false for internal', () => {
    expect(
      scoreActionTier(action({ actionClass: 'send' })).inputs.leavesSystem,
    ).toBe(true)
    expect(
      scoreActionTier(action({ actionClass: 'internal' })).inputs.leavesSystem,
    ).toBe(false)
  })
})

describe('legacy compatibility: unclassified actions keep pre-tier behavior', () => {
  it('high-risk irreversible action with no class is blocked (Tier 3)', () => {
    const high: ProposedAction = {
      id: 'a1',
      title: 'Purge records',
      description: 'Irreversible',
      risk: 'high',
      reversible: false,
    }
    const gate = evaluatePolicyGate(high)
    expect(gate.allowed).toBe(false)
    expect(gate.tier).toBe(3)
    expect(gate.floorApplied).toBe(false)
    expect(gate.reason.length).toBeGreaterThan(10)
  })

  it('high-risk reversible action with no class is still paused (Tier 3)', () => {
    const gate = evaluatePolicyGate(
      action({ risk: 'high', reversible: true }),
    )
    expect(gate.allowed).toBe(false)
    expect(gate.tier).toBe(3)
  })

  it('low-risk reversible action with no class is allowed (Tier 1)', () => {
    const low: ProposedAction = {
      id: 'a2',
      title: 'Draft email',
      description: 'Safe',
      risk: 'low',
      reversible: true,
    }
    const gate = evaluatePolicyGate(low)
    expect(gate.allowed).toBe(true)
    expect(gate.tier).toBe(1)
  })
})

describe('audit trail carries the scoring record', () => {
  it('stage 4 policy entry records tier, scoreInputs, and floorApplied', () => {
    const orch = createOrchestrator()
    const paused = orch.run({
      prompt: 'Critical irreversible purge of student records',
      stage: 4,
      skin: 'highered',
    })
    expect(paused.awaitingOverride).toBe(true)
    const policyEntry = paused.audit.find((a) => a.actor === 'policy-gate')
    expect(policyEntry).toBeDefined()
    expect(policyEntry?.tier).toBe(3)
    expect(policyEntry?.floorApplied).toBe(false)
    expect(policyEntry?.scoreInputs).toBeDefined()
    expect(policyEntry?.scoreInputs?.reversible).toBe(false)
    expect(policyEntry?.scoreInputs?.blastRadius).toBe('high')
  })

  it('override approval records approvedBy and approvedAt from the decision', () => {
    const orch = createOrchestrator()
    orch.run({
      prompt: 'Critical irreversible purge of student records',
      stage: 4,
      skin: 'highered',
    })
    const before = Date.now()
    const approved = orch.resolveOverride({
      approved: true,
      note: 'Reviewed the list, proceed',
      approver: 'duty-officer',
    })
    const entry = approved.audit.find((a) => a.decision === 'approved')
    expect(entry).toBeDefined()
    expect(entry?.approvedBy).toBe('duty-officer')
    expect(entry?.approvedAt).toBeGreaterThanOrEqual(before)
    expect(entry?.approvedAt).toBeLessThanOrEqual(Date.now())
  })

  it('override approval without a named approver falls back to the human actor label', () => {
    const orch = createOrchestrator()
    orch.run({
      prompt: 'Launch urgent retention outreach',
      stage: 4,
      skin: 'highered',
    })
    const approved = orch.resolveOverride({ approved: true, note: 'Looks good' })
    const entry = approved.audit.find((a) => a.decision === 'approved')
    expect(entry?.approvedBy).toBe('human')
    expect(typeof entry?.approvedAt).toBe('number')
  })

  it('override rejection records the decision without approval fields', () => {
    const orch = createOrchestrator()
    orch.run({
      prompt: 'Critical irreversible purge of student records',
      stage: 4,
      skin: 'highered',
    })
    const rejected = orch.resolveOverride({
      approved: false,
      note: 'Too risky',
      approver: 'duty-officer',
    })
    const entry = rejected.audit.find((a) => a.decision === 'overridden')
    expect(entry).toBeDefined()
    expect(entry?.approvedBy).toBeUndefined()
    expect(entry?.approvedAt).toBeUndefined()
  })
})
