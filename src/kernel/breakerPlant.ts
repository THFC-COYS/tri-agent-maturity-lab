/**
 * Soft-plant breaker-amp alpha — simulated electrical headroom only.
 * Assumed trip curve: linear load rise to a fixed amp limit; trip budget is
 * the remaining ms until load would hit the limit from the sensor sample.
 * Not a claim about physical breaker hardware.
 */

export const DEFAULT_TRIP_BUDGET_MS = 50
export const BREAKER_LIMIT_AMPS = 48
/** Amps at first sensor sample — leaves ~50ms headroom at RISE_AMPS_PER_MS. */
export const INITIAL_LOAD_AMPS = 38
/** Soft-plant rise rate so (LIMIT - INITIAL) / RISE ≈ 50ms. */
export const RISE_AMPS_PER_MS = 0.2
/** Amps removed when shed actuator fires. */
export const SHED_REDUCTION_AMPS = 16

export interface SensorReading {
  loadAmps: number
  breakerLimitAmps: number
  headroomAmps: number
  timeToTripMs: number
}

export interface BreakerLatencyReport {
  sensorTs: number
  gateTs: number
  shedTs: number
  sensorToGateMs: number
  gateToShedMs: number
  sensorToShedMs: number
  tripBudgetMs: number
  timeToTripMs: number
  loadAmpsAtSensor: number
  breakerLimitAmps: number
  shedReductionAmps: number
  loadAmpsAfterShed: number
  shedBeforeTrip: boolean
  withinBudget: boolean
  plantTripped: boolean
  curveNote: string
}

export interface BreakerPlant {
  readonly limitAmps: number
  readonly tripBudgetMs: number
  readSensor(elapsedMsSinceRunStart?: number): SensorReading
  applyShed(reductionAmps?: number): { loadAmps: number; tripped: boolean }
  wouldHaveTripped(elapsedMs: number): boolean
  getLoad(): number
}

export function createBreakerPlant(opts?: {
  limitAmps?: number
  initialLoadAmps?: number
  riseAmpsPerMs?: number
  tripBudgetMs?: number
}): BreakerPlant {
  const limitAmps = opts?.limitAmps ?? BREAKER_LIMIT_AMPS
  const riseAmpsPerMs = opts?.riseAmpsPerMs ?? RISE_AMPS_PER_MS
  const tripBudgetMs = opts?.tripBudgetMs ?? DEFAULT_TRIP_BUDGET_MS
  let loadAmps = opts?.initialLoadAmps ?? INITIAL_LOAD_AMPS
  let shedApplied = false

  return {
    limitAmps,
    tripBudgetMs,
    readSensor(elapsedMsSinceRunStart = 0) {
      if (!shedApplied) {
        loadAmps = Math.min(
          limitAmps + 5,
          (opts?.initialLoadAmps ?? INITIAL_LOAD_AMPS) +
            elapsedMsSinceRunStart * riseAmpsPerMs,
        )
      }
      const headroomAmps = Math.max(0, limitAmps - loadAmps)
      const timeToTripMs =
        riseAmpsPerMs > 0 ? headroomAmps / riseAmpsPerMs : Number.POSITIVE_INFINITY
      return {
        loadAmps: round1(loadAmps),
        breakerLimitAmps: limitAmps,
        headroomAmps: round1(headroomAmps),
        timeToTripMs: round1(timeToTripMs),
      }
    },
    applyShed(reductionAmps = SHED_REDUCTION_AMPS) {
      loadAmps = Math.max(0, loadAmps - reductionAmps)
      shedApplied = true
      return { loadAmps: round1(loadAmps), tripped: loadAmps >= limitAmps }
    },
    wouldHaveTripped(elapsedMs: number) {
      if (shedApplied) return false
      const projected =
        (opts?.initialLoadAmps ?? INITIAL_LOAD_AMPS) + elapsedMs * riseAmpsPerMs
      return projected >= limitAmps
    },
    getLoad() {
      return round1(loadAmps)
    },
  }
}

export function buildLatencyReport(input: {
  sensorTs: number
  gateTs: number
  shedTs: number
  reading: SensorReading
  tripBudgetMs: number
  shedReductionAmps: number
  loadAmpsAfterShed: number
  plantTripped: boolean
}): BreakerLatencyReport {
  const sensorToGateMs = round1(input.gateTs - input.sensorTs)
  const gateToShedMs = round1(input.shedTs - input.gateTs)
  const sensorToShedMs = round1(input.shedTs - input.sensorTs)
  const shedBeforeTrip = sensorToShedMs < input.reading.timeToTripMs && !input.plantTripped
  const withinBudget = sensorToShedMs <= input.tripBudgetMs && shedBeforeTrip

  return {
    sensorTs: input.sensorTs,
    gateTs: input.gateTs,
    shedTs: input.shedTs,
    sensorToGateMs,
    gateToShedMs,
    sensorToShedMs,
    tripBudgetMs: input.tripBudgetMs,
    timeToTripMs: input.reading.timeToTripMs,
    loadAmpsAtSensor: input.reading.loadAmps,
    breakerLimitAmps: input.reading.breakerLimitAmps,
    shedReductionAmps: input.shedReductionAmps,
    loadAmpsAfterShed: input.loadAmpsAfterShed,
    shedBeforeTrip,
    withinBudget,
    plantTripped: input.plantTripped,
    curveNote:
      `Soft-plant assumed curve: load rises ${RISE_AMPS_PER_MS} A/ms toward ` +
      `${input.reading.breakerLimitAmps} A; trip budget ${input.tripBudgetMs} ms ` +
      `from sensor sample. Not physical breaker hardware.`,
  }
}

/** Sync busy-wait for fail-path demos/tests (no timers/promises). */
export function busyWaitMs(ms: number): void {
  if (ms <= 0) return
  const end = performance.now() + ms
  while (performance.now() < end) {
    /* spin */
  }
}

export function nowMs(): number {
  return performance.now()
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
