import { AgentBus } from './agentBus'
import { AuditLog } from './auditLog'
import { createEvent, resetEventSeq } from './events'
import { evaluatePolicyGate, getPolicy } from './stagePolicies'
import type {
  BreakerLatencyReport,
  MaturityStage,
  OverrideDecision,
  ProposedAction,
  RunInput,
  RunResult,
  SkinId,
} from './types'
import {
  SHED_REDUCTION_AMPS,
  buildLatencyReport,
  busyWaitMs,
  createBreakerPlant,
  nowMs,
} from './breakerPlant'
import { runAssistant, runExecutor, runPlanner, runResearcher, runRobot, callTool } from '../agents'
import { getSkin } from '../skins'
import { evaluateRun } from './evaluation'

/**
 * In-process orchestrator. Stage policy changes real control flow —
 * not just labels in the UI.
 */
export class Orchestrator {
  readonly bus = new AgentBus()
  readonly audit = new AuditLog()
  private pending: {
    input: RunInput
    proposedAction: ProposedAction
    messagesSnapshot: RunResult
  } | null = null

  run(input: RunInput): RunResult {
    resetEventSeq()
    this.bus.clear()
    this.audit.clear()
    this.pending = null

    const policy = getPolicy(input.stage)
    const skin = getSkin(input.skin)

    this.bus.publishUser(input.prompt)
    this.bus.emit(
      createEvent({
        kind: 'run.started',
        stage: input.stage,
        skin: input.skin,
        summary: `Run started — Stage ${input.stage} (${policy.stage === 1 ? 'Assisted' : policy.stage === 2 ? 'Augmented' : policy.stage === 3 ? 'Coordinated' : 'Governed'}) · ${skin.title}`,
        detail: { prompt: input.prompt, policy },
      }),
    )

    if (input.stage === 1) {
      return this.runStage1(input)
    }
    if (input.stage === 2) {
      return this.runStage2(input)
    }
    // Stages 3 and 4 share multi-agent path; 4 adds gate + override.
    return this.runMultiAgent(input)
  }

  /** Complete a Stage 4 run after human override. */
  resolveOverride(decision: OverrideDecision): RunResult {
    if (!this.pending) {
      throw new Error('No pending override to resolve.')
    }
    const { input, proposedAction } = this.pending
    const skinCfg = getSkin(input.skin)

    this.bus.emit(
      createEvent({
        kind: 'human.override.decision',
        stage: input.stage,
        skin: input.skin,
        summary: decision.approved
          ? 'Human approved final action.'
          : 'Human rejected final action.',
        detail: { ...decision },
      }),
    )

    if (decision.approved) {
      const entry = this.audit.record({
        stage: input.stage,
        skin: input.skin,
        action: proposedAction.title,
        decision: 'approved',
        actor: 'human',
        detail: decision.note ?? 'Approved via override panel',
      })
      this.bus.emit(
        createEvent({
          kind: 'audit.entry',
          stage: input.stage,
          skin: input.skin,
          summary: `Audit: approved — ${proposedAction.title}`,
          detail: { entry },
        }),
      )
      return this.finalizeAction(input, proposedAction, true, true)
    }

    const entry = this.audit.record({
      stage: input.stage,
      skin: input.skin,
      action: proposedAction.title,
      decision: 'overridden',
      actor: 'human',
      detail: decision.note ?? 'Rejected via override panel',
    })
    this.bus.emit(
      createEvent({
        kind: 'audit.entry',
        stage: input.stage,
        skin: input.skin,
        summary: `Audit: overridden — ${proposedAction.title}`,
        detail: { entry },
      }),
    )
    this.bus.publishSystem(
      `Action blocked by human override. ${skinCfg.actionVerb} was not executed.`,
    )
    this.bus.emit(
      createEvent({
        kind: 'run.completed',
        stage: input.stage,
        skin: input.skin,
        summary: 'Run completed — action rejected by human.',
      }),
    )
    this.pending = null
    return this.snapshot(
      null,
      false,
      'Human override rejected the proposed action. No execution.',
      { executed: false, overrideApproved: false },
    )
  }

