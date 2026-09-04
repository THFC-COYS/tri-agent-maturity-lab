import type { PlantMode } from '../kernel/types'

interface Props {
  prompt: string
  onPromptChange: (v: string) => void
  placeholder: string
  onRun: () => void
  onReset: () => void
  running: boolean
  behaviorHint: string
  /** Enterprise rack path: free vs hard soft-plant. */
  plantMode?: PlantMode
  onPlantModeChange?: (mode: PlantMode) => void
  showPlantMode?: boolean
}

export function ControlBar({
  prompt,
  onPromptChange,
  placeholder,
  onRun,
  onReset,
  running,
  behaviorHint,
  plantMode = 'free',
  onPlantModeChange,
  showPlantMode = false,
}: Props) {
  return (
    <div className="control-bar">
      <label className="prompt-label">
        Scenario prompt
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={running}
        />
      </label>
      <p className="behavior-hint muted">{behaviorHint}</p>
      {showPlantMode && onPlantModeChange ? (
        <div className="plant-mode-toggle" role="group" aria-label="Soft-plant mode">
          <span className="plant-mode-label">Soft-plant</span>
          <button
            type="button"
            className={`btn chip ${plantMode === 'free' ? 'active' : ''}`}
            onClick={() => onPlantModeChange('free')}
            disabled={running}
          >
            Free (~50 ms)
          </button>
          <button
            type="button"
            className={`btn chip ${plantMode === 'hard' ? 'active' : ''}`}
            onClick={() => onPlantModeChange('hard')}
            disabled={running}
          >
            Hard mode
          </button>
        </div>
      ) : null}
      <div className="control-actions">
        <button type="button" className="btn ghost" onClick={onReset} disabled={running}>
          Reset
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onRun}
          disabled={running || !prompt.trim()}
        >
          Run scenario
        </button>
      </div>
    </div>
  )
}
