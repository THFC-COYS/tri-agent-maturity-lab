interface Props {
  prompt: string
  onPromptChange: (v: string) => void
  placeholder: string
  onRun: () => void
  onReset: () => void
  running: boolean
  behaviorHint: string
}

export function ControlBar({
  prompt,
  onPromptChange,
  placeholder,
  onRun,
  onReset,
  running,
  behaviorHint,
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