  private runStage1(input: RunInput): RunResult {
    this.emitPhase(input, 'assess', 'assistant')
    const suggestion = runAssistant(input.prompt, input.skin)
    this.bus.publishAgentMessage('assistant', suggestion, {
      stage: input.stage,
      skin: input.skin,
      phase: 'generate',
    })
    this.bus.publishSystem(
      'Stage 1 complete: suggestion only. Human performs all work — no tools, no agents beyond this tip.',
    )
    this.bus.emit(
      createEvent({
        kind: 'run.completed',
        stage: 1,
        skin: input.skin,
        summary: 'Stage 1 complete — assisted suggestion delivered.',
      }),
    )
    return this.snapshot(
      null,
      false,
      'Assisted mode: one suggestion. You own execution.',
      { executed: false, stage: 1 },
    )
  }

  private runStage2(input: RunInput): RunResult {
    this.emitPhase(input, 'assess', 'planner')

    this.bus.emit(
      createEvent({
        kind: 'tool.called',
        stage: 2,
        skin: input.skin,
        agent: 'planner',
        phase: 'assess',
        summary: 'planner → lookup_context',
        detail: { tool: 'lookup_context', args: { skin: input.skin } },
      }),
    )
    const ctx = callTool('lookup_context', { skin: input.skin })
    this.bus.emit(
      createEvent({
        kind: 'tool.result',
        stage: 2,
        skin: input.skin,
        agent: 'planner',
        summary: 'lookup_context returned facts',
        detail: { result: ctx },
      }),
    )

    this.bus.emit(
      createEvent({
        kind: 'tool.called',
        stage: 2,
        skin: input.skin,
        agent: 'planner',
        phase: 'assess',
        summary: 'planner → score_priority',
        detail: { tool: 'score_priority', args: { text: input.prompt } },
      }),
    )
    const score = callTool('score_priority', { text: input.prompt })
    this.bus.emit(
      createEvent({
        kind: 'tool.result',
        stage: 2,
        skin: input.skin,
        agent: 'planner',
        summary: 'score_priority returned band',
        detail: { result: score },
      }),
    )

    const facts =
      ctx.ok && ctx.data && typeof ctx.data === 'object'
        ? ((ctx.data as { facts: string[] }).facts ?? [])
        : []

    const plan = runPlanner(input.prompt, input.skin, facts)
    this.bus.publishAgentMessage('planner', plan.narrative, {
      stage: 2,
      skin: input.skin,
      phase: 'generate',
    })
    this.bus.publishAgentMessage(
      'planner',
      ['Plan:', ...plan.steps.map((s, i) => `${i + 1}. ${s}`)].join('\n'),
      { stage: 2, skin: input.skin, phase: 'navigate' },
    )

    this.bus.emit(
      createEvent({
        kind: 'action.proposed',
        stage: 2,
        skin: input.skin,
        agent: 'planner',
        summary: `Proposed: ${plan.proposedAction.title}`,
        detail: { action: plan.proposedAction },
      }),
    )

    // Stage 2 proposes but does not auto-execute multi-agent or gate —
    // single agent proposes after tool use.
    this.bus.publishSystem(
      'Stage 2 complete: one tool-using agent proposed a plan. No multi-agent coordination.',
    )
    this.bus.emit(
      createEvent({
        kind: 'run.completed',
        stage: 2,
        skin: input.skin,
        summary: 'Stage 2 complete — augmented proposal ready.',
      }),
    )
    return this.snapshot(
      plan.proposedAction,
      false,
      `Augmented mode: planner used tools and proposed "${plan.proposedAction.title}".`,
      { executed: false, stage: 2 },
    )
  }

