import { describe, expect, it } from 'vitest'
import { createOrchestrator } from '../kernel/orchestrator'
import {
  DEFAULT_TRIP_BUDGET_MS,
  buildLatencyReport,
  createBreakerPlant,
} from '../kernel/breakerPlant'

describe('breaker plant soft-plant', () => {
  it('reports headroom and time-to-trip from sensor sample', () => {
    const plant = createBreakerPlant()
    const reading = plant.readSensor(0)
    expect(reading.breakerLimitAmps).toBe(48)
    expect(reading.loadAmps).toBeLessThan(reading.breakerLimitAmps)
    expect(reading.timeToTripMs).toBeCloseTo(50, 0)
  })

  it('shed lowers load below limit', () => {
    const plant = createBreakerPlant()
    plant.readSensor(0)
    const after = plant.applyShed(16)
    expect(after.loadAmps).toBeLessThan(48)
    expect(after.tripped).toBe(false)
  })
})

describe('breaker-amp Stage-4 latency path', () => {
  it('timestamps exist and are ordered; shed beats trip within budget', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'Row B rack load climbing — shed batch load before trip',
      stage: 4,
      skin: 'enterprise',
    })

    expect(result.awaitingOverride).toBe(false)
    expect(result.latency).not.toBeNull()
    const lat = result.latency!
    expect(lat.sensorTs).toBeLessThanOrEqual(lat.gateTs)
    expect(lat.gateTs).toBeLessThanOrEqual(lat.shedTs)
    expect(lat.sensorToGateMs).toBeGreaterThanOrEqual(0)
    expect(lat.gateToShedMs).toBeGreaterThanOrEqual(0)
    expect(lat.sensorToShedMs).toBeGreaterThanOrEqual(0)
    expect(
      Math.abs(lat.sensorToShedMs - (lat.sensorToGateMs + lat.gateToShedMs)),
    ).toBeLessThanOrEqual(0.2)
    expect(lat.tripBudgetMs).toBe(DEFAULT_TRIP_BUDGET_MS)
    expect(lat.plantTripped).toBe(false)
    expect(lat.shedBeforeTrip).toBe(true)
    expect(lat.withinBudget).toBe(true)
    expect(lat.sensorToShedMs).toBeLessThanOrEqual(lat.tripBudgetMs)

    expect(result.events.some((e) => e.kind === 'sensor.read')).toBe(true)
    expect(result.events.some((e) => e.kind === 'policy.check')).toBe(true)
    expect(result.events.some((e) => e.kind === 'action.executed')).toBe(true)
    expect(result.events.some((e) => e.kind === 'breaker.latency')).toBe(true)
    expect(result.events.some((e) => e.kind === 'human.override.requested')).toBe(
      false,
    )
    expect(result.audit.some((a) => a.decision === 'allowed')).toBe(true)
  })

  it('fail path: artificial delay causes soft-plant trip', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'Row B rack load climbing — shed batch load before trip',
      stage: 4,
      skin: 'enterprise',
      injectDelayMs: 80,
    })

    expect(result.latency).not.toBeNull()
    const lat = result.latency!
    expect(lat.sensorToShedMs).toBeGreaterThan(lat.tripBudgetMs)
    expect(lat.plantTripped).toBe(true)
    expect(lat.withinBudget).toBe(false)
    expect(lat.shedBeforeTrip).toBe(false)
    expect(result.finalSummary).toMatch(/trip/i)
  })

  it('buildLatencyReport math is consistent', () => {
    const report = buildLatencyReport({
      sensorTs: 100,
      gateTs: 105,
      shedTs: 120,
      reading: {
        loadAmps: 38,
        breakerLimitAmps: 48,
        headroomAmps: 10,
        timeToTripMs: 50,
      },
      tripBudgetMs: 50,
      shedReductionAmps: 16,
      loadAmpsAfterShed: 22,
      plantTripped: false,
    })
    expect(report.sensorToGateMs).toBe(5)
    expect(report.gateToShedMs).toBe(15)
    expect(report.sensorToShedMs).toBe(20)
    expect(report.withinBudget).toBe(true)
  })
})
