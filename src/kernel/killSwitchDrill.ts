import { createOrchestrator, Orchestrator } from './orchestrator'
import { scoreActionTier } from './gateTiers'
import { HARD_TRIP_BUDGET_MS, nowMs } from './breakerPlant'
import { createEvent, nextId } from './events'
import type {
  AgentPhase,
  AgentRole,
  AgentStopAttribution,
  AuditEntry,
  GateTier,
  OverrideDecision,
  ProposedAction,
  ScoreInputs,
  SkinId,
  TraceEvent,
} from './types'

/**
 * Kill-switch drill: a repeatable exercise of the real Stage 4 machinery
 * that reports TWO clocks into the audit trail.
 *
 *   HUMAN clock: from the moment the run presents its alert (the human
 *   override request) to the moment the human decides and presses stop.
 *   Notice, decide, act. This is a trend metric; no single run passes or
 *   fails on it.
 *
 *   SYSTEM clock: from the stop signal (the human's decision) to the run
 *   reaching its final halted state. This is the human-in-the-loop cousin
 *   of the breaker latency report: there the machine measures gate to
 *   shed against the hard trip budget; here the stop signal starts the
 *   clock and the halted run stops it, judged against the same hard
 *   budget reference (HARD_TRIP_BUDGET_MS, ~22 ms).
 *
 * The drill is not a parallel simulation. It starts a governed Stage 4
 * run on a real Orchestrator, waits for the run to pause at the policy
 * gate with its alert presented, hands the pending action to a responder,
 * and resolves the override through the orchestrator's real
 * resolveOverride path. In the app the responder is the human at the
 * override panel; in tests it is a simulated responder on an injected
 * clock, which is what makes the drill deterministic.
 *
 * Fail loudly: a drill that cannot produce both clocks never writes a
 * successful record. validateDrillRecord throws KillSwitchDrillError,
 * and the drill runs it before its audit entry is written.
 *
 * STOP ATTRIBUTION: the two clocks are whole-loop measurements, and
 * this drill also says where in the loop the stop landed. The paused
 * run's event trace is reconstructed into a per-agent record: which
 * agent proposed the action the run paused on, which agent was staged
 * to execute it, and where every participating agent stood when the
 * alert was presented (completed, its action under review, or staged
 * to execute). A stop lands on the staged agent: its pending execution
 * is the work the stop cancels. Attribution is structural, read off
 * the real trace; the drill does not invent per-agent halt latencies
 * the synchronous machinery never measured. A drill whose trace
 * cannot identify its proposer and its staged executor fails loudly
 * like a drill with a missing clock.
 */

export class KillSwitchDrillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KillSwitchDrillError'
  }
}

/** The incident the drill exercises unless the caller supplies its own. */
export const DEFAULT_DRILL_PROMPT =
  'Critical irreversible purge of student records'

export interface DrillResponderContext {
  /** The consequential action the run is paused on. */
  action: ProposedAction
  /** Human-readable description of the incident being drilled. */
  incident: string
  /** When the alert was presented, on the drill's clock. */
  alertPresentedAt: number
}

/**
 * Supplies the human decision for the pending action. Returning a
 * rejection is pressing stop: the action never executes and the run
 * halts. An approval lets the action proceed to completion, which still
 * ends the run and stops both clocks.
 */
export type DrillResponder = (
  ctx: DrillResponderContext,
) => OverrideDecision

export interface KillSwitchDrillOptions {
  /** Supplies the human decision (the real override in the app). */
  responder: DrillResponder
  /** Orchestrator to drill on. Defaults to a fresh one. */
  orchestrator?: Orchestrator
  /** Prompt fed to the governed run. Defaults to DEFAULT_DRILL_PROMPT. */
  prompt?: string
  /** Human-readable incident description. Defaults to the prompt. */
  incident?: string
  /**
   * Skin for the governed run. Defaults to 'highered', whose Stage 4
   * flow pauses for a human override. The enterprise skin takes the
   * rack-protection auto path and never presents an alert, so a drill
   * pointed there fails loudly instead of fabricating clocks.
   */
  skin?: SkinId
  /** Injected clock. Defaults to nowMs (performance.now), as the orchestrator uses. */
  now?: () => number
  /** Budget for the system clock. Defaults to the hard plant trip budget. */
  systemBudgetMs?: number
  /** Drill id. Defaults to a generated id. */
  drillId?: string
}