  private runMultiAgent(input: RunInput): RunResult {
    const policy = getPolicy(input.stage)

    // Assess — Researcher
    this.emitPhase(input, 'assess', 'researcher')
    this.bus.emit(
      createEvent({
        kind: 'tool.called',
        stage: input.stage,
        skin: input.skin,
        agent: 'researcher',
        phase: 'assess',
        summary: 'researcher → lookup_context + score_priority',
      }),
    )
    const research = runResearcher(input.prompt, input.skin)
    this.bus.emit(
      createEvent({
        kind: 'tool.result',
        stage: input.stage,
        skin: input.skin,
        agent: 'researcher',
        summary: `Researcher found ${research.findings.length} facts`,
        detail: { findings: research.findings },
      }),
    )
    this.bus.publishAgentMessage('researcher', research.narrative, {
      stage: input.stage,
      skin: input.skin,
      phase: 'assess',
    })
    this.bus.publishAgentMessage(
      'researcher',
      ['Findings:', ...research.findings.map((f) => `• ${f}`)].join('\n'),
      { stage: input.stage, skin: input.skin, phase: 'assess' },
    )

    // Generate — Planner
    this.emitPhase(input, 'generate', 'planner')
    const plan = runPlanner(input.prompt, input.skin, research.findings)
    this.bus.publishAgentMessage('planner', plan.narrative, {
      stage: input.stage,
      skin: input.skin,
      phase: 'generate',
    })
    this.bus.publishAgentMessage(
      'planner',
      ['Coordinated plan:', ...plan.steps.map((s, i) => `${i + 1}. ${s}`)].join(
        '\n',
      ),
      { stage: input.stage, skin: input.skin, phase: 'generate' },
    )
    this.bus.emit(
      createEvent({
        kind: 'action.proposed',
        stage: input.stage,
        skin: input.skin,
        agent: 'planner',
        summary: `Proposed: ${plan.proposedAction.title}`,
        detail: { action: plan.proposedAction },
      }),
    )

    // Evaluate — Executor
    this.emitPhase(input, 'evaluate', 'executor')
    const exec = runExecutor(plan.proposedAction)
    this.bus.emit(
      createEvent({
        kind: 'tool.called',
        stage: input.stage,
        skin: input.skin,
        agent: 'executor',
        phase: 'evaluate',
        summary: 'executor → simulate_action',
        detail: { tool: 'simulate_action' },
      }),
    )
    this.bus.emit(
      createEvent({
        kind: 'tool.result',
        stage: input.stage,
        skin: input.skin,
        agent: 'executor',
        summary: 'simulate_action completed',
        detail: { simulation: exec.simulation },
      }),
    )
    this.bus.publishAgentMessage('executor', exec.narrative, {
      stage: input.stage,
      skin: input.skin,
      phase: 'evaluate',
    })
    this.bus.publishAgentMessage('executor', exec.evaluation, {
      stage: input.stage,
      skin: input.skin,
      phase: 'evaluate',
    })

    // Navigate / Track
    this.emitPhase(input, 'navigate', 'planner')
    this.bus.publishSystem(
      `Orchestrator coordinated ${policy.allowedRoles.length} specialists (researcher → planner → executor).`,
    )

    if (input.stage === 3) {
      return this.finalizeAction(input, plan.proposedAction, false, null)
    }

    // Stage 4 — policy gate + human override
    return this.runStage4Gate(input, plan.proposedAction)
  }

  private runStage4Gate(
    input: RunInput,
    action: ProposedAction,
  ): RunResult {
    // Enterprise Ops = rack-protection alpha: sensor → gate → shed (no human wait
    // on the breaker-critical path). Higher-Ed keeps classic override flow.
    if (input.skin === 'enterprise') {
      return this.runRackProtection(input, action)
    }

    const gate = evaluatePolicyGate(action)
    this.bus.emit(
      createEvent({
        kind: 'policy.check',
        stage: 4,
        skin: input.skin,
        summary: gate.allowed
          ? 'Policy gate: within envelope (still requires human override at Stage 4).'
          : `Policy gate: ${gate.reason}`,
        detail: { gate, action },
      }),
    )

    // Stage 4 (non-rack) always requires human override before final action,
    // even when automated gate would allow.
    const entry = this.audit.record({
      stage: 4,
      skin: input.skin,
      action: action.title,
      decision: 'blocked',
      actor: 'policy-gate',
      detail: gate.reason + ' Awaiting human override.',
    })
    this.bus.emit(
      createEvent({
        kind: 'audit.entry',
        stage: 4,
        skin: input.skin,
        summary: `Audit: blocked pending override — ${action.title}`,
        detail: { entry },
      }),
    )
    this.bus.emit(
      createEvent({
        kind: 'policy.blocked',
        stage: 4,
        skin: input.skin,
        summary: 'Final action paused for human override (Stage 4).',
      }),
    )
    this.bus.emit(
      createEvent({
        kind: 'human.override.requested',
        stage: 4,
        skin: input.skin,
        summary: `Override required for: ${action.title}`,
        detail: { action },
      }),
    )
    this.bus.publishSystem(
      'Stage 4: policy gate engaged. Approve or reject the proposed action to finish the run.',
    )

    const snap = this.snapshot(
      action,
      true,
      'Governed mode: multi-agent plan ready — waiting for human override.',
      { executed: false, stage: 4 },
    )
    this.pending = { input, proposedAction: action, messagesSnapshot: snap }
    return snap
  }

