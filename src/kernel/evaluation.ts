import type {
  AuditEntry,
  EvalMetrics,
  MaturityStage,
  ProposedAction,
  TraceEvent,
} from './types'

const STAGE_BASE_MS: Record<MaturityStage, number> = {
  1: 80,
  2: 220,
  3: 480,
  4: 620,
}

const STAGE_COST_WEIGHT: Record<MaturityStage, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 5,
}

function riskPoints(action: ProposedAction | null): number {
  if (!action) return 15
  if (action.risk === 'high') return action.reversible ? 70 : 90
  if (action.risk === 'medium') return 45
  return 20
}

/**
 * Deterministic evaluation harness — decision quality, cycle time, cost, risk.
 * Same inputs → same metrics always. No randomness, no network.
 */
export function evaluateRun(input: {
  stage: MaturityStage
  events: TraceEvent[]
  audit: AuditEntry[]
  proposedAction: ProposedAction | null
  awaitingOverride: boolean
  executed: boolean
  overrideApproved?: boolean | null
}): EvalMetrics {
  const notes: string[] = []
  const toolCalls = input.events.filter((e) => e.kind === 'tool.called').length
  const agents = new Set(
    input.events.filter((e) => e.agent).map((e) => e.agent),
  ).size
  const phases = new Set(
    input.events.filter((e) => e.phase).map((e) => e.phase),
  ).size
  const hasGate = input.events.some((e) => e.kind === 'policy.check')
  const hasAudit = input.audit.length > 0
  const hasRobot = input.events.some((e) => e.agent === 'robot')

  let quality = 35
  quality += Math.min(25, phases * 5)
  quality += Math.min(15, toolCalls * 3)
  quality += Math.min(15, Math.max(0, agents - 1) * 5)
  if (input.stage >= 3 && agents >= 2) {
    quality += 8
    notes.push('Multi-agent coordination credited.')
  }
  if (input.stage === 4 && hasGate) {
    quality += 8
    notes.push('Policy gate exercised.')
  }
  if (input.stage === 4 && hasAudit) {
    quality += 6
    notes.push('Audit trail present.')
  }
  if (hasRobot && input.executed) {
    quality += 5
    notes.push('Physical-digital handoff simulated.')
  }
  if (input.awaitingOverride) {
    quality = Math.min(quality, 78)
    notes.push('Paused for human override — quality capped until decision.')
  }
  if (input.overrideApproved === false) {
    quality += 4
    notes.push('Human rejection credited as governance signal.')
  }
  if (input.stage === 1) {
    notes.push('Stage 1: chat-style assist only — expect low automation credit.')
  }

  quality = Math.max(0, Math.min(100, quality))

  let cycleTimeMs =
    STAGE_BASE_MS[input.stage] + toolCalls * 35 + agents * 40 + phases * 15
  if (input.awaitingOverride) cycleTimeMs += 90
  if (input.overrideApproved != null) cycleTimeMs += 70
  if (hasRobot) cycleTimeMs += 55

  const costUnits =
    STAGE_COST_WEIGHT[input.stage] * 10 +
    toolCalls * 3 +
    agents * 5 +
    (hasRobot ? 8 : 0) +
    (hasGate ? 4 : 0)

  let risk = riskPoints(input.proposedAction)
  if (input.executed && input.stage >= 3) risk = Math.max(10, risk - 15)
  if (input.stage === 4 && hasGate) risk = Math.max(8, risk - 12)
  if (input.overrideApproved === true) risk = Math.max(5, risk - 10)
  if (input.overrideApproved === false) risk = Math.max(5, risk - 25)
  if (input.awaitingOverride) risk = Math.min(100, risk + 5)

  let band: EvalMetrics['band'] = 'D'
  if (quality >= 85 && risk <= 40) band = 'A'
  else if (quality >= 70) band = 'B'
  else if (quality >= 50) band = 'C'

  if (notes.length === 0) notes.push('Baseline scoring applied.')

  return {
    decisionQuality: quality,
    cycleTimeMs,
    costUnits,
    riskScore: risk,
    band,
    notes,
  }
}
