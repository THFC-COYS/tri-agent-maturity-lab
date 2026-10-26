import { describe, expect, it } from 'vitest'
import { createOrchestrator } from '../kernel/orchestrator'
import {
  KillSwitchDrillError,
  runKillSwitchDrill,
  validateDrillRecord,
} from '../kernel/killSwitchDrill'
import { HARD_TRIP_BUDGET_MS } from '../kernel/breakerPlant'

/**
 * A clock that reads a scripted timeline, one value per read. The drill
 * reads it exactly three times (alert presented, decision, halted), so
 * the script encodes the whole incident: when the alert landed, how long
 * the simulated responder deliberated, and how long the halt took.
 */
function scriptedClock(timeline: number[]): () => number {
  let i = 0
  return () => timeline[Math.min(i++, timeline.length - 1)]
}

describe('kill-switch drill: two clocks through the real Stage 4 machinery', () => {
  it('records human and system clocks with the tier score and approver', () => {
    const orch = createOrchestrator()
    // Alert at 10000; responder takes 1850 ms to decide (stop lands at
    // 11850); the halt completes 5 ms later (11855).
    const result = runKillSwitchDrill({
      orchestrator: orch,
      now: scriptedClock([10_000, 11_850, 11_855]),
      responder: () => ({
        approved: false,
        approver: 'duty-officer',
        note: 'STOP: kill the run',
      }),
    })

    expect(result.humanClockMs).toBe(1850)
    expect(result.systemClockMs).toBe(5)
    expect(result.alertPresentedAt).toBe(10_000)
    expect(result.decisionAt).toBe(11_850)
    expect(result.haltedAt).toBe(11_855)
    expect(result.systemBudgetMs).toBe(HARD_TRIP_BUDGET_MS)
    expect(result.systemBudgetMs).toBe(22)
    expect(result.systemWithinBudget).toBe(true)
    expect(result.tier).toBe(3)
    expect(result.stopped).toBe(true)
    expect(result.approver).toBe('duty-officer')

    // The stop actually stopped something: nothing executed.
    const entries = orch.audit.list()
    expect(entries.some((a) => a.decision === 'allowed')).toBe(false)
    expect(entries.some((a) => a.decision === 'overridden')).toBe(true)

    // One findable audit entry carries both clocks with the tier fields
    // and the approver fields.
    const drillEntry = entries.find((a) => a.drillId === result.drillId)
    expect(drillEntry).toBeDefined()
    expect(drillEntry?.id).toBe(result.auditEntryId)
    expect(drillEntry?.humanClockMs).toBe(1850)
    expect(drillEntry?.systemClockMs).toBe(5)
    expect(drillEntry?.tier).toBe(3)
    expect(drillEntry?.scoreInputs).toBeDefined()
    expect(drillEntry?.scoreInputs?.blastRadius).toBe('high')
    expect(drillEntry?.floorApplied).toBe(false)
    expect(drillEntry?.approvedBy).toBe('duty-officer')
    expect(drillEntry?.approvedAt).toBe(11_850)
  })

  it('a different responder delay moves the human clock; the action still scores Tier 3', () => {
    const orch = createOrchestrator()
    // Alert at 500; a slower responder deliberates 4200 ms (decision at
    // 4700); the halt completes 3 ms later (4703).
    const result = runKillSwitchDrill({
      orchestrator: orch,
      now: scriptedClock([500, 4_700, 4_703]),
      responder: () => ({
        approved: false,
        approver: 'safety-lead',
        note: 'STOP',
      }),
    })

    expect(result.humanClockMs).toBe(4200)
    expect(result.humanClockMs).not.toBe(1850)
    expect(result.systemClockMs).toBe(3)
    expect(result.tier).toBe(3)
    expect(result.scoreInputs.blastRadius).toBe('high')
    expect(result.scoreInputs.reversible).toBe(false)
    expect(result.systemWithinBudget).toBe(true)
  })

  it('fails loudly when the run never presents an alert (enterprise rack path)', () => {
    const orch = createOrchestrator()
    expect(() =>
      runKillSwitchDrill({
        orchestrator: orch,
        skin: 'enterprise',
        responder: () => ({ approved: false }),
      }),
    ).toThrow(KillSwitchDrillError)
    expect(
      orch.audit.list().some((a) => a.actor === 'kill-switch-drill'),
    ).toBe(false)
  })
})

describe('validateDrillRecord: fail loudly on incomplete clocks', () => {
  it('throws when humanClockMs is missing', () => {
    expect(() => validateDrillRecord({ systemClockMs: 5 })).toThrow(
      KillSwitchDrillError,
    )
  })

  it('throws when systemClockMs is missing', () => {
    expect(() => validateDrillRecord({ humanClockMs: 1850 })).toThrow(
      KillSwitchDrillError,
    )
  })

  it('throws when either clock is negative', () => {
    expect(() =>
      validateDrillRecord({ humanClockMs: -1, systemClockMs: 5 }),
    ).toThrow(KillSwitchDrillError)
    expect(() =>
      validateDrillRecord({ humanClockMs: 1850, systemClockMs: -0.5 }),
    ).toThrow(KillSwitchDrillError)
  })

  it('throws when either clock is not finite', () => {
    expect(() =>
      validateDrillRecord({ humanClockMs: Number.NaN, systemClockMs: 5 }),
    ).toThrow(KillSwitchDrillError)
    expect(() =>
      validateDrillRecord({
        humanClockMs: 1850,
        systemClockMs: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(KillSwitchDrillError)
  })

  it('accepts a complete record, including zero clocks', () => {
    expect(() =>
      validateDrillRecord({ humanClockMs: 0, systemClockMs: 0 }),
    ).not.toThrow()
    expect(() =>
      validateDrillRecord({ humanClockMs: 1850, systemClockMs: 5 }),
    ).not.toThrow()
  })

  it('the drill finalize path refuses to record a drill whose clock ran backwards', () => {
    const orch = createOrchestrator()
    // Decision lands BEFORE the alert on this broken clock, so the
    // human clock would be negative and the record must be refused.
    expect(() =>
      runKillSwitchDrill({
        orchestrator: orch,
        now: scriptedClock([10_000, 9_000, 9_050]),
        responder: () => ({ approved: false, approver: 'duty-officer' }),
      }),
    ).toThrow(KillSwitchDrillError)

    // The real override still resolved (the machinery ran), but no
    // successful drill record exists.
    expect(
      orch.audit.list().some((a) => a.decision === 'overridden'),
    ).toBe(true)
    expect(
      orch.audit.list().some((a) => a.actor === 'kill-switch-drill'),
    ).toBe(false)
    expect(
      orch.audit.list().some((a) => a.humanClockMs !== undefined),
    ).toBe(false)
  })
})