  /**
   * Soft-plant rack protection: instrumented sensor → Stage-4 gate → shed.
   * Governed auto within policy envelope (audit on); human override is not on
   * the breaker-critical path so trip-curve ms stay meaningful.
   */
  private runRackProtection(
    input: RunInput,
    action: ProposedAction,
  ): RunResult {
    const plant = createBreakerPlant()
    const runStart = nowMs()

    const sensorTs = nowMs()
    const reading = plant.readSensor(sensorTs - runStart)
    this.bus.emit(
      createEvent({
        kind: 'sensor.read',
        stage: 4,
        skin: input.skin,
        agent: 'researcher',
        phase: 'assess',
        summary: `Sensor: rack load ${reading.loadAmps} A / ${reading.breakerLimitAmps} A (headroom ${reading.headroomAmps} A, ~${reading.timeToTripMs} ms to trip)`,
        detail: { reading },
      }),
    )
    this.bus.publishSystem(
      `Rack sensor: ${reading.loadAmps} A rising toward ${reading.breakerLimitAmps} A breaker limit. Soft-plant time-to-trip ≈ ${reading.timeToTripMs} ms.`,
    )

    const gate = evaluatePolicyGate(action)
    const gateTs = nowMs()
    this.bus.emit(
      createEvent({
        kind: 'policy.check',
        stage: 4,
        skin: input.skin,
        summary: gate.allowed
          ? 'Policy gate: shed within envelope — auto-dispatch on breaker-critical path.'
          : `Policy gate: ${gate.reason}`,
        detail: { gate, action },
      }),
    )

    if (!gate.allowed) {
      const entry = this.audit.record({
        stage: 4,
        skin: input.skin,
        action: action.title,
        decision: 'blocked',
        actor: 'policy-gate',
        detail: gate.reason + ' Shed withheld.',
      })
      this.bus.emit(
        createEvent({
          kind: 'audit.entry',
          stage: 4,
          skin: input.skin,
          summary: `Audit: blocked — ${action.title}`,
          detail: { entry },
        }),
      )
      this.bus.emit(
        createEvent({
          kind: 'policy.blocked',
          stage: 4,
          skin: input.skin,
          summary: 'Shed blocked by policy — plant may trip if load keeps rising.',
        }),
      )
      this.bus.publishSystem(
        'Stage 4 rack path: policy blocked shed. Soft-plant would continue toward trip.',
      )
      this.bus.emit(
        createEvent({
          kind: 'run.completed',
          stage: 4,
          skin: input.skin,
          summary: 'Run completed — shed blocked by policy.',
        }),
      )
      this.pending = null
      return this.snapshot(
        action,
        false,
        'Governed rack path: policy blocked shed. No actuator dispatch.',
        { executed: false, stage: 4, latency: null },
      )
    }

    const delay = input.injectDelayMs ?? 0
    if (delay > 0) busyWaitMs(delay)

    this.emitPhase(input, 'track', 'executor')
    this.bus.emit(
      createEvent({
        kind: 'action.executed',
        stage: 4,
        skin: input.skin,
        agent: 'executor',
        summary: `Executed (simulated shed): ${action.title}`,
        detail: { action, rackProtection: true },
      }),
    )

    const robot = runRobot(action, input.skin)
    const shedTs = nowMs()
    const shed = plant.applyShed(SHED_REDUCTION_AMPS)
    const elapsed = shedTs - sensorTs
    // Honest soft-plant trip: shed after time-to-trip means the breaker would have opened.
    const tripped = elapsed >= reading.timeToTripMs

    this.bus.emit(
      createEvent({
        kind: 'tool.called',
        stage: 4,
        skin: input.skin,
        agent: 'robot',
        phase: 'track',
        summary: 'robot → dispatch_actuator (rack shed)',
        detail: { tool: 'dispatch_actuator', handoff: robot.handoff },
      }),
    )
    this.bus.emit(
      createEvent({
        kind: 'tool.result',
        stage: 4,
        skin: input.skin,
        agent: 'robot',
        summary: `Actuator ${robot.handoff.actuatorId} ${robot.handoff.status}`,
        detail: { handoff: robot.handoff, shed },
      }),
    )
    this.bus.publishAgentMessage('robot', robot.narrative, {
      stage: 4,
      skin: input.skin,
      phase: 'track',
    })

    const latency = buildLatencyReport({
      sensorTs,
      gateTs,
      shedTs,
      reading,
      tripBudgetMs: plant.tripBudgetMs,
      shedReductionAmps: SHED_REDUCTION_AMPS,
      loadAmpsAfterShed: shed.loadAmps,
      plantTripped: tripped,
    })

    this.bus.emit(
      createEvent({
        kind: 'breaker.latency',
        stage: 4,
        skin: input.skin,
        summary: tripped
          ? `Latency: sensor→shed ${latency.sensorToShedMs} ms — soft-plant TRIPPED (budget ${latency.tripBudgetMs} ms)`
          : `Latency: sensor→shed ${latency.sensorToShedMs} ms (gate ${latency.sensorToGateMs} + shed ${latency.gateToShedMs}) · within budget ${latency.withinBudget}`,
        detail: { latency },
      }),
    )

    this.audit.record({
      stage: 4,
      skin: input.skin,
      action: action.title,
      decision: 'allowed',
      actor: 'policy-gate+executor+robot',
      detail: tripped
        ? `Shed after trip window (${latency.sensorToShedMs} ms > ${latency.timeToTripMs} ms). Soft-plant tripped.`
        : `Shed before trip (${latency.sensorToShedMs} ms ≤ budget ${latency.tripBudgetMs} ms). Load now ${latency.loadAmpsAfterShed} A.`,
    })

    this.bus.publishSystem(
      tripped
        ? `Rack protection LATE: sensor→shed ${latency.sensorToShedMs} ms exceeded soft-plant trip window (${latency.timeToTripMs} ms). The rack would trip.`
        : `Rack never trips in this soft-plant run: agent shed in ${latency.sensorToShedMs} ms (budget ${latency.tripBudgetMs} ms). Load ${latency.loadAmpsAtSensor} A → ${latency.loadAmpsAfterShed} A.`,
    )

    this.bus.emit(
      createEvent({
        kind: 'run.completed',
        stage: 4,
        skin: input.skin,
        summary: tripped
          ? `Run completed — soft-plant trip (${latency.sensorToShedMs} ms)`
          : `Run completed — shed beat trip curve (${latency.sensorToShedMs} ms)`,
      }),
    )
    this.pending = null

    return this.snapshot(
      action,
      false,
      tripped
        ? `Soft-plant trip: shed at ${latency.sensorToShedMs} ms after sensor (window ${latency.timeToTripMs} ms).`
        : `Rack protected: sensor→gate ${latency.sensorToGateMs} ms · gate→shed ${latency.gateToShedMs} ms · total ${latency.sensorToShedMs} ms (budget ${latency.tripBudgetMs} ms).`,
      { executed: true, stage: 4, latency, overrideApproved: null },
    )
  }

