/** Maturity stages — each changes real orchestrator behavior. */
export type MaturityStage = 1 | 2 | 3 | 4

export type SkinId = 'enterprise' | 'highered'

/** AGENT Framework phases (Assess → Generate → Evaluate → Navigate → Track). */
export type AgentPhase = 'assess' | 'generate' | 'evaluate' | 'navigate' | 'track'

export type AgentRole = 'researcher' | 'planner' | 'executor' | 'assistant' | 'robot'

export type EventKind =
  | 'run.started'
  | 'phase.started'
  | 'phase.completed'
  | 'agent.thinking'
  | 'agent.message'
  | 'tool.called'
  | 'tool.result'
  | 'sensor.read'
  | 'policy.check'
  | 'policy.blocked'
  | 'human.override.requested'
  | 'human.override.decision'
  | 'action.proposed'
  | 'action.executed'
  | 'breaker.latency'
  | 'run.completed'
  | 'audit.entry'

export interface TraceEvent {
  id: string
  ts: number
  kind: EventKind
  stage: MaturityStage
  skin: SkinId
  agent?: AgentRole
  phase?: AgentPhase
  summary: string
  detail?: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'system' | 'agent'
  agent?: AgentRole
  content: string
  ts: number
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  name: string
  ok: boolean
  data: unknown
}

export interface ProposedAction {
  id: string
  title: string
  description: string
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
}


export type PlantMode = 'free' | 'hard'

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

export interface AuditEntry {
  id: string
  ts: number
  stage: MaturityStage
  skin: SkinId
  action: string
  decision: 'allowed' | 'blocked' | 'overridden' | 'approved'
  actor: string
  detail?: string
}

export interface ScenarioConfig {
  skin: SkinId
  title: string
  subtitle: string
  promptPlaceholder: string
  defaultPrompt: string
  contextLabel: string
  actionVerb: string
  sampleFacts: string[]
}

export interface RunInput {
  prompt: string
  stage: MaturityStage
  skin: SkinId
  /** Test/demo: artificial delay (ms) before shed — fail path vs trip budget. */
  injectDelayMs?: number
  /** Soft-plant difficulty: free (~50ms) or hard (noise/delay/tighter curve). */
  plantMode?: PlantMode
  /** Deterministic RNG for hard-plant sensor noise/delay (tests). */
  plantRng?: () => number
  /** Force sensor delay ms in hard plant (tests). */
  forceSensorDelayMs?: number
  /** Force sensor noise amps in hard plant (tests). */
  forceNoiseAmps?: number
}

export interface EvalMetrics {
  decisionQuality: number
  cycleTimeMs: number
  costUnits: number
  riskScore: number
  band: 'A' | 'B' | 'C' | 'D'
  notes: string[]
}

export interface RunResult {
  messages: ChatMessage[]
  events: TraceEvent[]
  audit: AuditEntry[]
  proposedAction: ProposedAction | null
  awaitingOverride: boolean
  finalSummary: string
  metrics: EvalMetrics | null
  /** Soft-plant breaker-amp latency (Enterprise Stage-4 rack-protection). */
  latency: BreakerLatencyReport | null
}

export interface OverrideDecision {
  approved: boolean
  note?: string
}

export const STAGE_META: Record<
  MaturityStage,
  { name: string; label: string; blurb: string }
> = {
  1: {
    name: 'Assisted',
    label: 'Stage 1 — Assisted',
    blurb: 'Single suggestion. Human does the work.',
  },
  2: {
    name: 'Augmented',
    label: 'Stage 2 — Augmented',
    blurb: 'One tool-using agent proposes and calls stub tools.',
  },
  3: {
    name: 'Coordinated',
    label: 'Stage 3 — Coordinated',
    blurb: 'Orchestrator coordinates ≥2 specialist agents.',
  },
  4: {
    name: 'Governed',
    label: 'Stage 4 — Governed',
    blurb: 'Multi-agent + policy gate + audit log + human override.',
  },
}

export const AGENT_PHASES: AgentPhase[] = [
  'assess',
  'generate',
  'evaluate',
  'navigate',
  'track',
]
