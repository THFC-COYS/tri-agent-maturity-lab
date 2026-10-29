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

/** Policy gate tiers: Tier 1 run free, Tier 2 notify, Tier 3 wait for a human. */
export type GateTier = 1 | 2 | 3

/**
 * What kind of action is proposed. The classes send / pay / delete / publish
 * are floor classes: the Stage 4 gate scores them Tier 3 no matter what the
 * other inputs claim.
 */
export type ActionClass =
  | 'research'
  | 'draft'
  | 'internal'
  | 'notify'
  | 'send'
  | 'pay'
  | 'delete'
  | 'publish'
  | 'other'

/** How much damage a bad run could do if the action goes wrong. */
export type BlastRadius = 'low' | 'medium' | 'high'

/** The inputs the policy gate scores before it assigns a tier. */
export interface ScoreInputs {
  actionClass: ActionClass
  reversible: boolean
  blastRadius: BlastRadius
  /** True when the action's effect leaves this system (an email sent, an API called, money moved). */
  leavesSystem: boolean
}

export interface ProposedAction {
  id: string
  title: string
  description: string
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
  /**
   * Optional gate-scoring fields. When absent, the gate derives them
   * deterministically (see scoreActionTier in gateTiers.ts).
   */
  actionClass?: ActionClass
  blastRadius?: BlastRadius
  leavesSystem?: boolean
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
  /**
   * Gate-scoring record. Optional so audit entries written before tiers
   * existed (and non-gate entries) stay valid; policy entries carry them.
   */
  tier?: GateTier
  scoreInputs?: ScoreInputs
  /** True when the hard floor forced Tier 3 regardless of scoring inputs. */
  floorApplied?: boolean
  /** Who approved a Tier 3 action via human override, and when (ms epoch). */
  approvedBy?: string
  approvedAt?: number
  /**
   * Kill-switch drill record. Present only on the entry a drill writes:
   * the drill id, and the drill's two clocks (see killSwitchDrill.ts).
   * humanClockMs is alert presented to human decision; systemClockMs is
   * stop signal to the run reaching its final halted state.
   */
  drillId?: string
  humanClockMs?: number
  systemClockMs?: number
  /**
   * Kill-switch drill stop attribution. Present only on the entry a
   * drill writes: which agent proposed the halted action, which agent
   * was staged to execute it, where a stop landed, and the per-agent
   * breakdown (see AgentStopAttribution in this file and
   * killSwitchDrill.ts).
   */
  actionProposedBy?: AgentRole
  executionStagedWith?: AgentRole
  stopLandedOn?: AgentRole | null
  stopAttribution?: AgentStopAttribution[]
}

/**
 * One agent's part in a kill-switch drill, reconstructed from the
 * paused run's real event trace. Attribution names roles and states;
 * it does not fabricate per-agent halt latencies: the system clock
 * stays a whole-loop measurement, and this record says where in the
 * loop the stop landed.
 */
export interface AgentStopAttribution {
  agent: AgentRole
  /** Phases the agent worked in during the run, in first-seen order. */
  phases: AgentPhase[]
  /** Trace events the agent emitted before the alert was presented. */
  eventCount: number
  /** Position of the agent's last event in the run trace (0-based). */
  lastEventIndex: number
  /** True for the agent that proposed the action the run paused on. */
  proposedAction: boolean
  /** True for the agent staged to execute the action after the gate. */
  stagedToExecute: boolean
  /**
   * Where the agent stood when the alert was presented: it had
   * completed its work, its proposal was the action under review, or
   * it was staged to execute that action.
   */
  stateAtAlert: 'completed' | 'action-under-review' | 'staged-to-execute'
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
  /**
   * Who is deciding. Recorded on the audit entry as approvedBy for
   * approvals; when absent the orchestrator records its default human
   * actor label.
   */
  approver?: string
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
