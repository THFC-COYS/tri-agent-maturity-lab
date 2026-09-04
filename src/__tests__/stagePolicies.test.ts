import { describe, expect, it } from 'vitest'
import {
  evaluatePolicyGate,
  getPolicy,
  STAGE_POLICIES,
} from '../kernel/stagePolicies'
import type { ProposedAction } from '../kernel/types'

describe('stage policies', () => {
  it('defines distinct behavior per stage', () => {
    expect(getPolicy(1).allowTools).toBe(false)
    expect(getPolicy(1).multiAgent).toBe(false)
    expect(getPolicy(2).allowTools).toBe(true)
    expect(getPolicy(2).multiAgent).toBe(false)
    expect(getPolicy(3).multiAgent).toBe(true)
    expect(getPolicy(3).requireHumanOverride).toBe(false)
    expect(getPolicy(4).requirePolicyGate).toBe(true)
    expect(getPolicy(4).requireHumanOverride).toBe(true)
    expect(getPolicy(4).auditEnabled).toBe(true)
  })

  it('exposes four stages', () => {
    expect(Object.keys(STAGE_POLICIES).map(Number).sort()).toEqual([1, 2, 3, 4])
  })

  it('blocks high-risk actions at the policy gate', () => {
    const high: ProposedAction = {
      id: 'a1',
      title: 'Purge records',
      description: 'Irreversible',
      risk: 'high',
      reversible: false,
    }
    const gate = evaluatePolicyGate(high)
    expect(gate.allowed).toBe(false)
    expect(gate.reason.length).toBeGreaterThan(10)
  })

  it('allows low-risk reversible actions', () => {
    const low: ProposedAction = {
      id: 'a2',
      title: 'Draft email',
      description: 'Safe',
      risk: 'low',
      reversible: true,
    }
    expect(evaluatePolicyGate(low).allowed).toBe(true)
  })
})