export interface KillSwitchDrillResult {
  drillId: string
  incident: string
  /** Title of the Tier 3 action the drill halted (or let complete). */
  actionTitle: string
  alertPresentedAt: number
  decisionAt: number
  haltedAt: number
  /** decisionAt - alertPresentedAt. Trend metric, no pass/fail budget. */
  humanClockMs: number
  /** haltedAt - decisionAt. Held to systemBudgetMs. */
  systemClockMs: number
  systemBudgetMs: number
  systemWithinBudget: boolean
  /** Gate score of the halted action, from the real scorer. */
  tier: GateTier
  scoreInputs: ScoreInputs
  floorApplied: boolean
  /** Responder identity recorded for the decision (approver fallback rules as in resolveOverride). */
  approver: string
  /** True when the responder pressed stop (rejected) and nothing executed. */
  stopped: boolean
  /** Per-agent stop attribution from the paused run's event trace. */
  stopAttribution: AgentStopAttribution[]
  /** The agent that proposed the action the run paused on. */
  actionProposedBy: AgentRole
  /** The agent staged to execute the action once the gate cleared. */
  executionStagedWith: AgentRole
  /**
   * Where a stop landed: the staged agent, whose pending execution
   * the stop cancelled. Null when the responder approved the action
   * (no stop, so no landing).
   */
  stopLandedOn: AgentRole | null
  /** Id of the audit entry carrying both clocks. Find it by drillId too. */
  auditEntryId: string
}

/**
 * Reconstruct per-agent stop attribution from the paused run's event
 * trace. The proposer is the agent on the action.proposed event; the
 * staged executor is the agent working the evaluate phase, where the
 * pending action is simulated before the gate. Throws
 * KillSwitchDrillError when the trace cannot identify either one.
 */
export function buildStopAttribution(events: TraceEvent[]): {
  attribution: AgentStopAttribution[]
  actionProposedBy: AgentRole
  executionStagedWith: AgentRole
} {
  const byAgent = new Map<
    AgentRole,
    { phases: AgentPhase[]; eventCount: number; lastEventIndex: number }
  >()
  let proposer: AgentRole | undefined
  let staged: AgentRole | undefined
  events.forEach((event, index) => {
    if (event.kind === 'action.proposed' && event.agent) {
      proposer = event.agent
    }
    if (event.phase === 'evaluate' && event.agent) {
      staged = event.agent
    }
    if (!event.agent) return
    const record = byAgent.get(event.agent) ?? {
      phases: [] as AgentPhase[],
      eventCount: 0,
      lastEventIndex: -1,
    }
    record.eventCount += 1
    record.lastEventIndex = index
    if (event.phase && !record.phases.includes(event.phase)) {
      record.phases.push(event.phase)
    }
    byAgent.set(event.agent, record)
  })
  if (!proposer) {
    throw new KillSwitchDrillError(
      'Kill-switch drill could not attribute its stop: the paused run trace has no action.proposed event with an agent, so the proposer is unknown. No record was written.',
    )
  }
  if (!staged) {
    throw new KillSwitchDrillError(
      'Kill-switch drill could not attribute its stop: the paused run trace has no evaluate-phase agent, so the staged executor is unknown. No record was written.',
    )
  }
  const attribution: AgentStopAttribution[] = [...byAgent.entries()]
    .map(([agent, record]) => ({
      agent,
      phases: record.phases,
      eventCount: record.eventCount,
      lastEventIndex: record.lastEventIndex,
      proposedAction: agent === proposer,
      stagedToExecute: agent === staged,
      stateAtAlert: (agent === staged
        ? 'staged-to-execute'
        : agent === proposer
          ? 'action-under-review'
          : 'completed') as AgentStopAttribution['stateAtAlert'],
    }))
    .sort((a, b) => a.lastEventIndex - b.lastEventIndex)
  return {
    attribution,
    actionProposedBy: proposer,
    executionStagedWith: staged,
  }
}

