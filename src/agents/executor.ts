import type { AgentPhase, ProposedAction } from '../kernel/types'
import { callTool } from './tools'

export interface ExecutorOutput {
  phase: AgentPhase
  narrative: string
  simulation: unknown
  evaluation: string
}

export function runExecutor(action: ProposedAction): ExecutorOutput {
  const sim = callTool('simulate_action', { title: action.title })
  const evaluation =
    action.risk === 'high'
      ? 'Evaluate: high-risk — recommend human confirmation before live systems.'
      : 'Evaluate: within normal operating envelope — proceed with tracking.'

  return {
    phase: 'evaluate',
    narrative: `Executor simulated "${action.title}". Stub ticket created; no live side effects.`,
    simulation: sim.data,
    evaluation,
  }
}
