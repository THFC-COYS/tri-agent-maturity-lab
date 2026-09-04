import { describe, expect, it } from 'vitest'
import { createOrchestrator } from '../kernel/orchestrator'
import {
  DEFAULT_TRIP_BUDGET_MS,
  HARD_INITIAL_LOAD_AMPS,
  HARD_RISE_AMPS_PER_MS,
  HARD_TRIP_BUDGET_MS,
  BREAKER_LIMIT_AMPS,
  buildLatencyReport,
  createBreakerPlant,
  seededRng,
} from '../kernel/breakerPlant'
import type { SensorReading } from '../kernel/breakerPlant'

function freeReading(partial?: Partial<SensorReading>): SensorReading {
  return {
    loadAmps: 38,
    breakerLimitAmps: 48,
    headroomAmps: 10,
    timeToTripMs: 50,
    trueLoadAmps: 38,
    trueTimeToTripMs: 50,
    sensorDelayMs: 0,
    sensorNoiseAmps: 0,
    plantMode: 'free',
    ...partial,
  }
}

describe('breaker plant soft-plant', () => {
  it('reports headroom and time-to-trip from sensor sample', () => {
    const plant = createBreakerPlant()
    const reading = plant.readSensor(0)
    expect(reading.breakerLimitAmps).toBe(48)
    expect(reading.loadAmps).toBeLessThan(reading.breakerLimitAmps)
    expect(reading.timeToTripMs).toBeCloseTo(50, 0)
    expect(reading.plantMode).toBe('free')
    expect(reading.trueTimeToTripMs).toBeCloseTo(reading.timeToTripMs, 0)
    expect(reading.sensorDelayMs).toBe(0)
    expect(reading.sensorNoiseAmps).toBe(0)
  })

  it('shed lowers load below limit', () => {
    const plant = createBreakerPlant()
    plant.readSensor(0)
    const after = plant.applyShed(16)
    expect(after.loadAmps).toBeLessThan(48)
    expect(after.tripped).toBe(false)
  })
})

