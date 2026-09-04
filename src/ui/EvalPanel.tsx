import type { EvalMetrics } from '../kernel/types'

interface Props {
  metrics: EvalMetrics | null
}

export function EvalPanel({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="panel eval" aria-label="Evaluation harness">
        <h3>Evaluation</h3>
        <p className="muted">
          Deterministic scores (decision quality, cycle time, cost, risk) appear after a
          run.
        </p>
      </div>
    )
  }

  return (
    <div className="panel eval" aria-label="Evaluation harness">
      <h3>
        Evaluation <span className={`eval-band band-${metrics.band}`}>{metrics.band}</span>
      </h3>
      <div className="eval-grid">
        <div className="eval-metric">
          <span className="eval-label">Decision quality</span>
          <strong>{metrics.decisionQuality}</strong>
        </div>
        <div className="eval-metric">
          <span className="eval-label">Cycle time</span>
          <strong>{metrics.cycleTimeMs} ms</strong>
        </div>
        <div className="eval-metric">
          <span className="eval-label">Cost units</span>
          <strong>{metrics.costUnits}</strong>
        </div>
        <div className="eval-metric">
          <span className="eval-label">Risk</span>
          <strong>{metrics.riskScore}</strong>
        </div>
      </div>
      <ul className="eval-notes">
        {metrics.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  )
}
