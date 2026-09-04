import type { AuditEntry, TraceEvent } from '../kernel/types'

interface Props {
  events: TraceEvent[]
  audit: AuditEntry[]
}

export function TracePanel({ events, audit }: Props) {
  return (
    <div className="trace-wrap">
      <div className="panel trace" aria-label="Execution trace">
        <h3>Trace</h3>
        {events.length === 0 ? (
          <p className="muted">Events appear here as the orchestrator runs.</p>
        ) : (
          <ol className="trace-list">
            {events.map((e) => (
              <li key={e.id} className={`trace-item kind-${e.kind.replace(/\./g, '-')}`}>
                <span className="trace-kind">{e.kind}</span>
                <span className="trace-summary">{e.summary}</span>
                {e.phase ? <span className="trace-phase">{e.phase}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="panel audit" aria-label="Audit log">
        <h3>Audit log</h3>
        {audit.length === 0 ? (
          <p className="muted">Stage 4 writes audit entries here.</p>
        ) : (
          <ul className="audit-list">
            {audit.map((a) => (
              <li key={a.id} className={`audit-item decision-${a.decision}`}>
                <strong>{a.decision}</strong> — {a.action}
                <div className="muted small">
                  {a.actor}
                  {a.detail ? ` · ${a.detail}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