describe('hard soft-plant', () => {
  it('uses tighter trip budget and faster rise (~22 ms)', () => {
    const plant = createBreakerPlant({
      mode: 'hard',
      forceSensorDelayMs: 0,
      forceNoiseAmps: 0,
    })
    expect(plant.mode).toBe('hard')
    expect(plant.tripBudgetMs).toBe(HARD_TRIP_BUDGET_MS)
    expect(HARD_TRIP_BUDGET_MS).toBe(22)

    const reading = plant.readSensor(0)
    expect(reading.plantMode).toBe('hard')
    expect(reading.loadAmps).toBe(HARD_INITIAL_LOAD_AMPS)
    expect(reading.trueLoadAmps).toBe(HARD_INITIAL_LOAD_AMPS)
    const expectedWindow =
      (BREAKER_LIMIT_AMPS - HARD_INITIAL_LOAD_AMPS) / HARD_RISE_AMPS_PER_MS
    expect(reading.trueTimeToTripMs).toBeCloseTo(expectedWindow, 0)
    expect(reading.trueTimeToTripMs).toBeCloseTo(HARD_TRIP_BUDGET_MS, 0)
  })

  it('applies forced sensor delay and noise (optimistic reading)', () => {
    const plant = createBreakerPlant({
      mode: 'hard',
      forceSensorDelayMs: 5,
      forceNoiseAmps: -1.2,
    })
    const reading = plant.readSensor(10)
    expect(reading.sensorDelayMs).toBe(5)
    expect(reading.sensorNoiseAmps).toBe(-1.2)
    expect(reading.trueLoadAmps).toBeGreaterThan(reading.loadAmps)
    expect(reading.trueTimeToTripMs).toBeLessThan(reading.timeToTripMs)
  })

  it('seeded rng is deterministic for delay/noise', () => {
    const a = createBreakerPlant({ mode: 'hard', rng: seededRng(42) })
    const b = createBreakerPlant({ mode: 'hard', rng: seededRng(42) })
    const ra = a.readSensor(3)
    const rb = b.readSensor(3)
    expect(ra.sensorDelayMs).toBe(rb.sensorDelayMs)
    expect(ra.sensorNoiseAmps).toBe(rb.sensorNoiseAmps)
    expect(ra.loadAmps).toBe(rb.loadAmps)
  })

  it('wouldHaveTripped uses true physics, not noisy reading', () => {
    const plant = createBreakerPlant({
      mode: 'hard',
      forceSensorDelayMs: 0,
      forceNoiseAmps: -1.2,
    })
    plant.readSensor(0)
    expect(plant.wouldHaveTripped(HARD_TRIP_BUDGET_MS + 1)).toBe(true)
    expect(plant.wouldHaveTripped(5)).toBe(false)
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
    expect(lat.plantMode).toBe('free')
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

  it('hard mode: shed can beat tighter noisy curve within ~22 ms budget', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'Row B rack load climbing — shed batch load before trip',
      stage: 4,
      skin: 'enterprise',
      plantMode: 'hard',
      forceSensorDelayMs: 2,
      forceNoiseAmps: 0.4,
    })

    expect(result.latency).not.toBeNull()
    const lat = result.latency!
    expect(lat.plantMode).toBe('hard')
    expect(lat.tripBudgetMs).toBe(HARD_TRIP_BUDGET_MS)
    expect(lat.sensorDelayMs).toBe(2)
    expect(lat.sensorNoiseAmps).toBe(0.4)
    expect(lat.trueTimeToTripMs).toBeCloseTo(HARD_TRIP_BUDGET_MS, 0)
    expect(lat.plantTripped).toBe(false)
    expect(lat.shedBeatCurve).toBe(true)
    expect(lat.withinBudget).toBe(true)
    expect(lat.sensorToShedMs).toBeLessThanOrEqual(lat.tripBudgetMs)
    expect(result.finalSummary).toMatch(/hard/i)
  })

  it('hard mode fail path: delay past true window trips plant', () => {
    const orch = createOrchestrator()
    const result = orch.run({
      prompt: 'Row B rack load climbing — shed batch load before trip',
      stage: 4,
      skin: 'enterprise',
      plantMode: 'hard',
      forceSensorDelayMs: 3,
      forceNoiseAmps: -0.8,
      injectDelayMs: 40,
    })

    expect(result.latency).not.toBeNull()
    const lat = result.latency!
    expect(lat.plantMode).toBe('hard')
    expect(lat.sensorToShedMs).toBeGreaterThan(lat.trueTimeToTripMs)
    expect(lat.plantTripped).toBe(true)
    expect(lat.shedBeatCurve).toBe(false)
    expect(lat.withinBudget).toBe(false)
    expect(result.finalSummary).toMatch(/trip/i)
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
      reading: freeReading(),
      tripBudgetMs: 50,
      shedReductionAmps: 16,
      loadAmpsAfterShed: 22,
      plantTripped: false,
    })
    expect(report.sensorToGateMs).toBe(5)
    expect(report.gateToShedMs).toBe(15)
    expect(report.sensorToShedMs).toBe(20)
    expect(report.withinBudget).toBe(true)
    expect(report.shedBeatCurve).toBe(true)
    expect(report.plantMode).toBe('free')
  })

  it('buildLatencyReport hard mode notes noise/delay', () => {
    const report = buildLatencyReport({
      sensorTs: 0,
      gateTs: 2,
      shedTs: 8,
      reading: {
        loadAmps: 40,
        breakerLimitAmps: 48,
        headroomAmps: 8,
        timeToTripMs: 25,
        trueLoadAmps: 41.5,
        trueTimeToTripMs: 20.3,
        sensorDelayMs: 3,
        sensorNoiseAmps: -1.0,
        plantMode: 'hard',
      },
      tripBudgetMs: HARD_TRIP_BUDGET_MS,
      shedReductionAmps: 16,
      loadAmpsAfterShed: 25,
      plantTripped: false,
    })
    expect(report.shedBeatCurve).toBe(true)
    expect(report.curveNote).toMatch(/Hard soft-plant/)
    expect(report.curveNote).toMatch(/delay 3/)
  })
})