  private finalizeAction(
    input: RunInput,
    action: ProposedAction,
    fromOverride: boolean,
    overrideApproved: boolean | null = null,
  ): RunResult {
    this.emitPhase(input, 'track', 'executor')
    this.bus.emit(
      createEvent({
        kind: 'action.executed',
        stage: input.stage,
        skin: input.skin,
        agent: 'executor',
        summary: `Executed (simulated): ${action.title}`,
        detail: { action, fromOverride },
      }),
    )
    this.bus.publishAgentMessage(
      'executor',
      `Tracking: "${action.title}" marked complete in the stub ledger. Monitor outcomes for 7 days.`,
      { stage: input.stage, skin: input.skin, phase: 'track' },
    )

    // Tri-agent physical-digital handoff: stub robot/actuator
    const robot = runRobot(action, input.skin)
    this.bus.emit(
      createEvent({
        kind: 'tool.called',
        stage: input.stage,
        skin: input.skin,
        agent: 'robot',
        phase: 'track',
        summary: 'robot → dispatch_actuator',
        detail: { tool: 'dispatch_actuator', handoff: robot.handoff },
      }),
    )
    this.bus.emit(
      createEvent({
        kind: 'tool.result',
        stage: input.stage,
        skin: input.skin,
        agent: 'robot',
        summary: `Actuator ${robot.handoff.actuatorId} ${robot.handoff.status}`,
        detail: { handoff: robot.handoff },
      }),
    )
    this.bus.publishAgentMessage('robot', robot.narrative, {
      stage: input.stage,
      skin: input.skin,
      phase: 'track',
    })

    if (input.stage === 4) {
      this.audit.record({
        stage: 4,
        skin: input.skin,
        action: action.title,
        decision: 'allowed',
        actor: fromOverride ? 'human+executor+robot' : 'executor+robot',
        detail: 'Simulated execution + actuator handoff recorded',
      })
    }

    this.bus.emit(
      createEvent({
        kind: 'run.completed',
        stage: input.stage,
        skin: input.skin,
        summary: `Run completed — ${action.title}`,
      }),
    )
    this.pending = null
    return this.snapshot(
      action,
      false,
      `Tri-agent run finished. Action "${action.title}" simulated with physical-digital handoff.`,
      { executed: true, overrideApproved },
    )
  }

