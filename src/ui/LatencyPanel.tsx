import type { BreakerLatencyReport } from '../kernel/types'

interface Props {
  latency: BreakerLatencyReport | null
}

export function LatencyPanel({ latency }: Props) {
  if (!latency) {
    return (
      <div className="panel latency" aria-label="Breaker-amp latency">
        <h3>Breaker-amp latency</h3>
        <p className="muted">
          Enterprise Stage-4 rack-protection publishes sensor→gate→shed ms against a
          soft-plant trip budget. Toggle hard mode for noise, sensor delay, and a
          tighter curve. Higher-Ed Stage-4 still uses human override (no breaker
          curve).
        </p>
      </div>
    )
  }

  const hard = latency.plantMode === 'hard'
  const status = latency.plantTripped
    ? 'trip'
    : latency.withinBudget
      ? 'ok'
      : 'late'

  return (
    <div className="panel latency" aria-label="Breaker-amp latency">
      <h3>
        Breaker-amp latency{' '}
        {hard ? <span className="latency-status status-hard">HARD MODE</span> : null}{' '}
        <span className={`latency-status status-${status}`}>
          {latency.plantTripped
            ? 'TRIPPED'
            : latency.withinBudget
              ? 'WITHIN BUDGET'
              : 'OVER BUDGET'}
        </span>
      </h3>
      <div className="eval-grid">
        <div className="eval-metric">
          <span className="eval-label">Sensor → gate</span>
          <strong>{latency.sensorToGateMs} ms</strong>
        </div>
        <div className="eval-metric">
          <span className="eval-label">Gate → shed</span>
          <strong>{latency.gateToShedMs} ms</strong>
        </div>
        <div className="eval-metric">
          <span className="eval-label">Sensor → shed</span>
          <strong>{latency.sensorToShedMs} ms</strong>
        </div>
        <div className="eval-metric">
          <span className="eval-label">Trip budget</span>
          <strong>{latency.tripBudgetMs} ms</strong>
        </div>
      </div>
      <p className="latency-amps muted small">
        Load {latency.loadAmpsAtSensor} A → {latency.loadAmpsAfterShed} A (limit{' '}
        {latency.breakerLimitAmps} A) ·{' '}
        {hard ? (
          <>
            true time-to-trip {latency.trueTimeToTripMs} ms · delay{' '}
            {latency.sensorDelayMs} ms · noise {latency.sensorNoiseAmps} A · shed
            beat curve under noise/delay:{' '}
            <strong>{latency.shedBeatCurve ? 'yes' : 'no'}</strong>
          </>
        ) : (
          <>
            soft-plant time-to-trip {latency.timeToTripMs} ms · shed before trip:{' '}
            {latency.shedBeforeTrip ? 'yes' : 'no'}
          </>
        )}
      </p>
      <p className="muted small">{latency.curveNote}</p>
    </div>
  )
}