/**
 * The fail-loudly gate for drill records. Throws KillSwitchDrillError
 * when either clock is missing, negative, or not a finite number.
 * When the record carries stop attribution, also refuses attribution
 * that is empty, does not name exactly one proposer and one staged
 * executor, or disagrees with where the stop landed.
 */
export function validateDrillRecord(record: {
  humanClockMs?: number
  systemClockMs?: number
  stopped?: boolean
  stopAttribution?: AgentStopAttribution[]
  executionStagedWith?: AgentRole
  stopLandedOn?: AgentRole | null
}): void {
  for (const key of ['humanClockMs', 'systemClockMs'] as const) {
    const value = record[key]
    if (value === undefined || value === null) {
      throw new KillSwitchDrillError(
        `Kill-switch drill record is missing ${key}; a drill that cannot produce both clocks is not a successful drill.`,
      )
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new KillSwitchDrillError(
        `Kill-switch drill record has a non-finite ${key} (${String(value)}); refusing to record it.`,
      )
    }
    if (value < 0) {
      throw new KillSwitchDrillError(
        `Kill-switch drill record has a negative ${key} (${value} ms); the clock ran backwards, so the drill is invalid.`,
      )
    }
  }
  if (record.stopAttribution !== undefined) {
    const attribution = record.stopAttribution
    if (!Array.isArray(attribution) || attribution.length === 0) {
      throw new KillSwitchDrillError(
        'Kill-switch drill record has empty stop attribution; a drill that cannot say where its stop landed is not a successful drill.',
      )
    }
    if (attribution.filter((a) => a.proposedAction).length !== 1) {
      throw new KillSwitchDrillError(
        'Kill-switch drill stop attribution must name exactly one agent that proposed the paused action.',
      )
    }
    if (attribution.filter((a) => a.stagedToExecute).length !== 1) {
      throw new KillSwitchDrillError(
        'Kill-switch drill stop attribution must name exactly one agent staged to execute the paused action.',
      )
    }
    if (
      record.stopped === true &&
      record.stopLandedOn !== record.executionStagedWith
    ) {
      throw new KillSwitchDrillError(
        `Kill-switch drill record is inconsistent: the run was stopped, but the stop landed on ${String(record.stopLandedOn)} instead of the staged executor ${String(record.executionStagedWith)}.`,
      )
    }
    if (
      record.stopped === false &&
      record.stopLandedOn !== null &&
      record.stopLandedOn !== undefined
    ) {
      throw new KillSwitchDrillError(
        'Kill-switch drill record is inconsistent: the action was approved, so the stop cannot have landed on any agent.',
      )
    }
  }
}

/**
 * Run one kill-switch drill against the real Stage 4 machinery and write
 * the two clocks into the orchestrator's audit trail.
 */
