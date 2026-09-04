import { useState } from 'react'
import type { ProposedAction } from '../kernel/types'

interface Props {
  action: ProposedAction
  onDecide: (approved: boolean, note: string) => void
}

export function OverridePanel({ action, onDecide }: Props) {
  const [note, setNote] = useState('')
  return (
    <div className="override-panel" role="dialog" aria-label="Human override">
      <h3>Human override required</h3>
      <p>
        <strong>{action.title}</strong>
      </p>
      <p className="muted">{action.description}</p>
      <p>
        Risk: <span className={`risk risk-${action.risk}`}>{action.risk}</span>
        {' · '}
        Reversible: {action.reversible ? 'yes' : 'no'}
      </p>
      <label className="override-note">
        Note (optional)
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for decision"
        />
      </label>
      <div className="override-actions">
        <button type="button" className="btn danger" onClick={() => onDecide(false, note)}>
          Reject
        </button>
        <button type="button" className="btn primary" onClick={() => onDecide(true, note)}>
          Approve &amp; execute
        </button>
      </div>
    </div>
  )
}
