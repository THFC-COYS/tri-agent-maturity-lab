import type { AgentPhase, SkinId } from '../kernel/types'
import { callTool } from './tools'

export interface ResearcherOutput {
  phase: AgentPhase
  findings: string[]
  narrative: string
}

export function runResearcher(prompt: string, skin: SkinId): ResearcherOutput {
  const lookup = callTool('lookup_context', { skin })
  const facts =
    lookup.ok && lookup.data && typeof lookup.data === 'object'
      ? ((lookup.data as { facts: string[] }).facts ?? [])
      : []

  const scored = callTool('score_priority', { text: prompt })
  const band =
    scored.ok && scored.data && typeof scored.data === 'object'
      ? String((scored.data as { band: string }).band)
      : 'medium'

  const narrative =
    skin === 'highered'
      ? `Researcher assessed the advising/retention ask. Priority band: ${band}. Key campus signals pulled from context.`
      : `Researcher assessed the ops ask. Priority band: ${band}. Key commercial signals pulled from context.`

  return {
    phase: 'assess',
    findings: facts,
    narrative,
  }
}