  private emitPhase(
    input: RunInput,
    phase: import('./types').AgentPhase,
    agent: import('./types').AgentRole,
  ): void {
    this.bus.emit(
      createEvent({
        kind: 'phase.started',
        stage: input.stage,
        skin: input.skin,
        agent,
        phase,
        summary: `AGENT phase: ${phase.toUpperCase()} (${agent})`,
      }),
    )
  }

  private snapshot(
    proposedAction: ProposedAction | null,
    awaitingOverride: boolean,
    finalSummary: string,
    opts: {
      executed?: boolean
      overrideApproved?: boolean | null
      stage?: MaturityStage
      latency?: BreakerLatencyReport | null
    } = {},
  ): RunResult {
    const events = this.bus.getEvents()
    const audit = this.audit.list()
    const stage =
      opts.stage ??
      (events.find((e) => e.kind === 'run.started')?.stage as MaturityStage | undefined) ??
      1
    const metrics = evaluateRun({
      stage,
      events,
      audit,
      proposedAction,
      awaitingOverride,
      executed: opts.executed ?? false,
      overrideApproved: opts.overrideApproved ?? null,
    })
    let latency: BreakerLatencyReport | null =
      opts.latency !== undefined ? opts.latency : null
    if (latency === null) {
      const latEvent = events.find((e) => e.kind === 'breaker.latency')
      const detail = latEvent?.detail
      if (detail && typeof detail === 'object' && 'latency' in detail) {
        latency = detail.latency as BreakerLatencyReport
      }
    }
    return {
      messages: this.bus.getMessages(),
      events,
      audit,
      proposedAction,
      awaitingOverride,
      finalSummary,
      metrics,
      latency,
    }
  }
}

export function createOrchestrator(): Orchestrator {
  return new Orchestrator()
}

export function describeStageBehavior(stage: MaturityStage, skin: SkinId): string {
  const policy = getPolicy(stage)
  const s = getSkin(skin)
  return [
    `Skin: ${s.title}`,
    `Tools: ${policy.allowTools ? 'enabled' : 'disabled'}`,
    `Multi-agent: ${policy.multiAgent ? 'yes' : 'no'}`,
    `Policy gate: ${policy.requirePolicyGate ? 'yes' : 'no'}`,
    `Human override: ${policy.requireHumanOverride ? 'required' : 'not required'}`,
    `Audit: ${policy.auditEnabled ? 'on' : 'off'}`,
  ].join(' · ')
}
