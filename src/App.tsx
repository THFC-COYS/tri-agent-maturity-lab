import { useMemo, useRef, useState } from 'react'
import {
  createOrchestrator,
  describeStageBehavior,
  STAGE_META,
  type MaturityStage,
  type RunResult,
  type SkinId,
} from './kernel'
import { getSkin } from './skins'
import { StageSelector } from './ui/StageSelector'
import { SkinSwitcher } from './ui/SkinSwitcher'
import { ConversationPanel } from './ui/ConversationPanel'
import { TracePanel } from './ui/TracePanel'
import { ControlBar } from './ui/ControlBar'
import { OverridePanel } from './ui/OverridePanel'
import { EvalPanel } from './ui/EvalPanel'

const emptyResult: RunResult = {
  messages: [],
  events: [],
  audit: [],
  proposedAction: null,
  awaitingOverride: false,
  finalSummary: '',
  metrics: null,
}

export default function App() {
  const orchRef = useRef(createOrchestrator())
  const [stage, setStage] = useState<MaturityStage>(1)
  const [skin, setSkin] = useState<SkinId>('enterprise')
  const skinCfg = getSkin(skin)
  const [prompt, setPrompt] = useState(skinCfg.defaultPrompt)
  const [result, setResult] = useState<RunResult>(emptyResult)
  const [awaiting, setAwaiting] = useState(false)

  const behaviorHint = useMemo(
    () => `${STAGE_META[stage].blurb} · ${describeStageBehavior(stage, skin)}`,
    [stage, skin],
  )

  function handleSkinChange(next: SkinId) {
    setSkin(next)
    setPrompt(getSkin(next).defaultPrompt)
    setResult(emptyResult)
    setAwaiting(false)
    orchRef.current = createOrchestrator()
  }

  function handleStageChange(next: MaturityStage) {
    setStage(next)
    setResult(emptyResult)
    setAwaiting(false)
    orchRef.current = createOrchestrator()
  }

  function handleRun() {
    orchRef.current = createOrchestrator()
    const out = orchRef.current.run({ prompt: prompt.trim(), stage, skin })
    setResult(out)
    setAwaiting(out.awaitingOverride)
  }

  function handleReset() {
    orchRef.current = createOrchestrator()
    setResult(emptyResult)
    setAwaiting(false)
    setPrompt(getSkin(skin).defaultPrompt)
  }

  function handleOverride(approved: boolean, note: string) {
    const out = orchRef.current.resolveOverride({ approved, note })
    setResult(out)
    setAwaiting(out.awaitingOverride)
  }

  return (
    <div className={`app skin-${skin}`}>
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Tri-Agent Maturity Lab</p>
          <h1>Prove AGENT + tri-agent workforce across 4 maturity stages</h1>
          <p className="lede">
            Tri-agent means human + AI specialists + stub robotics (physical-digital
            handoff). Switch Enterprise Ops or Higher-Ed skins. Change the stage and
            watch real control flow change — not just copy. Zero API keys. Deterministic
            stubs.
          </p>
        </div>
        <div className="frameworks">
          <div className="fw-card">
            <h2>AGENT</h2>
            <p>Assess · Generate · Evaluate · Navigate · Track</p>
          </div>
          <div className="fw-card">
            <h2>Tri-Agent</h2>
            <p>Human · AI agents · Robot/actuator</p>
          </div>
          <div className="fw-card">
            <h2>Maturity</h2>
            <p>Assisted → Augmented → Coordinated → Governed</p>
          </div>
        </div>
      </header>

      <section className="toolbar">
        <SkinSwitcher skin={skin} onChange={handleSkinChange} disabled={awaiting} />
        <StageSelector stage={stage} onChange={handleStageChange} disabled={awaiting} />
      </section>

      <section className="workspace">
        <div className="col main">
          <ControlBar
            prompt={prompt}
            onPromptChange={setPrompt}
            placeholder={skinCfg.promptPlaceholder}
            onRun={handleRun}
            onReset={handleReset}
            running={awaiting}
            behaviorHint={behaviorHint}
          />
          {awaiting && result.proposedAction ? (
            <OverridePanel action={result.proposedAction} onDecide={handleOverride} />
          ) : null}
          {result.finalSummary ? (
            <div className="summary-banner">{result.finalSummary}</div>
          ) : null}
          {result.metrics ? (
            <div className="metrics-banner" aria-label="Run evaluation">
              <strong>Eval {result.metrics.band}</strong>
              <span>quality {result.metrics.decisionQuality}</span>
              <span>cycle {result.metrics.cycleTimeMs}ms</span>
              <span>cost {result.metrics.costUnits}</span>
              <span>risk {result.metrics.riskScore}</span>
            </div>
          ) : null}
          <ConversationPanel messages={result.messages} />
        </div>
        <div className="col side">
          <EvalPanel metrics={result.metrics} />
          <TracePanel events={result.events} audit={result.audit} />
        </div>
      </section>

      <footer className="footer">
        <span>MIT · Greg Lucas · no secrets required</span>
        <span>{skinCfg.subtitle}</span>
      </footer>
    </div>
  )
}
