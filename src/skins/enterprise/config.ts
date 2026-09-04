import type { ScenarioConfig } from '../../kernel/types'

export const enterpriseSkin: ScenarioConfig = {
  skin: 'enterprise',
  title: 'Enterprise Ops',
  subtitle: 'Revenue operations · pipeline recovery · accountable execution',
  promptPlaceholder: 'Describe an ops problem (e.g. West region pipeline down 12%)…',
  defaultPrompt:
    'West region pipeline velocity is down 12%. Propose a recovery play for AE/SDR handoffs and at-risk renewals.',
  contextLabel: 'Commercial context',
  actionVerb: 'Execute play',
  sampleFacts: [
    'Q3 pipeline velocity is down 12% vs plan in the West region.',
    'Top blocker: handoff lag between SDR and AE (avg 3.4 days).',
    'Competitor NovaCorp launched a mid-market bundle last month.',
  ],
}
