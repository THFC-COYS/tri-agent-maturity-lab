/**
 * Soft-plant breaker-amp alpha — simulated electrical headroom only.
 * Free mode: ~50 ms linear curve. Hard mode: tighter headroom, faster rise,
 * noisy/delayed sensor reads. Not a claim about physical breaker hardware.
 */

export type PlantMode = 'free' | 'hard'

export const DEFAULT_TRIP_BUDGET_MS = 50
export const BREAKER_LIMIT_AMPS = 48
/** Amps at first sensor sample — leaves ~50ms headroom at RISE_AMPS_PER_MS. */
export const INITIAL_LOAD_AMPS = 38
/** Soft-plant rise rate so (LIMIT - INITIAL) / RISE ≈ 50ms. */
export const RISE_AMPS_PER_MS = 0.2
/** Amps removed when shed actuator fires. */
export const SHED_REDUCTION_AMPS = 16

/** Hard mode: tighter headroom + faster rise → ~22 ms trip budget. */
export const HARD_INITIAL_LOAD_AMPS = 41
export const HARD_RISE_AMPS_PER_MS = 0.32
export const HARD_TRIP_BUDGET_MS = 22
export const HARD_SENSOR_NOISE_AMPS = 1.2
export const HARD_SENSOR_DELAY_BASE_MS = 2
export const HARD_SENSOR_JITTER_MS = 4
/** Occasional extra lag spike (sim stale PDU sample). */
export const HARD_INTERMITTENT_LAG_MS = 8
export const HARD_INTERMITTENT_LAG_CHANCE = 0.28

export interface SensorReading {
  loadAmps: number
  breakerLimitAmps: number
  headroomAmps: number
  timeToTripMs: number
  /** True physics load at sample wall-clock (ignores sensor delay/noise). */
  trueLoadAmps: number
  trueTimeToTripMs: number
  sensorDelayMs: number
  sensorNoiseAmps: number
  plantMode: PlantMode
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
  plantMode: PlantMode
  trueTimeToTripMs: number
  sensorDelayMs: number
  sensorNoiseAmps: number
  /** Under hard mode: did shed beat true physics despite noise/delay? */
  shedBeatCurve: boolean
}

export interface BreakerPlant {
  readonly limitAmps: number
  readonly tripBudgetMs: number
  readonly mode: PlantMode
  readSensor(elapsedMsSinceRunStart?: number): SensorReading
  applyShed(reductionAmps?: number): { loadAmps: number; tripped: boolean }
  wouldHaveTripped(elapsedMs: number): boolean
  trueLoadAt(elapsedMs: number): number
  getLoad(): number
}

export interface BreakerPlantOpts {
  mode?: PlantMode
  limitAmps?: number
  initialLoadAmps?: number
  riseAmpsPerMs?: number
  tripBudgetMs?: number
  /** Deterministic RNG in [0,1) — tests pass a seeded source. */
  rng?: () => number
  /** Force sensor delay (ms); skips jitter/intermittent when set. */
  forceSensorDelayMs?: number
  /** Force noise offset (amps); skips random noise when set. */
  forceNoiseAmps?: number
}

function defaultRng(): number {
  return Math.random()
}