export function runKillSwitchDrill(
  options: KillSwitchDrillOptions,
): KillSwitchDrillResult {
  const now = options.now ?? nowMs
  const orch = options.orchestrator ?? createOrchestrator()
  const prompt = options.prompt ?? DEFAULT_DRILL_PROMPT
  const incident = options.incident ?? prompt
  const skin: SkinId = options.skin ?? 'highered'
  const systemBudgetMs = options.systemBudgetMs ?? HARD_TRIP_BUDGET_MS
  const drillId = options.drillId ?? nextId('drill')

  // Start the governed run. Stage 4 higher-ed pauses at the policy gate
  // and presents its alert as a human override request.
  const paused = orch.run({ prompt, stage: 4, skin })
  if (!paused.awaitingOverride || !paused.proposedAction) {
    throw new KillSwitchDrillError(
      `Kill-switch drill needs a governed run paused at its alert, but the run (skin: ${skin}) did not present a human override request. No clocks were recorded.`,
    )
  }
  const action = paused.proposedAction

  // The drill only drills consequential actions. Score through the real
  // gate scorer and refuse anything below Tier 3.
  const score = scoreActionTier(action)
  if (score.tier !== 3) {
    throw new KillSwitchDrillError(
      `Kill-switch drill only exercises Tier 3 actions, but "${action.title}" scored Tier ${score.tier}. No clocks were recorded.`,
    )
  }

  // Stop attribution is read off the paused run's trace now, while the
  // trace still shows the world exactly as it stood when the alert was
  // presented (resolveOverride appends its own events later).
  const { attribution, actionProposedBy, executionStagedWith } =
    buildStopAttribution(orch.bus.getEvents())

  // HUMAN clock starts: the alert has been presented to the human.
  const alertPresentedAt = now()

  // The human notices, decides, and acts. The responder is that human.
  const decision = options.responder({ action, incident, alertPresentedAt })
  const decisionAt = now()

  // SYSTEM clock starts at the stop signal. Resolve through the real
  // override path; the run reaching its final state stops the clock.
  const final = orch.resolveOverride(decision)
  const haltedAt = now()
  if (final.awaitingOverride) {
    throw new KillSwitchDrillError(
      'Kill-switch drill resolved the override but the run is still awaiting a decision; it never halted, so no record was written.',
    )
  }

  const humanClockMs = decisionAt - alertPresentedAt
  const systemClockMs = haltedAt - decisionAt
  const approver = decision.approver ?? 'human'
  const stopped = !decision.approved

  const result: KillSwitchDrillResult = {
    drillId,
    incident,
    actionTitle: action.title,
    alertPresentedAt,
    decisionAt,
    haltedAt,
    humanClockMs,
    systemClockMs,
    systemBudgetMs,
    systemWithinBudget: systemClockMs <= systemBudgetMs,
    tier: score.tier,
    scoreInputs: score.inputs,
    floorApplied: score.floorApplied,
    approver,
    stopped,
    stopAttribution: attribution,
    actionProposedBy,
    executionStagedWith,
    stopLandedOn: stopped ? executionStagedWith : null,
    auditEntryId: '',
  }

  // Fail loudly BEFORE writing anything: an incomplete drill leaves no
  // successful record behind.
  validateDrillRecord(result)

  const entry: AuditEntry = orch.audit.record({
    stage: 4,
    skin,
    action: action.title,
    decision: decision.approved ? 'approved' : 'overridden',
    actor: 'kill-switch-drill',
    detail: stopped
      ? `Kill-switch drill ${drillId}: stop by ${approver}. Human clock ${humanClockMs} ms (alert to decision), system clock ${systemClockMs} ms (decision to halted, budget ${systemBudgetMs} ms, within budget: ${result.systemWithinBudget}). Action halted before execution. Stop attribution: proposed by ${actionProposedBy}, staged to execute with ${executionStagedWith}, stop landed on ${executionStagedWith}; every other participating agent had completed or was under review before the gate.`
      : `Kill-switch drill ${drillId}: ${approver} approved the halted action. Human clock ${humanClockMs} ms (alert to decision), system clock ${systemClockMs} ms (decision to run complete, budget ${systemBudgetMs} ms, within budget: ${result.systemWithinBudget}). Attribution: proposed by ${actionProposedBy}, staged to execute with ${executionStagedWith}; approved, so no stop landed.`,
    tier: score.tier,
    scoreInputs: score.inputs,
    floorApplied: score.floorApplied,
    approvedBy: approver,
    approvedAt: decisionAt,
    drillId,
    humanClockMs,
    systemClockMs,
    actionProposedBy,
    executionStagedWith,
    stopLandedOn: result.stopLandedOn,
    stopAttribution: attribution,
  })
  result.auditEntryId = entry.id

  orch.bus.emit(
    createEvent({
      kind: 'audit.entry',
      stage: 4,
      skin,
      summary: `Audit: kill-switch drill ${drillId}: human ${humanClockMs} ms, system ${systemClockMs} ms`,
      detail: { entry },
    }),
  )

  return result
}
