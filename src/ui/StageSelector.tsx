import type { MaturityStage } from '../kernel/types'
import { STAGE_META } from '../kernel/types'

interface Props {
  stage: MaturityStage
  onChange: (stage: MaturityStage) => void
  disabled?: boolean
}

const STAGES: MaturityStage[] = [1, 2, 3, 4]

export function StageSelector({ stage, onChange, disabled }: Props) {
  return (
    <div className="stage-selector" role="group" aria-label="Maturity stage">
      {STAGES.map((s) => {
        const meta = STAGE_META[s]
        const active = s === stage
        return (
          <button
            key={s}
            type="button"
            className={`stage-chip ${active ? 'active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(s)}
            title={meta.blurb}
          >
            <span className="stage-num">{s}</span>
            <span className="stage-name">{meta.name}</span>
          </button>
        )
      })}
    </div>
  )
}