export function createBreakerPlant(opts?: BreakerPlantOpts): BreakerPlant {
  const mode: PlantMode = opts?.mode ?? 'free'
  const hard = mode === 'hard'
  const limitAmps = opts?.limitAmps ?? BREAKER_LIMIT_AMPS
  const initialLoadAmps =
    opts?.initialLoadAmps ?? (hard ? HARD_INITIAL_LOAD_AMPS : INITIAL_LOAD_AMPS)
  const riseAmpsPerMs =
    opts?.riseAmpsPerMs ?? (hard ? HARD_RISE_AMPS_PER_MS : RISE_AMPS_PER_MS)
  const tripBudgetMs =
    opts?.tripBudgetMs ?? (hard ? HARD_TRIP_BUDGET_MS : DEFAULT_TRIP_BUDGET_MS)
  const rng = opts?.rng ?? defaultRng

  let loadAmps = initialLoadAmps
  let shedApplied = false
  let lastTrueLoad = initialLoadAmps

  function trueLoadAt(elapsedMs: number): number {
    if (shedApplied) return loadAmps
    return Math.min(limitAmps + 5, initialLoadAmps + elapsedMs * riseAmpsPerMs)
  }

  function sampleDelayMs(): number {
    if (opts?.forceSensorDelayMs !== undefined) return opts.forceSensorDelayMs
    if (!hard) return 0
    let delay = HARD_SENSOR_DELAY_BASE_MS + rng() * HARD_SENSOR_JITTER_MS
    if (rng() < HARD_INTERMITTENT_LAG_CHANCE) delay += HARD_INTERMITTENT_LAG_MS
    return round1(delay)
  }

  function sampleNoise(): number {
    if (opts?.forceNoiseAmps !== undefined) return opts.forceNoiseAmps
    if (!hard) return 0
    // Symmetric noise in [-HARD_SENSOR_NOISE_AMPS, +HARD_SENSOR_NOISE_AMPS]
    return round1((rng() * 2 - 1) * HARD_SENSOR_NOISE_AMPS)
  }

  return {
    limitAmps,
    tripBudgetMs,
    mode,
    readSensor(elapsedMsSinceRunStart = 0) {
      const delayMs = sampleDelayMs()
      const noiseAmps = sampleNoise()
      const sampleAt = Math.max(0, elapsedMsSinceRunStart - delayMs)
      const sampledTrue = trueLoadAt(sampleAt)
      lastTrueLoad = trueLoadAt(elapsedMsSinceRunStart)

      if (!shedApplied) {
        // Reported load = delayed sample + noise (may look safer than truth).
        loadAmps = Math.max(0, Math.min(limitAmps + 5, sampledTrue + noiseAmps))
      }

      const headroomAmps = Math.max(0, limitAmps - loadAmps)
      const timeToTripMs =
        riseAmpsPerMs > 0 ? headroomAmps / riseAmpsPerMs : Number.POSITIVE_INFINITY
      const trueHeadroom = Math.max(0, limitAmps - lastTrueLoad)
      const trueTimeToTripMs =
        riseAmpsPerMs > 0 ? trueHeadroom / riseAmpsPerMs : Number.POSITIVE_INFINITY

      return {
        loadAmps: round1(loadAmps),
        breakerLimitAmps: limitAmps,
        headroomAmps: round1(headroomAmps),
        timeToTripMs: round1(timeToTripMs),
        trueLoadAmps: round1(lastTrueLoad),
        trueTimeToTripMs: round1(trueTimeToTripMs),
        sensorDelayMs: round1(delayMs),
        sensorNoiseAmps: round1(noiseAmps),
        plantMode: mode,
      }
    },
    applyShed(reductionAmps = SHED_REDUCTION_AMPS) {
      // Shed acts on true rack load, not the noisy reading.
      loadAmps = Math.max(0, lastTrueLoad - reductionAmps)
      shedApplied = true
      lastTrueLoad = loadAmps
      return { loadAmps: round1(loadAmps), tripped: loadAmps >= limitAmps }
    },
    wouldHaveTripped(elapsedMs: number) {
      if (shedApplied) return false
      return trueLoadAt(elapsedMs) >= limitAmps
    },
    trueLoadAt(elapsedMs: number) {
      return round1(trueLoadAt(elapsedMs))
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
  riseAmpsPerMs?: number
}): BreakerLatencyReport {
  const sensorToGateMs = round1(input.gateTs - input.sensorTs)
  const gateToShedMs = round1(input.shedTs - input.gateTs)
  const sensorToShedMs = round1(input.shedTs - input.sensorTs)
  const trueWindow = input.reading.trueTimeToTripMs
  const shedBeatCurve =
    sensorToShedMs < trueWindow && !input.plantTripped
  const shedBeforeTrip = shedBeatCurve
  const withinBudget = sensorToShedMs <= input.tripBudgetMs && shedBeforeTrip
  const mode = input.reading.plantMode
  const rise =
    input.riseAmpsPerMs ??
    (mode === 'hard' ? HARD_RISE_AMPS_PER_MS : RISE_AMPS_PER_MS)

  const curveNote =
    mode === 'hard'
      ? `Hard soft-plant: rise ${rise} A/ms from noisier/delayed sensor; ` +
        `trip budget ${input.tripBudgetMs} ms · sensor delay ${input.reading.sensorDelayMs} ms · ` +
        `noise ${input.reading.sensorNoiseAmps} A. Sim only — not physical breaker hardware.`
      : `Soft-plant assumed curve: load rises ${rise} A/ms toward ` +
        `${input.reading.breakerLimitAmps} A; trip budget ${input.tripBudgetMs} ms ` +
        `from sensor sample. Not physical breaker hardware.`

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
    curveNote,
    plantMode: mode,
    trueTimeToTripMs: trueWindow,
    sensorDelayMs: input.reading.sensorDelayMs,
    sensorNoiseAmps: input.reading.sensorNoiseAmps,
    shedBeatCurve,
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

/** Tiny seeded RNG for deterministic hard-plant tests. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
