import type { AgentPhase, ProposedAction, SkinId } from '../kernel/types'
import { callTool } from './tools'

export interface PlannerOutput {
  phase: AgentPhase
  steps: string[]
  narrative: string
  proposedAction: ProposedAction
}

export function runPlanner(
  prompt: string,
  skin: SkinId,
  findings: string[],
): PlannerOutput {
  const plan = callTool('draft_plan', { goal: prompt, facts: findings })
  const steps =
    plan.ok && plan.data && typeof plan.data === 'object'
      ? ((plan.data as { steps: string[] }).steps ?? [])
      : ['Review request', 'Draft response', 'Confirm with owner']

  const highRisk =
    /irreversible|terminate|expel|fire|delete|purge/i.test(prompt) ||
    /urgent.*risk|critical/i.test(prompt)

  const proposedAction: ProposedAction = {
    id: `act-${skin}-plan`,
    title:
      skin === 'highered'
        ? 'Launch coordinated student outreach wave'
        : 'Launch coordinated pipeline recovery play',
    description:
      skin === 'highered'
        ? `Execute advising outreach for at-risk students based on: ${prompt.slice(0, 120)}`
        : `Execute revenue ops recovery based on: ${prompt.slice(0, 120)}`,
    risk: highRisk ? 'high' : findings.length > 2 ? 'medium' : 'low',
    reversible: !highRisk,
  }

  return {
    phase: 'generate',
    steps,
    narrative: `Planner generated a ${steps.length}-step plan and proposed "${proposedAction.title}" (risk: ${proposedAction.risk}).`,
    proposedAction,
  }
}
